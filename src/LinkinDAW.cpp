#include "LinkinDAW.h"
#include "IPlug_include_in_plug_src.h"
#include "WebSocketServer.h"
#include "StaticFileServer.h"
#include "NativeWebRtcPeer.h"
#include <nlohmann/json.hpp>

#if IPLUG_EDITOR
#include "IControl.h"
#endif

#include <cstdio>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <string>
#include <random>
#include <sstream>
#include <vector>

#if IPLUG_EDITOR
namespace {

using namespace iplug;
using namespace igraphics;

namespace UiTheme {
  const IColor Bg(255, 13, 15, 19);
  const IColor Panel(255, 22, 25, 31);
  const IColor PanelSoft(255, 27, 31, 38);
  const IColor Row(255, 30, 34, 42);
  const IColor RowAlt(255, 25, 29, 36);
  const IColor Border(255, 57, 63, 75);
  const IColor BorderSoft(255, 40, 45, 55);
  const IColor Text(255, 232, 236, 243);
  const IColor Muted(255, 144, 153, 166);
  const IColor Button(255, 43, 49, 60);
  const IColor ButtonHover(255, 58, 67, 82);
  const IColor ButtonDown(255, 35, 40, 49);
  const IColor Green(255, 59, 214, 111);
  const IColor Red(255, 255, 82, 82);
  const IColor Amber(255, 246, 190, 86);

  constexpr float Pad = 18.f;
  constexpr float Radius = 6.f;
  constexpr float RowH = 30.f;
  constexpr float Gap = 8.f;
}

struct UiTextSet
{
  IText Title {25.f, UiTheme::Text, nullptr, EAlign::Near, EVAlign::Middle};
  IText Label {12.f, UiTheme::Muted, nullptr, EAlign::Near, EVAlign::Middle};
  IText Value {13.5f, UiTheme::Text, nullptr, EAlign::Far, EVAlign::Middle};
  IText Pill {12.5f, UiTheme::Text, nullptr, EAlign::Center, EVAlign::Middle};
  IText Button {13.5f, UiTheme::Text, nullptr, EAlign::Center, EVAlign::Middle};
  IText Section {11.f, UiTheme::Muted, nullptr, EAlign::Near, EVAlign::Middle};
};

class LinkinDAWStatusControl final : public IControl
{
public:
  LinkinDAWStatusControl(const IRECT& bounds, LinkinDAW& plugin)
  : IControl(bounds)
  , mPlugin(plugin)
  {
  }

  void Draw(IGraphics& g) override
  {
    g.FillRect(UiTheme::Bg, mRECT);
    mPanel = mRECT.GetPadded(-18.f);
    DrawPanel(g, mPanel);
    DrawHeader(g, mPanel);
    DrawConnectionBlock(g, mPanel);
    DrawDawBlock(g, mPanel);
    DrawActions(g, mPanel);
    SetDirty(false);
  }

  void OnMouseDown(float x, float y, const IMouseMod& mod) override
  {
    mMouseDown = true;
    mLastMouseX = x;
    mLastMouseY = y;

    if (mOpenButton.Contains(x, y)) {
      mPlugin.OpenWebApp();
    } else if (mReconnectButton.Contains(x, y)) {
      mPlugin.ReconnectWebSocket();
    }

    SetDirty(false);
  }

  void OnMouseUp(float x, float y, const IMouseMod& mod) override
  {
    mMouseDown = false;
    SetDirty(false);
  }

  void OnMouseOver(float x, float y, const IMouseMod& mod) override
  {
    IControl::OnMouseOver(x, y, mod);
    mLastMouseX = x;
    mLastMouseY = y;
    SetDirty(false);
  }

  void OnMouseOut() override
  {
    IControl::OnMouseOut();
    mLastMouseX = -1.f;
    mLastMouseY = -1.f;
    mMouseDown = false;
    SetDirty(false);
  }

  bool IsDirty() override
  {
    return true;
  }

private:
  void DrawPanel(IGraphics& g, const IRECT& panel)
  {
    g.FillRoundRect(UiTheme::Panel, panel, UiTheme::Radius + 1.f);
    g.DrawRoundRect(UiTheme::Border, panel, UiTheme::Radius + 1.f, nullptr, 1.f);
    g.DrawLine(UiTheme::BorderSoft, panel.L, panel.T + 62.f, panel.R, panel.T + 62.f, nullptr, 1.f);
  }

