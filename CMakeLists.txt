cmake_minimum_required(VERSION 3.15)
project(LinkinDAW VERSION 1.0.0)

set(IPLUG2_DIR "${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/iPlug2")
set(IPLUG_DEPLOY_PLUGINS OFF CACHE BOOL "Do not auto-deploy to per-user VST3 paths" FORCE)
include(${IPLUG2_DIR}/iPlug2.cmake)
find_package(iPlug2 REQUIRED)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(NO_EXAMPLES ON CACHE BOOL "" FORCE)
set(NO_TESTS ON CACHE BOOL "" FORCE)
set(NO_MEDIA ON CACHE BOOL "" FORCE)
set(NO_WEBSOCKET ON CACHE BOOL "" FORCE)
set(WARNINGS_AS_ERRORS OFF CACHE BOOL "" FORCE)
set(USE_MBEDTLS ON CACHE BOOL "" FORCE)
set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
set(GEN_FILES ON CACHE BOOL "" FORCE)
set(MBEDTLS_USER_CONFIG_FILE "${CMAKE_CURRENT_SOURCE_DIR}/tools/webrtc-poc/native-peer/mbedtls-user-config.h" CACHE FILEPATH "" FORCE)
set(USE_STATIC_MBEDTLS_LIBRARY ON CACHE BOOL "" FORCE)
set(USE_SHARED_MBEDTLS_LIBRARY OFF CACHE BOOL "" FORCE)

add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/mbedtls" "${CMAKE_BINARY_DIR}/mbedtls")
if(NOT TARGET MbedTLS::MbedTLS)
  add_library(MbedTLS::MbedTLS INTERFACE IMPORTED)
  target_link_libraries(MbedTLS::MbedTLS INTERFACE MbedTLS::mbedtls)
endif()
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/libdatachannel" "${CMAKE_BINARY_DIR}/libdatachannel")

# 依存ライブラリのインクルードパス
set(EXTRA_INC_PATHS 
    "${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/websocketpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/asio/asio/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/readerwriterqueue"
    "${CMAKE_CURRENT_SOURCE_DIR}/Dependencies/json/single_include"
)
include_directories(${EXTRA_INC_PATHS})

# asio standalone definition
add_compile_definitions(ASIO_STANDALONE _WEBSOCKETPP_CPP11_STL_ LINKINDAW_WEBAPP_DIST_DIR="${CMAKE_CURRENT_SOURCE_DIR}/WebApp/dist")

if(MSVC)
    add_compile_options(/utf-8)
endif()

# iPlug2 standard graphics UI (no WebView)
set(IGRAPHICS_BACKEND NANOVG CACHE STRING "IGraphics drawing backend" FORCE)

iplug_add_plugin(${PROJECT_NAME}
  FORMATS VST3
  SOURCES
    src/LinkinDAW.cpp
    src/WebSocketServer.cpp
    src/StaticFileServer.cpp
    src/NativeWebRtcPeer.cpp
    src/LinkinDAW.h
    src/StaticFileServer.h
    src/NativeWebRtcPeer.h
    src/WebSocketServer.h
    config.h
)


set(LINKINDAW_PLUGIN_TARGET LinkinDAW-vst3)
if(TARGET ${LINKINDAW_PLUGIN_TARGET})
  if(WIN32)
    target_link_libraries(${LINKINDAW_PLUGIN_TARGET} PRIVATE LibDataChannel::LibDataChannelStatic winhttp advapi32)
  else()
    target_link_libraries(${LINKINDAW_PLUGIN_TARGET} PRIVATE LibDataChannel::LibDataChannelStatic)
  endif()
endif()
