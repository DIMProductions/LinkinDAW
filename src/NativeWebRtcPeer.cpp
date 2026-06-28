#include "NativeWebRtcPeer.h"
#include "LinkinDAW.h"
#include "rtc/rtc.hpp"

#include <nlohmann/json.hpp>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <windows.h>
#include <winhttp.h>
#endif

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <iterator>
#include <sstream>
#include <utility>

using json = nlohmann::json;
using namespace std::chrono_literals;

namespace {

std::wstring ToWide(const std::string& value)
{
#ifdef _WIN32
  if (value.empty()) return L"";
  const int len = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0);
  std::wstring out(static_cast<size_t>(len), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), out.data(), len);
  return out;
#else
  return std::wstring(value.begin(), value.end());
#endif
}

std::string JsonForMidi(const iplug::IMidiMsg& msg)
{
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

  return j.dump();
}

std::string JsonForParam(const std::pair<int, double>& paramData)
{
  json j;
  j["type"] = "param";

  if (paramData.first == kParam808Decay) j["id"] = "808_decay";
  else if (paramData.first == kParam808Dirt) j["id"] = "808_dirt";
  else if (paramData.first == kParam808Glide) j["id"] = "808_glide";
  else return {};

  j["value"] = paramData.second;
  j["source"] = "daw";
  return j.dump();
}

std::string JsonForSampleRate(double sampleRate)
{
  json j;
  j["type"] = "system";
  j["command"] = "set_samplerate";
  j["value"] = sampleRate;
  return j.dump();
}

std::string JsonForTransport(const DawTransportState& transport)
{
  json j;
  j["type"] = "system";
  j["command"] = "transport";
  j["value"] = {
    {"bpm", transport.bpm},
    {"playing", transport.playing},
    {"ppq", transport.ppq},
    {"samplePos", transport.samplePos}
  };
  return j.dump();
}

std::string JsonForAxionState(const std::string& axionState)
{
  if (axionState.empty()) return {};

  json j;
  j["type"] = "system";
  j["command"] = "load_axion_state";
  try {
    j["value"] = json::parse(axionState);
  } catch (...) {
    j["value"] = axionState;
  }
  return j.dump();
}

} // namespace

NativeWebRtcPeer::NativeWebRtcPeer(TextHandler onText, BinaryHandler onBinary)
: mOnText(std::move(onText))
, mOnBinary(std::move(onBinary))
{
}

NativeWebRtcPeer::~NativeWebRtcPeer()
{
  Stop();
}

bool NativeWebRtcPeer::Start(const std::string& roomId, const std::string& signalingBase)
{
  if (roomId.empty() || signalingBase.empty()) return false;
  Stop();
  mRoomId = roomId;
  mSignalingBase = signalingBase;
  mAfterMessageId = 0;
  mRunning.store(true);
  mConnected.store(false);
  mChannelOpen.store(false);
  mAckCount.store(0);
  mThread = std::thread(&NativeWebRtcPeer::Run, this);
  return true;
}

void NativeWebRtcPeer::Stop()
{
  mRunning.store(false);
  mCv.notify_all();
  if (mThread.joinable()) mThread.join();
  std::lock_guard<std::mutex> lock(mMutex);
  if (mDataChannel) {
    try { mDataChannel->close(); } catch (...) {}
    mDataChannel.reset();
  }
  if (mPeerConnection) {
    try { mPeerConnection->close(); } catch (...) {}
    mPeerConnection.reset();
  }
  mConnected.store(false);
  mChannelOpen.store(false);
}

bool NativeWebRtcPeer::IsConnected() const
{
  return mConnected.load();
}

bool NativeWebRtcPeer::IsChannelOpen() const
{
  return mChannelOpen.load();
}

int NativeWebRtcPeer::AckCount() const
{
  return mAckCount.load();
}

std::string NativeWebRtcPeer::RoomId() const
{
  return mRoomId;
}

void NativeWebRtcPeer::SendText(const std::string& payload)
{
  if (payload.empty() || !mChannelOpen.load()) return;
  std::shared_ptr<rtc::DataChannel> channel;
  {
    std::lock_guard<std::mutex> lock(mMutex);
    channel = mDataChannel;
  }
  if (channel) {
    try { channel->send(payload); } catch (...) {}
  }
}

void NativeWebRtcPeer::Run()
{
  rtc::InitLogger(rtc::LogLevel::Warning);

  while (mRunning.load()) {
    if (!mPeerConnection) {
      std::string offerSdp;
      if (PollOffer(offerSdp) && !offerSdp.empty()) {
        SetupPeerFromOffer(offerSdp);
      }
    }

    PollOutbound();
    std::unique_lock<std::mutex> lock(mMutex);
    mCv.wait_for(lock, 10ms, [&]() { return !mRunning.load(); });
  }
}