  void DrawHeader(IGraphics& g, const IRECT& panel)
  {
    const bool connected = mPlugin.IsWebConnected();
    const IColor statusColor = connected ? UiTheme::Green : UiTheme::Red;
    const IRECT titleRect(panel.L + UiTheme::Pad, panel.T + 14.f, panel.R - 150.f, panel.T + 50.f);
    g.DrawText(mText.Title, "LinkinDAW", titleRect);
    DrawStatusPill(g, IRECT(panel.R - 145.f, panel.T + 20.f, panel.R - UiTheme::Pad, panel.T + 46.f), connected ? "Connected" : "Disconnected", statusColor);
  }

  void DrawConnectionBlock(IGraphics& g, const IRECT& panel)
  {
    float y = panel.T + 80.f;
    DrawSectionLabel(g, "CONNECTION", y);
    y += 20.f;
    const std::string webAppName = mPlugin.GetWebAppName();
    DrawRow(g, "Connected App", webAppName.c_str(), y, UiTheme::Text, false);
    y += UiTheme::RowH + UiTheme::Gap;
    const std::string address = mPlugin.GetWebRtcAddress();
    DrawRow(g, "Address", address.c_str(), y, UiTheme::Text, false);
    y += UiTheme::RowH + UiTheme::Gap;
    DrawRow(g, "MIDI", mPlugin.IsMidiReceiving() ? "Receiving" : "Idle", y, mPlugin.IsMidiReceiving() ? UiTheme::Green : UiTheme::Muted, true);
    y += UiTheme::RowH + UiTheme::Gap;
    DrawRow(g, "Engine", mPlugin.IsEngineRunning() ? "Engine Running" : "Waiting for Web UI", y, mPlugin.IsEngineRunning() ? UiTheme::Green : UiTheme::Amber, false);
  }
  void DrawDawBlock(IGraphics& g, const IRECT& panel)
  {
    char tempo[32];
    std::snprintf(tempo, sizeof(tempo), "%.1f BPM", mPlugin.CurrentTempo());

    float y = panel.T + 304.f;
    DrawSectionLabel(g, "DAW", y);
    y += 20.f;
    DrawRow(g, "Tempo", tempo, y, UiTheme::Text, true);
    y += UiTheme::RowH + UiTheme::Gap;
    DrawRow(g, "Transport", mPlugin.TransportPlaying() ? "Playing" : "Stopped", y, mPlugin.TransportPlaying() ? UiTheme::Green : UiTheme::Muted, false);
    y += UiTheme::RowH + UiTheme::Gap;
    DrawRow(g, "State", mPlugin.StateLabel(), y, mPlugin.IsWebConnected() ? UiTheme::Green : UiTheme::Amber, true);
    y += UiTheme::RowH + UiTheme::Gap;
    const std::string lastParam = mPlugin.LastParamLabel();
    DrawRow(g, "Last Param", lastParam.c_str(), y, UiTheme::Text, false);
  }

  void DrawActions(IGraphics& g, const IRECT& panel)
  {
    const float y = panel.B - 44.f;
    const float gap = 10.f;
    const float w = (panel.W() - (UiTheme::Pad * 2.f) - gap) * 0.5f;

    mOpenButton = IRECT(panel.L + UiTheme::Pad, y, panel.L + UiTheme::Pad + w, y + 30.f);
    mReconnectButton = IRECT(mOpenButton.R + gap, y, panel.R - UiTheme::Pad, y + 30.f);
    DrawButton(g, mOpenButton, "Open Web App");
    DrawButton(g, mReconnectButton, "Reconnect");
  }
  void DrawSectionLabel(IGraphics& g, const char* label, float y)
  {
    const IRECT rect(mPanel.L + UiTheme::Pad, y, mPanel.R - UiTheme::Pad, y + 16.f);
    g.DrawText(mText.Section, label, rect);
  }

