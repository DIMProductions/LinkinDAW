#include "WebSocketServer.h"
#include "LinkinDAW.h"
#include <nlohmann/json.hpp>
#include <iostream>

using json = nlohmann::json;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

WebSocketServer::WebSocketServer(LinkinDAW* plugin, moodycamel::ReaderWriterQueue<float>& audioQueue)
    : mPlugin(plugin)
    , mAudioQueue(audioQueue)
    , mIsConnected(false)
{
    // ASIOの初期化
    mServer.init_asio();

    // ログ出力を無効化（パフォーマンス向上のため）
    mServer.clear_access_channels(websocketpp::log::alevel::all);
    mServer.clear_error_channels(websocketpp::log::elevel::all);

    // コールバックの登録
    mServer.set_open_handler(bind(&WebSocketServer::OnOpen, this, _1));
    mServer.set_close_handler(bind(&WebSocketServer::OnClose, this, _1));
    mServer.set_message_handler(bind(&WebSocketServer::OnMessage, this, _1, _2));
}

WebSocketServer::~WebSocketServer()
{
    Stop();
}

bool WebSocketServer::Start(uint16_t port)
{
    try {
        mServer.listen(port);
        mServer.start_accept();

        // MIDI監視用タイマーの起動 (1ms間隔)
        mTimer = std::make_unique<asio::steady_timer>(mServer.get_io_service(), asio::chrono::milliseconds(1));
        mTimer->async_wait(bind(&WebSocketServer::PollMidiOut, this, _1));

        // バックグラウンドスレッドでASIOイベントループを起動
        mServerThread = std::thread(&WebSocketServer::RunASIO, this);
        return true;
    } catch (...) {
        mIsConnected = false;
        return false;
    }
}

void WebSocketServer::Stop()
{
    if (mTimer) {
        asio::error_code ec;
        mTimer->cancel(ec);
    }
    mServer.stop();
    mClients.clear();
    mHasMainClient = false;
    if (mServerThread.joinable()) {
        mServerThread.join();
    }
    mIsConnected = false;
}

bool WebSocketServer::IsConnected() const
{
    return mIsConnected.load();
}
bool WebSocketServer::IsMainClient(websocketpp::connection_hdl hdl) const
{
    if (!mHasMainClient) return false;
    std::owner_less<websocketpp::connection_hdl> less;
    return !less(hdl, mActiveConnection) && !less(mActiveConnection, hdl);
}

void WebSocketServer::SendToMain(const std::string& payload)
{
    if (!mHasMainClient) return;

    websocketpp::lib::error_code ec;
    mServer.send(mActiveConnection, payload, websocketpp::frame::opcode::text, ec);
}

void WebSocketServer::Broadcast(const std::string& payload)
{
    for (const auto& client : mClients) {
        websocketpp::lib::error_code ec;
        mServer.send(client, payload, websocketpp::frame::opcode::text, ec);
    }
}

void WebSocketServer::RunASIO()
{
    mServer.run();
}

void WebSocketServer::PollMidiOut(const asio::error_code& e)
{
    if (e) return; // キャンセルされた場合など

    iplug::IMidiMsg msg;
    // キューに溜まっているMIDIメッセージを全て処理
    while (mMidiOutQueue.try_dequeue(msg)) {
        if (mIsConnected.load()) {
            json j;
            j["type"] = "midi";
            j["status"] = msg.mStatus;
            j["statusMsg"] = msg.StatusMsg();
            j["channel"] = msg.Channel();
            j["data1"] = msg.mData1;
            j["data2"] = msg.mData2;
            j["offset"] = msg.mOffset;

            if (msg.StatusMsg() == iplug::IMidiMsg::kNoteOn || msg.StatusMsg() == iplug::IMidiMsg::kNoteOff) {
                j["note"] = msg.NoteNumber();
                j["velocity"] = msg.Velocity();
                j["velocityNorm"] = msg.Velocity() / 127.0;
            } else if (msg.StatusMsg() == iplug::IMidiMsg::kPitchWheel) {
                j["pitchBend"] = msg.PitchWheel();
            } else if (msg.StatusMsg() == iplug::IMidiMsg::kControlChange) {
                j["cc"] = msg.ControlChangeIdx();
                j["value"] = msg.mData2;
                j["valueNorm"] = msg.mData2 / 127.0;
            }
            
            Broadcast(j.dump());
        }
    }

    std::pair<int, double> paramData;
    while (mParamOutQueue.try_dequeue(paramData)) {
        if (mIsConnected.load()) {
            json j;
            j["type"] = "param";
            
            // Map parameter indices to string IDs
            if (paramData.first == kParam808Decay) j["id"] = "808_decay";
            else if (paramData.first == kParam808Dirt) j["id"] = "808_dirt";
            else if (paramData.first == kParam808Glide) j["id"] = "808_glide";
            else continue; // Unknown parameter

            j["value"] = paramData.second;
            j["source"] = "daw";
            
            SendToMain(j.dump());
        }
    }

    double sampleRate;
    while (mSampleRateOutQueue.try_dequeue(sampleRate)) {
        if (mIsConnected.load()) {
            json j;
            j["type"] = "system";
            j["command"] = "set_samplerate";
            j["value"] = sampleRate;

            SendToMain(j.dump());
        }
    }

    DawTransportState transport;
    while (mTransportOutQueue.try_dequeue(transport)) {
        if (mIsConnected.load()) {
            json j;
            j["type"] = "system";
            j["command"] = "transport";
            j["value"] = {
                {"bpm", transport.bpm},
                {"playing", transport.playing},
                {"ppq", transport.ppq},
                {"samplePos", transport.samplePos}
            };

            Broadcast(j.dump());
        }
    }

    std::string axionState;
    while (mAxionStateOutQueue.try_dequeue(axionState)) {
        if (mIsConnected.load() && !axionState.empty()) {
            json j;
            j["type"] = "system";
            j["command"] = "load_axion_state";
            try {
                j["value"] = json::parse(axionState);
            } catch (...) {
                j["value"] = axionState;
            }

            SendToMain(j.dump());
        }
    }
    // 次回のポーリングをスケジュール
    mTimer->expires_from_now(std::chrono::milliseconds(1));
    mTimer->async_wait(std::bind(&WebSocketServer::PollMidiOut, this, std::placeholders::_1));
}