void NativeWebRtcPeer::PollOutbound()
{
  if (!mChannelOpen.load()) return;

  iplug::IMidiMsg midi;
  while (mMidiOutQueue.try_dequeue(midi)) {
    SendText(JsonForMidi(midi));
  }

  std::pair<int, double> paramData;
  while (mParamOutQueue.try_dequeue(paramData)) {
    SendText(JsonForParam(paramData));
  }

  double sampleRate = 0.0;
  while (mSampleRateOutQueue.try_dequeue(sampleRate)) {
    SendText(JsonForSampleRate(sampleRate));
  }

  DawTransportState transport;
  while (mTransportOutQueue.try_dequeue(transport)) {
    SendText(JsonForTransport(transport));
  }

  std::string axionState;
  while (mAxionStateOutQueue.try_dequeue(axionState)) {
    SendText(JsonForAxionState(axionState));
  }
}

void NativeWebRtcPeer::SetupPeerFromOffer(const std::string& offerSdp)
{
  auto pc = std::make_shared<rtc::PeerConnection>(rtc::Configuration{});
  bool gatheringComplete = false;
  std::mutex localMutex;
  std::condition_variable localCv;

  pc->onStateChange([this](rtc::PeerConnection::State state) {
    const bool connected = state == rtc::PeerConnection::State::Connected;
    const bool closed = state == rtc::PeerConnection::State::Closed || state == rtc::PeerConnection::State::Failed || state == rtc::PeerConnection::State::Disconnected;
    if (connected) mConnected.store(true);
    if (closed) {
      mConnected.store(false);
      mChannelOpen.store(false);
    }
  });

  pc->onGatheringStateChange([&](rtc::PeerConnection::GatheringState state) {
    if (state == rtc::PeerConnection::GatheringState::Complete) {
      std::lock_guard<std::mutex> lock(localMutex);
      gatheringComplete = true;
      localCv.notify_all();
    }
  });

  pc->onDataChannel([this](std::shared_ptr<rtc::DataChannel> incoming) {
    {
      std::lock_guard<std::mutex> lock(mMutex);
      mDataChannel = incoming;
    }

    incoming->onOpen([this]() {
      mChannelOpen.store(true);
      mConnected.store(true);
      PollOutbound();
    });

    incoming->onClosed([this]() {
      mChannelOpen.store(false);
    });

    incoming->onMessage([this](std::variant<rtc::binary, rtc::string> message) {
      if (std::holds_alternative<rtc::binary>(message)) {
        const rtc::binary& data = std::get<rtc::binary>(message);
        const size_t sampleCount = data.size() / sizeof(float);
        if (mOnBinary && sampleCount > 0) {
          mOnBinary(reinterpret_cast<const float*>(data.data()), sampleCount);
        }
        return;
      }

      const std::string text = std::get<rtc::string>(message);
      if (text.rfind("ack:", 0) == 0) {
        mAckCount.fetch_add(1);
      }
      if (mOnText) {
        mOnText(text);
      }
    });
  });

  try {
    pc->setRemoteDescription(rtc::Description(offerSdp, "offer"));
  } catch (...) {
    return;
  }

  {
    std::unique_lock<std::mutex> lock(localMutex);
    localCv.wait_for(lock, 10s, [&]() { return gatheringComplete; });
  }

  auto answer = pc->localDescription();
  if (!answer.has_value()) return;
  if (!PostAnswer(std::string(answer.value()))) return;

  std::lock_guard<std::mutex> lock(mMutex);
  mPeerConnection = pc;
}

bool NativeWebRtcPeer::PollOffer(std::string& offerSdp)
{
  if (mRoomId.empty()) return false;

  std::ostringstream path;
  path << "/rooms/" << mRoomId << "/messages?to=native&after=" << mAfterMessageId;

  std::string body;
  if (!HttpGet(path.str(), body)) return false;

  try {
    const json response = json::parse(body);
    for (const auto& message : response.value("messages", json::array())) {
      mAfterMessageId = std::max(mAfterMessageId, message.value("id", 0));
      if (message.value("kind", "") == "offer" && message.contains("sdp")) {
        offerSdp = message.value("sdp", "");
        return !offerSdp.empty();
      }
    }
  } catch (...) {
    return false;
  }

  return false;
}

bool NativeWebRtcPeer::PostAnswer(const std::string& answerSdp)
{
  if (mRoomId.empty()) return false;
  json message;
  message["from"] = "native";
  message["to"] = "browser";
  message["kind"] = "answer";
  message["sdp"] = answerSdp;

  std::string response;
  return HttpPostJson("/rooms/" + mRoomId + "/messages", message.dump(), response);
}