  void DrawRow(IGraphics& g, const char* label, const char* value, float y, const IColor& valueColor, bool alt)
  {
    const IRECT row(mPanel.L + UiTheme::Pad, y, mPanel.R - UiTheme::Pad, y + UiTheme::RowH);
    g.FillRoundRect(alt ? UiTheme::RowAlt : UiTheme::Row, row, 5.f);
    g.DrawRoundRect(UiTheme::BorderSoft, row, 5.f, nullptr, 1.f);
    g.DrawText(mText.Label, label, IRECT(row.L + 12.f, row.T, row.L + 128.f, row.B));
    g.DrawText(mText.Value.WithFGColor(valueColor), value, IRECT(row.L + 128.f, row.T, row.R - 12.f, row.B));
  }

  void DrawStatusPill(IGraphics& g, const IRECT& bounds, const char* label, const IColor& color)
  {
    g.FillRoundRect(UiTheme::PanelSoft, bounds, 5.f);
    g.DrawRoundRect(color, bounds, 5.f, nullptr, 1.f);
    g.FillCircle(color, bounds.L + 13.f, bounds.MH(), 3.5f);
    g.DrawText(mText.Pill.WithFGColor(color), label, IRECT(bounds.L + 18.f, bounds.T, bounds.R - 8.f, bounds.B));
  }

  void DrawButton(IGraphics& g, const IRECT& bounds, const char* label)
  {
    const bool hover = mMouseIsOver && bounds.Contains(mLastMouseX, mLastMouseY);
    const bool down = mMouseDown && hover;
    g.FillRoundRect(down ? UiTheme::ButtonDown : (hover ? UiTheme::ButtonHover : UiTheme::Button), bounds, 5.f);
    g.DrawRoundRect(hover ? UiTheme::Border : UiTheme::BorderSoft, bounds, 5.f, nullptr, 1.f);
    g.DrawText(mText.Button, label, bounds);
  }

  LinkinDAW& mPlugin;
  UiTextSet mText;
  IRECT mPanel;
  IRECT mOpenButton;
  IRECT mReconnectButton;
  float mLastMouseX = -1.f;
  float mLastMouseY = -1.f;
  bool mMouseDown = false;
};

} // namespace
#endif

namespace {

using json = nlohmann::json;

const char* ParamDisplayName(int paramIdx)
{
  if (paramIdx == kParam808Decay) return "808 Decay";
  if (paramIdx == kParam808Dirt) return "808 Dirt";
  if (paramIdx == kParam808Glide) return "808 Glide";
  return "Unknown";
}

constexpr uint16_t kStaticWebPort = 18080;
constexpr const char* kCloudWebAppProbeUrl = "https://dim.productions/linkindaw-launch/";
constexpr const char* kCloudSignalingUrl = "https://dim.productions/linkindaw-signal";
std::mutex gStaticFileServerMutex;
std::unique_ptr<StaticFileServer> gStaticFileServer;
int gStaticFileServerRefs = 0;

std::string WebAppDistDir()
{
#ifdef LINKINDAW_WEBAPP_DIST_DIR
  return LINKINDAW_WEBAPP_DIST_DIR;
#else
  return "WebApp/dist";
#endif
}

void AcquireStaticFileServer()
{
  std::lock_guard<std::mutex> lock(gStaticFileServerMutex);
  ++gStaticFileServerRefs;

  if (!gStaticFileServer) {
    auto server = std::make_unique<StaticFileServer>(WebAppDistDir());
    if (server->Start(kStaticWebPort)) {
      gStaticFileServer = std::move(server);
    }
  }
}

void ReleaseStaticFileServer()
{
  std::lock_guard<std::mutex> lock(gStaticFileServerMutex);
  if (gStaticFileServerRefs > 0) --gStaticFileServerRefs;

  if (gStaticFileServerRefs == 0 && gStaticFileServer) {
    gStaticFileServer->Stop();
    gStaticFileServer.reset();
  }
}


#ifdef _WIN32
bool FileExists(const std::string& path)
{
  if (path.empty()) return false;
  const DWORD attrs = GetFileAttributesA(path.c_str());
  return attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY);
}

