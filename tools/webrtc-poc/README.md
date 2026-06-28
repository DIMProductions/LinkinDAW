# WebRTC DataChannel PoC

Purpose: verify whether a cloud HTTPS WebApp can open a WebRTC DataChannel to a local peer without using `ws://127.0.0.1`.

This PoC does not touch LinkinDAW VST3, MIDI, audio return, state save, installer, TLS certificates, or the production bridge code.

## Current Result

Tested on Windows:

- Chrome HTTPS offer page: `https://dim.productions/axion/`
- Edge local peer page: `about:blank`
- Result: `connected`, DataChannel `open`, `ping` / `pong` passed

Also tested in reverse:

- Edge HTTPS offer page: `https://dim.productions/axion/`
- Chrome local peer page: `about:blank`
- Result: `connected`, DataChannel `open`, `ping` / `pong` passed

This means the cloud WebApp direction is still viable. The failed path is specifically:

```text
https://dim.productions/axion/
-> ws://127.0.0.1:<port>
```

The viable next path to investigate is:

```text
https://dim.productions/axion/
-> WebRTC DataChannel
-> local helper / libdatachannel peer
-> LinkinDAW side bridge
```

## Run

```powershell
node tools\webrtc-poc\browser-datachannel-probe.mjs `
  "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  "https://dim.productions/axion/" `
  9331 `
  9332
```

Reverse browser roles:

```powershell
node tools\webrtc-poc\browser-datachannel-probe.mjs `
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  "https://dim.productions/axion/" `
  9333 `
  9334
```

## Important Limitation

The current PoC uses a browser-based local peer controlled through the Chrome DevTools Protocol. It proves that the HTTPS cloud page can establish a WebRTC DataChannel to a local peer on this machine.

It does not yet prove that a native C++ peer works. The next step is a minimal `libdatachannel` C++ peer or Node WebRTC peer.

## Native C++ Peer Result

A minimal C++ answer peer using `libdatachannel` also succeeded.

Tested path:

```text
https://dim.productions/axion/
-> WebRTC DataChannel
-> local C++ libdatachannel peer
```

Result on Windows + Chrome:

- Browser page origin: `https://dim.productions`
- Browser secure context: `true`
- ICE state: `connected`
- DataChannel state: `open` during exchange
- Native peer received `ping-*`
- Native peer returned `pong:ping-*`

This confirms that the cloud WebApp direction can work without `ws://127.0.0.1` and without `wss://127.0.0.1` for the data path.

Run native peer probe:

```powershell
node tools\webrtc-poc\native-datachannel-probe.mjs
```

Build native peer:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' -S tools\webrtc-poc\native-peer -B build\webrtc-native-poc -G "Visual Studio 17 2022" -A x64
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' --build build\webrtc-native-poc --config Release --target linkindaw-native-answer-peer
```

PoC dependencies:

- `Dependencies/libdatachannel` at the current cloned revision.
- `Dependencies/mbedtls` checked out at `v3.6.3` tag target.
- Mbed TLS user config enables `MBEDTLS_SSL_DTLS_SRTP` for libdatachannel.

Important limitation: this is still a standalone PoC. It is not integrated into LinkinDAW VST3, Axion MIDI, audio return, state save, installer, or production signaling.

## Cloud HTTPS Signaling PoC

Added two pieces for Phase WebRTC-2B:

- `cloudflare-signaling/worker.mjs`: minimal Cloudflare Worker + Durable Object signaling server.
- `cloud-signaling-poc.mjs`: runner that can use either local same-origin signaling or a deployed HTTPS signaling endpoint.

The signaling endpoint is intentionally narrow. It relays only WebRTC setup messages:

- `offer`
- `answer`
- `candidate`

It does not carry MIDI, audio, WebApp state, auth, payment, installer data, or plugin control messages.

Endpoint shape:

```text
POST /rooms/:roomId/messages
GET  /rooms/:roomId/messages?to=browser|native&after=<id>
```

Roles:

- `browser`: the HTTPS WebApp side, for example `https://dim.productions/axion/`.
- `native`: the local helper / future LinkinDAW-side WebRTC peer.

Local same-origin signaling was verified:

```text
http://127.0.0.1:18096/
-> room signaling
-> local C++ libdatachannel peer
-> WebRTC DataChannel ping/pong
```

Result:

- Browser ICE state: `connected`
- Native peer state: `connected`
- DataChannel ping/pong: passed
- Native process exit: `0`

Run the local same-origin check:

```powershell
$env:LINKINDAW_SIGNALING_PAGE_URL = 'http://127.0.0.1:18096/'
Remove-Item Env:LINKINDAW_SIGNALING_BASE -ErrorAction SilentlyContinue
node tools\webrtc-poc\cloud-signaling-poc.mjs
```

Cloud HTTPS signaling has been deployed and verified under `dim.productions`.

Verified cloud test path:

```text
https://dim.productions/axion/
-> https://dim.productions/linkindaw-signal
-> local helper polling the same cloud signaling room
-> local C++ libdatachannel peer
-> WebRTC DataChannel ping/pong
```

Run the deployed Worker probe:

