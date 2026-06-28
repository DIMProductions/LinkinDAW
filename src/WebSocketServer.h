#pragma once

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>
#include <thread>
#include <memory>
#include <atomic>
#include <string>
#include <set>
#include <asio.hpp>

#include "readerwriterqueue.h"
#include "IPlug_include_in_plug_hdr.h"

class LinkinDAW;

typedef websocketpp::server<websocketpp::config::asio> server;

struct DawTransportState {
    double bpm = 120.0;
    bool playing = false;
    double ppq = 0.0;
    double samplePos = 0.0;
};

class WebSocketServer {
public:
    WebSocketServer(LinkinDAW* plugin, moodycamel::ReaderWriterQueue<float>& audioQueue);
    ~WebSocketServer();

    bool Start(uint16_t port);
    void Stop();
    bool IsConnected() const;

    // DAWからWebへMIDIを送るためのキュー
    moodycamel::ReaderWriterQueue<iplug::IMidiMsg> mMidiOutQueue;

    // DAWからWebへパラメータを送るためのキュー
    moodycamel::ReaderWriterQueue<std::pair<int, double>> mParamOutQueue{128};

    // DAWからWebへサンプルレート変更を通知するためのキュー
    moodycamel::ReaderWriterQueue<double> mSampleRateOutQueue{16};

    // DAWからWebへテンポ/トランスポートを通知するためのキュー
    moodycamel::ReaderWriterQueue<DawTransportState> mTransportOutQueue{64};

    // DAW/Host state restoreからWebへAxion状態を戻すためのキュー
    moodycamel::ReaderWriterQueue<std::string> mAxionStateOutQueue{8};

private:
    void RunASIO();
    void PollMidiOut(const asio::error_code& e);

    void OnOpen(websocketpp::connection_hdl hdl);
    void OnClose(websocketpp::connection_hdl hdl);
    void OnMessage(websocketpp::connection_hdl hdl, server::message_ptr msg);
    void SendToMain(const std::string& payload);
    void Broadcast(const std::string& payload);
    bool IsMainClient(websocketpp::connection_hdl hdl) const;

    LinkinDAW* mPlugin;
    moodycamel::ReaderWriterQueue<float>& mAudioQueue;

    server mServer;
    std::thread mServerThread;
    
    // Main client receives audio/state traffic; monitor clients receive broadcast DAW events.
    websocketpp::connection_hdl mActiveConnection;
    std::set<websocketpp::connection_hdl, std::owner_less<websocketpp::connection_hdl>> mClients;
    bool mHasMainClient = false;
    std::atomic<bool> mIsConnected;

    // キュー監視用タイマー
    std::unique_ptr<asio::steady_timer> mTimer;
};