std::string EnvPath(const char* name, const char* suffix)
{
  char buffer[MAX_PATH] = {};
  const DWORD len = GetEnvironmentVariableA(name, buffer, static_cast<DWORD>(sizeof(buffer)));
  if (len == 0 || len >= sizeof(buffer)) return {};
  std::string path(buffer);
  if (!path.empty() && path.back() != '\\' && path.back() != '/') path += "\\";
  path += suffix;
  return path;
}

std::string ExpandRegistryPath(const char* value)
{
  if (!value || !value[0]) return {};
  char expanded[MAX_PATH] = {};
  const DWORD len = ExpandEnvironmentStringsA(value, expanded, static_cast<DWORD>(sizeof(expanded)));
  if (len > 0 && len < sizeof(expanded)) return expanded;
  return value;
}

std::string QueryChromeAppPath(HKEY root)
{
  constexpr const char* subkey = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe";
  HKEY key = nullptr;
  if (RegOpenKeyExA(root, subkey, 0, KEY_QUERY_VALUE, &key) != ERROR_SUCCESS) return {};

  char buffer[MAX_PATH] = {};
  DWORD type = 0;
  DWORD size = sizeof(buffer);
  const LSTATUS status = RegQueryValueExA(key, nullptr, nullptr, &type, reinterpret_cast<LPBYTE>(buffer), &size);
  RegCloseKey(key);

  if (status != ERROR_SUCCESS || (type != REG_SZ && type != REG_EXPAND_SZ)) return {};
  const std::string path = type == REG_EXPAND_SZ ? ExpandRegistryPath(buffer) : std::string(buffer);
  return FileExists(path) ? path : std::string{};
}

std::string FindChromeExecutable()
{
  const std::vector<std::string> candidates = {
    EnvPath("ProgramFiles", "Google\\Chrome\\Application\\chrome.exe"),
    EnvPath("ProgramFiles(x86)", "Google\\Chrome\\Application\\chrome.exe"),
  };

  for (const auto& candidate : candidates) {
    if (FileExists(candidate)) return candidate;
  }

  if (const std::string hkcu = QueryChromeAppPath(HKEY_CURRENT_USER); !hkcu.empty()) return hkcu;
  if (const std::string hklm = QueryChromeAppPath(HKEY_LOCAL_MACHINE); !hklm.empty()) return hklm;
  return {};
}

bool LaunchChromeUrl(const std::string& url)
{
  const std::string chromePath = FindChromeExecutable();
  if (chromePath.empty()) return false;

  const HINSTANCE result = ShellExecuteA(nullptr, "open", chromePath.c_str(), url.c_str(), nullptr, SW_SHOWNORMAL);
  return reinterpret_cast<INT_PTR>(result) > 32;
}
#endif

} // namespace

LinkinDAW::LinkinDAW(const iplug::InstanceInfo& info)
: iplug::Plugin(info, iplug::MakeConfig(kNumParams, 1))
{
  GetParam(kParam808Decay)->InitDouble("808 Decay", 0.68, 0.0, 1.0, 0.001);
  GetParam(kParam808Dirt)->InitDouble("808 Dirt / Drive", 0.85, 0.0, 1.0, 0.001);
  GetParam(kParam808Glide)->InitDouble("808 Glide", 0.30, 0.0, 1.0, 0.001);

  AcquireStaticFileServer();
  mWebRtcRoomId = GenerateRoomId();
  StartWebSocketServer();
  StartWebRtcPeer(false);

#if IPLUG_EDITOR
  mMakeGraphicsFunc = [&]() {
    return iplug::igraphics::MakeGraphics(*this, PLUG_WIDTH, PLUG_HEIGHT, PLUG_FPS, GetScaleForScreen(PLUG_WIDTH, PLUG_HEIGHT));
  };

  mLayoutFunc = [&](iplug::igraphics::IGraphics* pGraphics) {
    pGraphics->AttachPanelBackground(UiTheme::Bg);
    pGraphics->EnableMouseOver(true);
    pGraphics->LoadFont("Roboto-Regular", "Segoe UI", iplug::igraphics::ETextStyle::Normal);
    pGraphics->AttachControl(new LinkinDAWStatusControl(pGraphics->GetBounds(), *this));
  };
#endif
}