```powershell
$env:LINKINDAW_SIGNALING_BASE = 'https://dim.productions/linkindaw-signal'
Remove-Item Env:LINKINDAW_SIGNALING_PAGE_URL -ErrorAction SilentlyContinue
node tools\webrtc-poc\cloud-signaling-poc.mjs
```

Verified result:

- Signaling route: `https://dim.productions/linkindaw-signal`
- Worker route: `dim.productions/linkindaw-signal/*`
- Worker version: `7ba1d03b-5b4e-4d47-a881-801002855d44`
- Browser page: `https://dim.productions/axion/`
- Browser secure context: `true`
- Browser ICE state: `connected`
- Native peer state: `connected`
- DataChannel ping/pong: passed
- Native process exit: `0`
This PoC still does not integrate with LinkinDAW VST3, audio return, MIDI, state save, installer logic, auth, or payment.
## Phase WebRTC-3 Result

LinkinDAW Native Peer Integration Probe succeeded as a standalone communication-layer test.

Verified path:

```text
https://dim.productions/axion/
-> https://dim.productions/linkindaw-signal
-> local C++ libdatachannel bridge probe
-> RTCDataChannel
-> DAW-style JSON messages
```

The native C++ bridge probe sent WebSocket-compatible LinkinDAW payloads over RTCDataChannel:

- `type: system`, `command: transport`, playing true
- `type: midi`, Note On style payload
- `type: midi`, Note Off style payload
- `type: system`, `command: transport`, playing false

Result:

- Cloud signaling room join: passed
- DataChannel open: passed
- C++ -> browser JSON delivery: passed
- Browser -> C++ ack delivery: passed
- Reconnect-style second room pass: passed
- Native process exit: `0` for both rounds

Run:

```powershell
$env:LINKINDAW_SIGNALING_BASE = 'https://dim.productions/linkindaw-signal'
node tools\webrtc-poc\linkindaw-native-peer-integration-poc.mjs
```

Build the native bridge probe:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' --build build\webrtc-native-poc --config Release --target linkindaw-native-bridge-probe
```

Important limitation: this still injects the browser-side WebRTC probe through CDP. It proves the local C++ LinkinDAW-side peer can send DAW-style JSON over WebRTC through cloud signaling, but it does not yet add a real WebRTC adapter to the Axion/WebApp code and does not integrate with LinkinDAW VST3.

Still not touched:

- VST3 integration
- Audio return
- installer
- auth/payment
- multi-output
- full State sync
## Phase WebRTC-4 Result

WebApp Adapter Integration was added to the Axion static WebApp.

Added:

- `WebApp/public/axion/src/axion/linkindaw-webrtc-adapter.js`
- Axion `index.html` module script include for the adapter
- `webapp-adapter-integration-poc.mjs` for a no-CDP-injection adapter probe
- `axion-adapter-worker/` draft Worker config for serving Adapter-enabled Axion under `dim.productions/axion/*`

Adapter activation is URL-gated. Normal Axion page loads do not connect to LinkinDAW unless one of these is present:

```text
?linkindaw=webrtc&room=<roomId>
?webrtc=1&room=<roomId>
?room=<roomId>
```

The adapter uses cloud signaling by default:

```text
https://dim.productions/linkindaw-signal
```

Local no-CDP-injection probe succeeded:

```text
http://127.0.0.1:<local-axion-server>/?linkindaw=webrtc&room=<roomId>
-> https://dim.productions/linkindaw-signal
-> local C++ libdatachannel bridge probe
-> RTCDataChannel
-> Axion WebApp adapter
```

Result:

- Adapter enabled from URL params: passed
- Cloud signaling room join: passed
- DataChannel open: passed
- C++ -> WebApp DAW-style JSON delivery: passed
- WebApp -> C++ ack delivery: passed
- Two-round reconnect-style probe: passed
- Native process exit: `0` for both rounds
- `npm run build`: passed after rerunning outside the sandbox due Windows `EPERM` on Vite child process spawn

Staging deploy result:

```text
https://dim.productions/linkindaw-axion-probe/
```

Cloudflare Worker route:

```text
dim.productions/linkindaw-axion-probe
dim.productions/linkindaw-axion-probe/*
```

Latest staging Worker version:

```text
17a0c6db-cea2-412e-8fe0-0bd261978c2f
```

Staging verification:

- HTTPS staging URL opens: passed with the root staging URL above
- Query parameters are preserved on the root staging URL
- `?linkindaw=webrtc&room=<roomId>` starts adapter: passed
- Cloud signaling join: passed
- DataChannel opens: passed
- C++ bridge sends DAW-style JSON: passed
- WebApp returns ack: passed
- Existing Axion UI loads: passed
- Audio Arm button activates the engine: passed in Chrome headless with user gesture
- Adapter remains disabled on normal URL without `room`: passed
- `npm run build`: passed

Frozen staging URL:

```text
https://dim.productions/linkindaw-axion-probe/
```

This URL is intentionally kept as the official experiment route before touching production `dim.productions/axion/*`.

Important limitation: the live `https://dim.productions/axion/` route has not been updated yet. Deploying the Adapter-enabled Axion Worker to `dim.productions/axion/*` changes the public route and still needs explicit approval.

Still not touched:

- VST3 integration
- Audio return over WebRTC
- installer
- auth/payment
- multi-output
- full State sync



