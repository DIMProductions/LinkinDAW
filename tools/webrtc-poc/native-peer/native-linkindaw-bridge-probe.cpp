#include "rtc/rtc.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <variant>
#include <vector>

using namespace std::chrono_literals;

namespace {

std::string readFile(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    throw std::runtime_error("Could not open input file: " + path.string());
  }
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

void writeFile(const std::filesystem::path& path, const std::string& value) {
  std::ofstream out(path, std::ios::binary | std::ios::trunc);
  if (!out) {
    throw std::runtime_error("Could not open output file: " + path.string());
  }
  out << value;
}

std::string jsonEscape(const std::string& value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (char c : value) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          out += " ";
        } else {
          out += c;
        }
    }
  }
  return out;
}

std::string stateToString(rtc::PeerConnection::State state) {
  std::ostringstream ss;
  ss << state;
  return ss.str();
}


std::string truncateForLog(const std::string& value) {
  constexpr size_t kMaxLogChars = 240;
  if (value.size() <= kMaxLogChars) return value;
  return value.substr(0, kMaxLogChars) + "...";
}
std::string gatheringToString(rtc::PeerConnection::GatheringState state) {
  std::ostringstream ss;
  ss << state;
  return ss.str();
}

std::vector<std::string> linkinDawProbeMessages() {
  return {
    R"({"type":"system","command":"transport","value":{"bpm":128.0,"playing":true,"ppq":4.0,"samplePos":96000.0}})",
    R"({"type":"midi","status":144,"statusMsg":9,"channel":0,"data1":60,"data2":100,"offset":0,"note":60,"velocity":100,"velocityNorm":0.7874015748})",
    R"({"type":"midi","status":128,"statusMsg":8,"channel":0,"data1":60,"data2":0,"offset":240,"note":60,"velocity":0,"velocityNorm":0.0})",
    R"({"type":"system","command":"transport","value":{"bpm":128.0,"playing":false,"ppq":4.5,"samplePos":108000.0}})"
  };
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 4) {
    std::cerr << "Usage: linkindaw-native-bridge-probe <offer.sdp> <answer.sdp> <result.json>\n";
    return 2;
  }

  const std::filesystem::path offerPath = argv[1];
  const std::filesystem::path answerPath = argv[2];
  const std::filesystem::path resultPath = argv[3];

  std::vector<std::string> log;
  std::mutex mutex;
  std::condition_variable cv;
  bool gatheringComplete = false;
  bool channelOpen = false;
  int ackCount = 0;
  std::string lastState = "new";
  std::string lastGathering = "new";
  std::shared_ptr<rtc::DataChannel> dataChannel;

  try {
    rtc::InitLogger(rtc::LogLevel::Warning);

    rtc::Configuration config;
    auto pc = std::make_shared<rtc::PeerConnection>(config);

    pc->onStateChange([&](rtc::PeerConnection::State state) {
      std::lock_guard<std::mutex> lock(mutex);
      lastState = stateToString(state);
      log.push_back("state:" + lastState);
      cv.notify_all();
    });

    pc->onGatheringStateChange([&](rtc::PeerConnection::GatheringState state) {
      std::lock_guard<std::mutex> lock(mutex);
      lastGathering = gatheringToString(state);
      log.push_back("gathering:" + lastGathering);
      if (state == rtc::PeerConnection::GatheringState::Complete) {
        gatheringComplete = true;
      }
      cv.notify_all();
    });

    pc->onDataChannel([&](std::shared_ptr<rtc::DataChannel> incoming) {
      {
        std::lock_guard<std::mutex> lock(mutex);
        dataChannel = incoming;
        log.push_back("datachannel:" + incoming->label());
      }
      cv.notify_all();

      incoming->onOpen([&, incoming]() {
        {
          std::lock_guard<std::mutex> innerLock(mutex);
          channelOpen = true;
          log.push_back("channel:open");
        }

        int index = 0;
        for (const auto& message : linkinDawProbeMessages()) {
          incoming->send(message);
          {
            std::lock_guard<std::mutex> innerLock(mutex);
            log.push_back("tx:" + std::to_string(index));
          }
          ++index;
          std::this_thread::sleep_for(20ms);
        }
        cv.notify_all();
      });

      incoming->onClosed([&]() {
        std::lock_guard<std::mutex> innerLock(mutex);
        log.push_back("channel:closed");
        cv.notify_all();
      });

      incoming->onMessage([&](std::variant<rtc::binary, rtc::string> message) {
        if (!std::holds_alternative<rtc::string>(message)) {
          return;
        }
        const auto text = std::get<rtc::string>(message);
        {
          std::lock_guard<std::mutex> innerLock(mutex);
          log.push_back("rx:" + truncateForLog(text));
          if (text.rfind("ack:", 0) == 0) {
            ++ackCount;
          }
        }
        cv.notify_all();
      });
    });

    const auto offer = readFile(offerPath);
    pc->setRemoteDescription(rtc::Description(offer, "offer"));

    {
      std::unique_lock<std::mutex> lock(mutex);
      cv.wait_for(lock, 10s, [&]() { return gatheringComplete; });
    }

    auto localDescription = pc->localDescription();
    if (!localDescription.has_value()) {
      throw std::runtime_error("Native bridge probe did not produce a local answer");
    }
    writeFile(answerPath, std::string(localDescription.value()));

    {
      std::unique_lock<std::mutex> lock(mutex);
      cv.wait_for(lock, 15s, [&]() { return ackCount >= 4; });
    }

    const bool ok = channelOpen && ackCount >= 4;
    std::ostringstream result;
    result << "{\n";
    result << "  \"ok\": " << (ok ? "true" : "false") << ",\n";
    result << "  \"state\": \"" << jsonEscape(lastState) << "\",\n";
    result << "  \"gatheringState\": \"" << jsonEscape(lastGathering) << "\",\n";
    result << "  \"channelOpen\": " << (channelOpen ? "true" : "false") << ",\n";
    result << "  \"ackCount\": " << ackCount << ",\n";
    result << "  \"log\": [";
    for (size_t i = 0; i < log.size(); ++i) {
      if (i != 0) result << ", ";
      result << "\"" << jsonEscape(log[i]) << "\"";
    }
    result << "]\n";
    result << "}\n";
    writeFile(resultPath, result.str());

    if (dataChannel) {
      dataChannel->close();
    }
    pc->close();
    return ok ? 0 : 1;
  } catch (const std::exception& error) {
    std::ostringstream result;
    result << "{\n  \"ok\": false,\n  \"error\": \"" << jsonEscape(error.what()) << "\"\n}\n";
    try {
      writeFile(resultPath, result.str());
    } catch (...) {
    }
    std::cerr << error.what() << "\n";
    return 1;
  }
}