LinkinDAW::~LinkinDAW()
{
  if (mWebRtcPeer) {
    mWebRtcPeer->Stop();
  }
  if (mWebSocketServer) {
    mWebSocketServer->Stop();
  }
  ReleaseStaticFileServer();
}

void LinkinDAW::ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int nFrames)
{
  const int numChannels = NOutChansConnected();
  constexpr size_t kStartThresholdSamples = 8192; // interleaved samples, about 85 ms at 48 kHz stereo

  if (!mAudioStreamPrimed && mAudioQueue.size_approx() >= kStartThresholdSamples) {
    mAudioStreamPrimed = true;
  }

  for (int s = 0; s < nFrames; ++s) {
    float left = 0.0f;
    float right = 0.0f;

    if (mAudioStreamPrimed && mAudioQueue.try_dequeue(left)) {
      if (!mAudioQueue.try_dequeue(right)) right = left;
      mLastOutputLeft = left;
      mLastOutputRight = right;
    } else {
      // On WebRTC jitter/underrun, do not repeat the previous 808 sample.
      // Repeating a low-frequency tail sounds like a short pulse in FL Studio.
      mAudioStreamPrimed = false;
      mLastOutputLeft = 0.0f;
      mLastOutputRight = 0.0f;
      left = 0.0f;
      right = 0.0f;
    }

    if (!std::isfinite(left)) left = 0.0f;
    if (!std::isfinite(right)) right = 0.0f;
    left = std::max(-1.0f, std::min(1.0f, left));
    right = std::max(-1.0f, std::min(1.0f, right));

    if (numChannels > 0) outputs[0][s] = left;
    if (numChannels > 1) outputs[1][s] = right;
  }
}
void LinkinDAW::ProcessMidiMsg(const iplug::IMidiMsg& msg)
{
  mLastMidiMs.store(NowMs());
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  if (mWebSocketServer) {
    mWebSocketServer->mMidiOutQueue.try_enqueue(msg);
  }
  if (mWebRtcPeer) {
    mWebRtcPeer->mMidiOutQueue.try_enqueue(msg);
  }
}

void LinkinDAW::OnParamChange(int paramIdx)
{
  double value = GetParam(paramIdx)->Value();
  SetLastParamActivity("DAW TX", paramIdx, value);
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  if (mWebSocketServer) {
    mWebSocketServer->mParamOutQueue.try_enqueue({paramIdx, value});
  }
  if (mWebRtcPeer) {
    mWebRtcPeer->mParamOutQueue.try_enqueue({paramIdx, value});
  }
}

void LinkinDAW::OnIdle()
{
  std::pair<int, double> paramData;
  while (mParamInQueue.try_dequeue(paramData)) {
    SetLastParamActivity("WEB APPLY", paramData.first, paramData.second);
    const double normalizedValue = std::max(0.0, std::min(1.0, paramData.second));
    BeginInformHostOfParamChangeFromUI(paramData.first);
    SetParameterValue(paramData.first, normalizedValue);
    EndInformHostOfParamChangeFromUI(paramData.first);
  }

  const uint64_t now = NowMs();
  const double bpm = GetTempo();
  const bool playing = GetTransportIsRunning();
  const double ppq = GetPPQPos();
  const double samplePos = GetSamplePos();
  const double sampleRate = GetSampleRate();
  const bool changed = std::fabs(bpm - mLastTransportBpm) > 0.01
    || playing != mLastTransportPlaying
    || std::fabs(ppq - mLastTransportPpq) > 0.02
    || std::fabs(samplePos - mLastTransportSamplePos) > sampleRate * 0.05;

  if (changed || (now - mLastTransportSentMs) >= 250) {
    std::lock_guard<std::mutex> lock(mWebSocketMutex);
    if (mWebSocketServer) {
      mWebSocketServer->mTransportOutQueue.try_enqueue({bpm, playing, ppq, samplePos});
    }
    if (mWebRtcPeer) {
      mWebRtcPeer->mTransportOutQueue.try_enqueue({bpm, playing, ppq, samplePos});
    }
    mLastTransportSentMs = now;
    mLastTransportBpm = bpm;
    mLastTransportPlaying = playing;
    mLastTransportPpq = ppq;
    mLastTransportSamplePos = samplePos;
  }

#if IPLUG_EDITOR
  if (GetUI()) {
    GetUI()->SetAllControlsDirty();
  }
#endif
}