void WebSocketServer::OnOpen(websocketpp::connection_hdl hdl)
{
    mClients.insert(hdl);
    // In the current alpha, the most recently opened WebApp is the active instrument.
    // Older clients can still receive broadcast MIDI/transport, but cannot send audio/state.
    mActiveConnection = hdl;
    mHasMainClient = true;
    if (mPlugin) {
        mPlugin->SetEngineRunning(false);
    }
    mIsConnected = !mClients.empty();

    if (mPlugin) {
        json j;
        j["type"] = "system";
        j["command"] = "set_samplerate";
        j["value"] = mPlugin->GetSampleRate();

        websocketpp::lib::error_code ec;
        mServer.send(hdl, j.dump(), websocketpp::frame::opcode::text, ec);

        if (IsMainClient(hdl)) {
            const std::string axionState = mPlugin->GetAxionStateJson();
            if (!axionState.empty()) {
                json stateMessage;
                stateMessage["type"] = "system";
                stateMessage["command"] = "load_axion_state";
                try {
                    stateMessage["value"] = json::parse(axionState);
                } catch (...) {
                    stateMessage["value"] = axionState;
                }
                mServer.send(hdl, stateMessage.dump(), websocketpp::frame::opcode::text, ec);
            }
        }
    }
}

void WebSocketServer::OnClose(websocketpp::connection_hdl hdl)
{
    const bool closingMain = IsMainClient(hdl);
    mClients.erase(hdl);
    mIsConnected = !mClients.empty();

    if (closingMain) {
        mHasMainClient = !mClients.empty();
        if (mHasMainClient) {
            mActiveConnection = *mClients.begin();
        }
        if (mPlugin) {
            mPlugin->SetEngineRunning(false);
        }
    }
}

void WebSocketServer::OnMessage(websocketpp::connection_hdl hdl, server::message_ptr msg)
{
    if (!IsMainClient(hdl)) return;

    if (msg->get_opcode() == websocketpp::frame::opcode::binary) {
        // オーディオPCMデータの受信 (WASMのFloat32Array)
        const std::string& payload = msg->get_payload();
        const float* data = reinterpret_cast<const float*>(payload.data());
        size_t numSamples = payload.size() / sizeof(float);
        
        if (mPlugin && numSamples > 0) {
            mPlugin->QueueAudioSamples(data, numSamples);
        } else {
            for (size_t i = 0; i < numSamples; ++i) {
                mAudioQueue.try_enqueue(data[i]);
            }
        }
    }
    else if (msg->get_opcode() == websocketpp::frame::opcode::text) {
        // MIDI JSONデータの受信
        try {
            json j = json::parse(msg->get_payload());
            if (j.contains("type") && j["type"] == "midi") {
                iplug::IMidiMsg midiMsg;
                int status = j.value("status", 0);
                int data1 = j.value("data1", 0);
                int data2 = j.value("data2", 0);
                
                midiMsg.mStatus = status;
                midiMsg.mData1 = data1;
                midiMsg.mData2 = data2;
                midiMsg.mOffset = 0;
                mPlugin->SendMidiMsg(midiMsg);
            }
            else if (j.contains("type") && j["type"] == "param") {
                if (j.value("source", "") == "web") {
                    std::string id = j.value("id", "");
                    double value = j.value("value", 0.0);
                    int paramIdx = -1;
                    
                    if (id == "808_dirt" || id == "dirt") paramIdx = kParam808Dirt;
                    else if (id == "808_decay" || id == "decay") paramIdx = kParam808Decay;
                    else if (id == "808_glide" || id == "glide") paramIdx = kParam808Glide;
                    
                    if (paramIdx >= 0) {
                        mPlugin->mParamInQueue.try_enqueue({paramIdx, value});
                    }
                }
            }
            else if (j.contains("type") && j["type"] == "system") {
                const std::string command = j.value("command", "");
                if (command == "engine_status" && mPlugin) {
                    const std::string value = j.value("value", "");
                    mPlugin->SetEngineRunning(value == "streaming");
                } else if (command == "app_title" && mPlugin) {
                    mPlugin->SetWebAppName(j.value("value", "Unknown"));
                } else if ((command == "save_axion_state" || command == "axion_state") && mPlugin && j.contains("value")) {
                    const json& value = j["value"];
                    if (value.is_string()) {
                        mPlugin->SetAxionStateJson(value.get<std::string>());
                    } else {
                        mPlugin->SetAxionStateJson(value.dump());
                    }
                }
            }
        }
        catch (const std::exception& e) {
            // リアルタイムシステムのためパースエラーは無視（必要に応じてロギング）
        }
    }
}
