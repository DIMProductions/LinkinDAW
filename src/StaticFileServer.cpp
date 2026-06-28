#include "StaticFileServer.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <vector>

namespace {

std::string NormalizeSlashes(std::string value)
{
  std::replace(value.begin(), value.end(), '\\', '/');
  while (!value.empty() && value.back() == '/') value.pop_back();
  return value;
}

bool HasExtension(const std::string& path)
{
  const size_t slash = path.find_last_of('/');
  const size_t dot = path.find_last_of('.');
  return dot != std::string::npos && (slash == std::string::npos || dot > slash);
}

void WriteResponse(asio::ip::tcp::socket& socket, const std::string& status, const std::string& contentType, const std::vector<char>& body)
{
  std::ostringstream header;
  header << "HTTP/1.1 " << status << "\r\n"
         << "Content-Length: " << body.size() << "\r\n"
         << "Content-Type: " << contentType << "\r\n"
         << "Cache-Control: no-cache\r\n"
         << "Connection: close\r\n\r\n";

  asio::error_code ec;
  asio::write(socket, asio::buffer(header.str()), ec);
  if (!ec && !body.empty()) {
    asio::write(socket, asio::buffer(body.data(), body.size()), ec);
  }
}

void WriteTextResponse(asio::ip::tcp::socket& socket, const std::string& status, const std::string& text)
{
  const std::vector<char> body(text.begin(), text.end());
  WriteResponse(socket, status, "text/plain; charset=utf-8", body);
}

} // namespace

StaticFileServer::StaticFileServer(std::string rootDir)
: mRootDir(NormalizeSlashes(std::move(rootDir)))
{
}

StaticFileServer::~StaticFileServer()
{
  Stop();
}

bool StaticFileServer::Start(uint16_t port)
{
  if (mRunning.load()) return true;

  try {
    mIo = std::make_unique<asio::io_context>();
    mAcceptor = std::make_unique<tcp::acceptor>(*mIo);

    tcp::endpoint endpoint(asio::ip::make_address("127.0.0.1"), port);
    mAcceptor->open(endpoint.protocol());
    mAcceptor->set_option(tcp::acceptor::reuse_address(true));
    mAcceptor->bind(endpoint);
    mAcceptor->listen(asio::socket_base::max_listen_connections);

    mPort = port;
    mRunning.store(true);
    mThread = std::thread(&StaticFileServer::AcceptLoop, this);
    return true;
  } catch (...) {
    Stop();
    return false;
  }
}

void StaticFileServer::Stop()
{
  mRunning.store(false);

  if (mAcceptor) {
    asio::error_code ec;
    mAcceptor->close(ec);
  }
  if (mIo) {
    mIo->stop();
  }
  if (mThread.joinable()) {
    mThread.join();
  }

  mAcceptor.reset();
  mIo.reset();
  mPort = 0;
}

bool StaticFileServer::IsRunning() const
{
  return mRunning.load();
}

uint16_t StaticFileServer::Port() const
{
  return mPort;
}

void StaticFileServer::AcceptLoop()
{
  while (mRunning.load()) {
    try {
      tcp::socket socket(*mIo);
      asio::error_code ec;
      mAcceptor->accept(socket, ec);
      if (ec) continue;
      std::thread(&StaticFileServer::HandleClient, this, std::move(socket)).detach();
    } catch (...) {
      if (mRunning.load()) continue;
    }
  }
}

void StaticFileServer::HandleClient(tcp::socket socket)
{
  try {
    asio::streambuf request;
    asio::error_code ec;
    asio::read_until(socket, request, "\r\n\r\n", ec);
    if (ec) return;

    std::istream stream(&request);
    std::string method;
    std::string target;
    std::string version;
    stream >> method >> target >> version;

    if (method != "GET" && method != "HEAD") {
      WriteTextResponse(socket, "405 Method Not Allowed", "Method Not Allowed");
      return;
    }

    const std::string path = ResolvePath(target);
    if (path.empty()) {
      WriteTextResponse(socket, "404 Not Found", "Not Found");
      return;
    }

    std::ifstream file(path, std::ios::binary);
    if (!file) {
      WriteTextResponse(socket, "404 Not Found", "Not Found");
      return;
    }

    std::vector<char> body((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    if (method == "HEAD") body.clear();
    WriteResponse(socket, "200 OK", MimeType(path), body);
  } catch (...) {
  }
}

std::string StaticFileServer::ResolvePath(const std::string& requestTarget) const
{
  std::string path = requestTarget;
  const size_t query = path.find('?');
  if (query != std::string::npos) path.erase(query);
  path = UrlDecode(path);
  std::replace(path.begin(), path.end(), '\\', '/');

  if (path.empty() || path[0] != '/') return {};
  if (path.find("..") != std::string::npos) return {};

  if (path == "/") path = "/index.html";

  std::string resolved = mRootDir + path;
  std::ifstream file(resolved, std::ios::binary);
  if (!file && !HasExtension(path)) {
    resolved = mRootDir + "/index.html";
  }
  return resolved;
}

std::string StaticFileServer::MimeType(const std::string& path)
{
  const size_t dot = path.find_last_of('.');
  const std::string ext = dot == std::string::npos ? "" : path.substr(dot + 1);

  if (ext == "html") return "text/html; charset=utf-8";
  if (ext == "js") return "application/javascript; charset=utf-8";
  if (ext == "css") return "text/css; charset=utf-8";
  if (ext == "json") return "application/json; charset=utf-8";
  if (ext == "wasm") return "application/wasm";
  if (ext == "svg") return "image/svg+xml";
  if (ext == "webp") return "image/webp";
  if (ext == "png") return "image/png";
  if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
  if (ext == "ico") return "image/x-icon";
  return "application/octet-stream";
}

std::string StaticFileServer::UrlDecode(const std::string& value)
{
  std::string out;
  out.reserve(value.size());

  for (size_t i = 0; i < value.size(); ++i) {
    if (value[i] == '%' && i + 2 < value.size()) {
      const auto hex = value.substr(i + 1, 2);
      char* end = nullptr;
      const long decoded = std::strtol(hex.c_str(), &end, 16);
      if (end && *end == '\0') {
        out.push_back(static_cast<char>(decoded));
        i += 2;
        continue;
      }
    }
    out.push_back(value[i] == '+' ? ' ' : value[i]);
  }

  return out;
}