void LinkinDAW::OnReset()
{
  double sampleRate = GetSampleRate();
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  if (mWebSocketServer) {
    mWebSocketServer->mSampleRateOutQueue.try_enqueue(sampleRate);
  }
  if (mWebRtcPeer) {
    mWebRtcPeer->mSampleRateOutQueue.try_enqueue(sampleRate);
  }
}

bool LinkinDAW::SerializeState(iplug::IByteChunk& chunk) const
{
  std::string stateJson;
  {
    std::lock_guard<std::mutex> lock(mStateMutex);
    stateJson = mAxionStateJson;
  }

  chunk.PutStr(stateJson.c_str());
  return SerializeParams(chunk);
}

int LinkinDAW::UnserializeState(const iplug::IByteChunk& chunk, int startPos)
{
  WDL_String stateJson;
  int pos = chunk.GetStr(stateJson, startPos);
  if (pos < 0) {
    return UnserializeParams(chunk, startPos);
  }

  {
    std::lock_guard<std::mutex> lock(mStateMutex);
    mAxionStateJson = stateJson.Get();
  }

  
  if (stateJson.GetLength() > 0) {
    std::lock_guard<std::mutex> lock(mWebSocketMutex);
    if (mWebSocketServer) {
      mWebSocketServer->mAxionStateOutQueue.try_enqueue(stateJson.Get());
    }
    if (mWebRtcPeer) {
      mWebRtcPeer->mAxionStateOutQueue.try_enqueue(stateJson.Get());
    }
  }

  return UnserializeParams(chunk, pos);
}

bool LinkinDAW::IsWebConnected() const
{
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  const bool wsConnected = mWebSocketServer && mWebSocketServer->IsConnected();
  const bool rtcConnected = mWebRtcPeer && mWebRtcPeer->IsChannelOpen();
  return wsConnected || rtcConnected;
}

bool LinkinDAW::IsMidiReceiving() const
{
  const uint64_t last = mLastMidiMs.load();
  return last != 0 && (NowMs() - last) < 700;
}

bool LinkinDAW::IsAudioStreaming() const
{
  const uint64_t last = mLastAudioMs.load();
  return last != 0 && (NowMs() - last) < 700;
}

bool LinkinDAW::IsEngineRunning() const
{
  return mEngineRunning.load();
}

double LinkinDAW::CurrentTempo() const
{
  return GetTempo();
}

bool LinkinDAW::TransportPlaying() const
{
  return GetTransportIsRunning();
}

const char* LinkinDAW::StateLabel() const
{
  bool hasAxionState = false;
  {
    std::lock_guard<std::mutex> lock(mStateMutex);
    hasAxionState = !mAxionStateJson.empty();
  }
  if (hasAxionState) return IsWebConnected() ? "Synced" : "Stored";
  return "Unsaved";
}

std::string LinkinDAW::LastParamLabel() const
{
  std::lock_guard<std::mutex> lock(mStateMutex);
  return mLastParamLabel;
}

void LinkinDAW::SetLastParamActivity(const std::string& source, int paramIdx, double value)
{
  char label[96];
  std::snprintf(label, sizeof(label), "%s -> %s %.3f", source.c_str(), ParamDisplayName(paramIdx), value);
  std::lock_guard<std::mutex> lock(mStateMutex);
  mLastParamLabel = label;
}

void LinkinDAW::MarkAudioReceived()
{
  mLastAudioMs.store(NowMs());
  mEngineRunning.store(true);
}

void LinkinDAW::ClearAudioReturnQueue()
{
  float dropped = 0.0f;
  while (mAudioQueue.try_dequeue(dropped)) {}
  mAudioStreamPrimed = false;
  mLastOutputLeft = 0.0f;
  mLastOutputRight = 0.0f;
}
void LinkinDAW::QueueAudioSamples(const float* samples, size_t sampleCount)
{
  if (!samples || sampleCount == 0) return;

  if (sampleCount == 128) {
    for (size_t i = 0; i < sampleCount; ++i) {
      mAudioQueue.try_enqueue(samples[i]);
      mAudioQueue.try_enqueue(samples[i]);
    }
  } else {
    for (size_t i = 0; i < sampleCount; ++i) {
      mAudioQueue.try_enqueue(samples[i]);
    }
  }

  constexpr size_t kMaxBufferedSamples = 32768;
  constexpr size_t kTargetBufferedSamples = 16384;
  if (mAudioQueue.size_approx() > kMaxBufferedSamples) {
    float dropped = 0.0f;
    while (mAudioQueue.size_approx() > kTargetBufferedSamples && mAudioQueue.try_dequeue(dropped)) {}
  }

  MarkAudioReceived();
}

