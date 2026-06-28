#pragma once

#ifdef _WIN32
#include <winsock2.h>
#include <windows.h>
#endif

#include "IPlug_include_in_plug_hdr.h"
#include "readerwriterqueue.h"
#include <atomic>
#include <cstdint>
#include <cstddef>
#include <memory>
#include <mutex>
#include <string>

class WebSocketServer; // 前方宣言
class NativeWebRtcPeer;

const int MAX_BUFFER_SAMPLES = 48000 * 2;

enum EParams
{
  kParam808Decay = 0,
  kParam808Dirt,
  kParam808Glide,
  kNumParams
};

class LinkinDAW final : public iplug::Plugin
{
public:
  LinkinDAW(const iplug::InstanceInfo& info);
  ~LinkinDAW();

  void ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int nFrames) override;
  void ProcessMidiMsg(const iplug::IMidiMsg& msg) override;
  void OnParamChange(int paramIdx) override;
  void OnIdle() override;
  void OnReset() override;
  bool SerializeState(iplug::IByteChunk& chunk) const override;
  int UnserializeState(const iplug::IByteChunk& chunk, int startPos) override;

  bool IsWebConnected() const;
  bool IsMidiReceiving() const;
  bool IsAudioStreaming() const;
  bool IsEngineRunning() const;
  double CurrentTempo() const;
  bool TransportPlaying() const;
  const char* StateLabel() const;
  std::string LastParamLabel() const;
  void SetLastParamActivity(const std::string& source, int paramIdx, double value);
  void MarkAudioReceived();
  void SetEngineRunning(bool running);
  void SetAxionStateJson(const std::string& json);
  std::string GetAxionStateJson() const;
  void SetWebAppName(const std::string& name);
  std::string GetWebAppName() const;
  uint16_t GetWebSocketPort() const;
  std::string GetWebSocketAddress() const;
  std::string GetWebRtcAddress() const;
  std::string GetWebRtcRoomId() const;
  void ToggleTargetApp();
  std::string GetTargetAppId() const;
  std::string GetTargetAppLabel() const;
  void OpenWebApp();
  void ReconnectWebSocket();
  void HandleWebTextMessage(const std::string& payload);
  void QueueAudioSamples(const float* samples, size_t sampleCount);
  void ClearAudioReturnQueue();

  moodycamel::ReaderWriterQueue<std::pair<int, double>> mParamInQueue{128};

private:
  moodycamel::ReaderWriterQueue<float> mAudioQueue{MAX_BUFFER_SAMPLES};
  bool mAudioStreamPrimed = false;
  float mLastOutputLeft = 0.0f;
  float mLastOutputRight = 0.0f;
  std::unique_ptr<WebSocketServer> mWebSocketServer;
  std::unique_ptr<NativeWebRtcPeer> mWebRtcPeer;
  mutable std::mutex mWebSocketMutex;
  std::atomic<uint64_t> mLastMidiMs{0};
  std::atomic<uint64_t> mLastAudioMs{0};
  std::atomic<bool> mEngineRunning{false};
  mutable std::mutex mStateMutex;
  std::string mAxionStateJson;
  std::string mWebAppName = "Waiting";
  std::string mLastParamLabel = "Idle";
  uint16_t mWebSocketPort = 0;
  std::string mWebRtcRoomId;
  bool mUseEnigmaApp = false;
  uint64_t mLastTransportSentMs = 0;
  double mLastTransportBpm = -1.0;
  double mLastTransportPpq = -1.0;
  double mLastTransportSamplePos = -1.0;
  bool mLastTransportPlaying = false;

  bool StartWebSocketServer();
  bool StartWebRtcPeer(bool newRoom);
  static std::string GenerateRoomId();
  static uint64_t NowMs();
};
