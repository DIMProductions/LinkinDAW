#pragma once

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <windows.h>
#endif

#include "IPlug_include_in_plug_hdr.h"
#include "WebSocketServer.h"
#include "readerwriterqueue.h"

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace rtc {
class DataChannel;
class PeerConnection;
}

class NativeWebRtcPeer {
public:
  using TextHandler = std::function<void(const std::string&)>;
  using BinaryHandler = std::function<void(const float*, size_t)>;

  explicit NativeWebRtcPeer(TextHandler onText, BinaryHandler onBinary = nullptr);
  ~NativeWebRtcPeer();

  bool Start(const std::string& roomId, const std::string& signalingBase);
  void Stop();

  bool IsConnected() const;
  bool IsChannelOpen() const;
  int AckCount() const;
  std::string RoomId() const;

  void SendText(const std::string& payload);

  moodycamel::ReaderWriterQueue<iplug::IMidiMsg> mMidiOutQueue{512};
  moodycamel::ReaderWriterQueue<std::pair<int, double>> mParamOutQueue{128};
  moodycamel::ReaderWriterQueue<double> mSampleRateOutQueue{16};
  moodycamel::ReaderWriterQueue<DawTransportState> mTransportOutQueue{64};
  moodycamel::ReaderWriterQueue<std::string> mAxionStateOutQueue{8};

private:
  void Run();
  void PollOutbound();
  void SetupPeerFromOffer(const std::string& offerSdp);
  bool PollOffer(std::string& offerSdp);
  bool PostAnswer(const std::string& answerSdp);
  bool HttpGet(const std::string& pathAndQuery, std::string& body);
  bool HttpPostJson(const std::string& path, const std::string& body, std::string& responseBody);

  TextHandler mOnText;
  BinaryHandler mOnBinary;
  mutable std::mutex mMutex;
  std::condition_variable mCv;
  std::thread mThread;
  std::shared_ptr<rtc::PeerConnection> mPeerConnection;
  std::shared_ptr<rtc::DataChannel> mDataChannel;
  std::string mRoomId;
  std::string mSignalingBase;
  std::atomic<bool> mRunning{false};
  std::atomic<bool> mConnected{false};
  std::atomic<bool> mChannelOpen{false};
  std::atomic<int> mAckCount{0};
  int mAfterMessageId = 0;
};