void LinkinDAW::SetEngineRunning(bool running)
{
  mEngineRunning.store(running);
}

void LinkinDAW::SetAxionStateJson(const std::string& json)
{
  std::lock_guard<std::mutex> lock(mStateMutex);
  if (mAxionStateJson == json) return;
  mAxionStateJson = json;
}

std::string LinkinDAW::GetAxionStateJson() const
{
  std::lock_guard<std::mutex> lock(mStateMutex);
  return mAxionStateJson;
}

void LinkinDAW::SetWebAppName(const std::string& name)
{
  std::lock_guard<std::mutex> lock(mStateMutex);
  mWebAppName = name.empty() ? "Unknown" : name.substr(0, 48);
}

std::string LinkinDAW::GetWebAppName() const
{
  std::lock_guard<std::mutex> lock(mStateMutex);
  return mWebAppName;
}

uint16_t LinkinDAW::GetWebSocketPort() const
{
  return mWebSocketPort;
}

std::string LinkinDAW::GetWebSocketAddress() const
{
  if (mWebSocketPort == 0) return "Unavailable";

  char address[64];
  std::snprintf(address, sizeof(address), "ws://127.0.0.1:%u", static_cast<unsigned int>(mWebSocketPort));
  return address;
}

std::string LinkinDAW::GetWebRtcAddress() const
{
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  if (mWebRtcRoomId.empty()) return GetWebSocketAddress();

  char address[128];
  std::snprintf(address, sizeof(address), "webrtc:%s", mWebRtcRoomId.c_str());
  return address;
}

std::string LinkinDAW::GetWebRtcRoomId() const
{
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  return mWebRtcRoomId;
}

bool LinkinDAW::StartWebSocketServer()
{
  constexpr uint16_t kFirstPort = 8080;
  constexpr uint16_t kLastPort = 8099;

  for (uint16_t port = kFirstPort; port <= kLastPort; ++port) {
    auto server = std::make_unique<WebSocketServer>(this, mAudioQueue);
    if (server->Start(port)) {
      mWebSocketServer = std::move(server);
      mWebSocketPort = port;
      return true;
    }
  }

  mWebSocketServer.reset();
  mWebSocketPort = 0;
  return false;
}

bool LinkinDAW::StartWebRtcPeer(bool newRoom)
{
  if (newRoom || mWebRtcRoomId.empty()) {
    mWebRtcRoomId = GenerateRoomId();
  }

  auto peer = std::make_unique<NativeWebRtcPeer>([this](const std::string& payload) {
    HandleWebTextMessage(payload);
  }, [this](const float* samples, size_t sampleCount) {
    QueueAudioSamples(samples, sampleCount);
  });

  const bool started = peer->Start(mWebRtcRoomId, kCloudSignalingUrl);
  if (started) {
    ClearAudioReturnQueue();
    peer->mSampleRateOutQueue.try_enqueue(GetSampleRate());
    peer->mTransportOutQueue.try_enqueue({GetTempo(), GetTransportIsRunning(), GetPPQPos(), GetSamplePos()});
    for (int paramIdx = 0; paramIdx < kNumParams; ++paramIdx) {
      peer->mParamOutQueue.try_enqueue({paramIdx, GetParam(paramIdx)->Value()});
    }
    const std::string axionState = GetAxionStateJson();
    if (!axionState.empty()) {
      peer->mAxionStateOutQueue.try_enqueue(axionState);
    }
    mWebRtcPeer = std::move(peer);
  }
  return started;
}