bool NativeWebRtcPeer::HttpGet(const std::string& pathAndQuery, std::string& body)
{
#ifdef _WIN32
  URL_COMPONENTSW parts{};
  parts.dwStructSize = sizeof(parts);
  wchar_t host[256]{};
  wchar_t path[2048]{};
  wchar_t extra[2048]{};
  parts.lpszHostName = host;
  parts.dwHostNameLength = static_cast<DWORD>(std::size(host));
  parts.lpszUrlPath = path;
  parts.dwUrlPathLength = static_cast<DWORD>(std::size(path));
  parts.lpszExtraInfo = extra;
  parts.dwExtraInfoLength = static_cast<DWORD>(std::size(extra));
  std::wstring base = ToWide(mSignalingBase + pathAndQuery);
  if (!WinHttpCrackUrl(base.c_str(), static_cast<DWORD>(base.size()), 0, &parts)) return false;

  HINTERNET session = WinHttpOpen(L"LinkinDAW/Phase-AudioReturn-1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) return false;
  HINTERNET connect = WinHttpConnect(session, std::wstring(parts.lpszHostName, parts.dwHostNameLength).c_str(), parts.nPort, 0);
  if (!connect) { WinHttpCloseHandle(session); return false; }
  const DWORD flags = parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  const std::wstring requestPath = std::wstring(parts.lpszUrlPath, parts.dwUrlPathLength) + std::wstring(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  HINTERNET request = WinHttpOpenRequest(connect, L"GET", requestPath.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!request) { WinHttpCloseHandle(connect); WinHttpCloseHandle(session); return false; }

  bool ok = false;
  if (WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) && WinHttpReceiveResponse(request, nullptr)) {
    DWORD size = 0;
    do {
      if (!WinHttpQueryDataAvailable(request, &size) || size == 0) break;
      std::string chunk(size, '\0');
      DWORD read = 0;
      if (!WinHttpReadData(request, chunk.data(), size, &read)) break;
      chunk.resize(read);
      body += chunk;
    } while (size > 0);
    ok = true;
  }
  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);
  return ok;
#else
  (void)pathAndQuery;
  (void)body;
  return false;
#endif
}

bool NativeWebRtcPeer::HttpPostJson(const std::string& pathValue, const std::string& payload, std::string& responseBody)
{
#ifdef _WIN32
  URL_COMPONENTSW parts{};
  parts.dwStructSize = sizeof(parts);
  wchar_t host[256]{};
  wchar_t path[2048]{};
  wchar_t extra[2048]{};
  parts.lpszHostName = host;
  parts.dwHostNameLength = static_cast<DWORD>(std::size(host));
  parts.lpszUrlPath = path;
  parts.dwUrlPathLength = static_cast<DWORD>(std::size(path));
  parts.lpszExtraInfo = extra;
  parts.dwExtraInfoLength = static_cast<DWORD>(std::size(extra));
  std::wstring base = ToWide(mSignalingBase + pathValue);
  if (!WinHttpCrackUrl(base.c_str(), static_cast<DWORD>(base.size()), 0, &parts)) return false;

  HINTERNET session = WinHttpOpen(L"LinkinDAW/Phase-AudioReturn-1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) return false;
  HINTERNET connect = WinHttpConnect(session, std::wstring(parts.lpszHostName, parts.dwHostNameLength).c_str(), parts.nPort, 0);
  if (!connect) { WinHttpCloseHandle(session); return false; }
  const DWORD flags = parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  const std::wstring requestPath = std::wstring(parts.lpszUrlPath, parts.dwUrlPathLength) + std::wstring(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  HINTERNET request = WinHttpOpenRequest(connect, L"POST", requestPath.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  if (!request) { WinHttpCloseHandle(connect); WinHttpCloseHandle(session); return false; }

  const std::wstring headers = L"Content-Type: application/json\r\n";
  bool ok = false;
  if (WinHttpSendRequest(request, headers.c_str(), static_cast<DWORD>(headers.size()), const_cast<char*>(payload.data()), static_cast<DWORD>(payload.size()), static_cast<DWORD>(payload.size()), 0) && WinHttpReceiveResponse(request, nullptr)) {
    DWORD size = 0;
    do {
      if (!WinHttpQueryDataAvailable(request, &size) || size == 0) break;
      std::string chunk(size, '\0');
      DWORD read = 0;
      if (!WinHttpReadData(request, chunk.data(), size, &read)) break;
      chunk.resize(read);
      responseBody += chunk;
    } while (size > 0);
    ok = true;
  }
  WinHttpCloseHandle(request);
  WinHttpCloseHandle(connect);
  WinHttpCloseHandle(session);
  return ok;
#else
  (void)pathValue;
  (void)payload;
  (void)responseBody;
  return false;
#endif
}
