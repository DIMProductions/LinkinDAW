#pragma once

#include <asio.hpp>
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <thread>

class StaticFileServer
{
public:
  explicit StaticFileServer(std::string rootDir);
  ~StaticFileServer();

  bool Start(uint16_t port);
  void Stop();
  bool IsRunning() const;
  uint16_t Port() const;

private:
  using tcp = asio::ip::tcp;

  void AcceptLoop();
  void HandleClient(tcp::socket socket);
  std::string ResolvePath(const std::string& requestTarget) const;
  static std::string MimeType(const std::string& path);
  static std::string UrlDecode(const std::string& value);

  std::string mRootDir;
  std::unique_ptr<asio::io_context> mIo;
  std::unique_ptr<tcp::acceptor> mAcceptor;
  std::thread mThread;
  std::atomic<bool> mRunning{false};
  uint16_t mPort = 0;
};