void LinkinDAW::OpenWebApp()
{
#ifdef _WIN32
  {
    std::lock_guard<std::mutex> lock(mWebSocketMutex);
    if (mWebRtcPeer) {
      mWebRtcPeer->Stop();
      mWebRtcPeer.reset();
    }
    StartWebRtcPeer(true);
  }

  const std::string roomId = GetWebRtcRoomId();
  char url[512];
  std::snprintf(url, sizeof(url), "%s?linkindaw=webrtc&room=%s", kCloudWebAppProbeUrl, roomId.c_str());
  if (!LaunchChromeUrl(url)) {
    ShellExecuteA(nullptr, "open", url, nullptr, nullptr, SW_SHOWNORMAL);
  }
#endif
}

void LinkinDAW::ReconnectWebSocket()
{
#ifdef _WIN32
  {
    std::lock_guard<std::mutex> lock(mWebSocketMutex);

    if (mWebSocketServer) {
      mWebSocketServer->Stop();
    }
    if (mWebRtcPeer) {
      mWebRtcPeer->Stop();
      mWebRtcPeer.reset();
    }

    ClearAudioReturnQueue();
    StartWebSocketServer();
    StartWebRtcPeer(true);
  }

  const std::string roomId = GetWebRtcRoomId();
  char url[512];
  std::snprintf(url, sizeof(url), "%s?linkindaw=webrtc&room=%s", kCloudWebAppProbeUrl, roomId.c_str());
  if (!LaunchChromeUrl(url)) {
    ShellExecuteA(nullptr, "open", url, nullptr, nullptr, SW_SHOWNORMAL);
  }
#else
  std::lock_guard<std::mutex> lock(mWebSocketMutex);
  if (mWebSocketServer) mWebSocketServer->Stop();
  if (mWebRtcPeer) {
    mWebRtcPeer->Stop();
    mWebRtcPeer.reset();
  }
  ClearAudioReturnQueue();
  StartWebSocketServer();
  StartWebRtcPeer(true);
#endif
}
void LinkinDAW::HandleWebTextMessage(const std::string& payload)
{
  if (payload.rfind("ack:", 0) == 0) return;

  try {
    json j = json::parse(payload);
    if (j.contains("type") && j["type"] == "param") {
      if (j.value("source", "") == "web") {
        const std::string id = j.value("id", "");
        const double value = j.value("value", 0.0);
        int paramIdx = -1;
        if (id == "808_dirt" || id == "dirt") paramIdx = kParam808Dirt;
        else if (id == "808_decay" || id == "decay") paramIdx = kParam808Decay;
        else if (id == "808_glide" || id == "glide") paramIdx = kParam808Glide;
        if (paramIdx >= 0) {
          SetLastParamActivity("WEB RX", paramIdx, value);
          mParamInQueue.try_enqueue({paramIdx, value});
        }
      }
    } else if (j.contains("type") && j["type"] == "system") {
      const std::string command = j.value("command", "");
      if (command == "engine_status") {
        const std::string value = j.value("value", "");
        SetEngineRunning(value == "streaming");
      } else if (command == "app_title") {
        SetWebAppName(j.value("value", "Unknown"));
      } else if (command == "webapp_ready") {
        std::string appName = "Unknown WebApp";
        if (j.contains("value")) {
          const json& value = j["value"];
          if (value.is_object() && value.contains("app") && value["app"].is_string()) {
            appName = value["app"].get<std::string>();
          } else if (value.is_string()) {
            appName = value.get<std::string>();
          }
        }
        SetWebAppName(appName);
      } else if ((command == "save_axion_state" || command == "axion_state") && j.contains("value")) {
        const json& value = j["value"];
        if (value.is_string()) SetAxionStateJson(value.get<std::string>());
        else SetAxionStateJson(value.dump());
      }
    }
  } catch (...) {
  }
}

std::string LinkinDAW::GenerateRoomId()
{
  std::random_device rd;
  const uint64_t now = NowMs();
  const uint64_t entropy = (static_cast<uint64_t>(rd()) << 32) ^ static_cast<uint64_t>(rd());
  std::ostringstream ss;
  ss << "linkindaw-" << std::hex << now << "-" << entropy;
  return ss.str();
}

uint64_t LinkinDAW::NowMs()
{
  using namespace std::chrono;
  return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}
