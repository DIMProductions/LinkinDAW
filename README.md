# LinkinDAW

Open-source connector between Web Audio Applications and DAWs.

Current status:

- Windows + FL Studio only.
- Experimental Public Alpha / developer preview.
- No installer or binary release yet.
- Current reference integration: Axion staging WebApp.
- Current probe integration: ENIGMA Web synth probe.

LinkinDAW is a Windows-first VST3 connector that lets compatible Web Audio apps receive DAW transport, tempo, parameter, state, MIDI-style events, and experimental stereo audio return data.

Do not treat experimental work as product-ready. Anything not verified inside FL Studio with the current build should be described as implemented but not verified.

## Current User Flow

The current cloud WebRTC flow is:

```text
FL Studio
-> LinkinDAW VST3
-> Open Web App
-> https://dim.productions/linkindaw-launch/?linkindaw=webrtc&room=<roomId>
-> choose Axion or ENIGMA
-> WebRTC DataChannel through cloud signaling
-> Web Audio app
```

The launcher is deployed at:

```text
https://dim.productions/linkindaw-launch/
```

The current app routes are:

```text
https://dim.productions/linkindaw-axion-probe/
https://dim.productions/linkindaw-enigma-probe/
```

The production Axion route is not changed by this preview:

```text
https://dim.productions/axion/
```

Do not deploy to `dim.productions/axion/*` unless explicitly approved.

## Signaling Status

Cloud WebRTC signaling is deployed at:

```text
https://dim.productions/linkindaw-signal
```

Current status:

- Durable Objects signaling hit Cloudflare free-tier request limits.
- Production signaling was temporarily switched to a Cloudflare Cache API fallback.
- POST/GET room message roundtrip is verified with `storage: "cache-api-fallback"`.
- This is acceptable for Public Alpha testing, but it is not the final production signaling design.

The signaling endpoint only relays WebRTC setup messages: offer, answer, and ICE candidates. It must not carry MIDI, audio, payment, auth, or project state payloads.

## FL Studio Runtime Verification Snapshot

Status label: FL verified for the items listed here with the current installed VST3 and Axion staging setup.

Verified in FL Studio:

- `Open Web App` launches Chrome to the LinkinDAW launcher with a generated `roomId`.
- Launcher can open Axion staging with the same `roomId`.
- WebRTC reconnect works from the LinkinDAW `Reconnect` button.
- Axion produces sound in FL Studio after the signaling fallback fix.
- Axion Native 808 can play from Axion steps in DAW linked mode.
- Axion Native 808 is the current path for Slide / GLI / CHK / END behavior.
- Stereo Audio Return from Axion to FL Studio is verified for the current Axion staging setup.
- Chrome background/foreground switching no longer causes catch-up burst playback in the tested setup.

Still needs broader verification:

- Long-session stability.
- Multiple saved FL projects and reload cycles.
- Other FL buffer sizes and sample-rate combinations.
- Multiple plugin instances.
- Non-Axion Web Audio apps beyond the ENIGMA probe.
- Final production-grade signaling storage.

## Public Alpha Scope

Current Public Alpha claim:

> A Windows-first experimental VST3 connector that connects FL Studio to compatible Web Audio apps through a browser launcher and WebRTC DataChannel, with Axion staging as the current reference integration.

Implemented / currently in scope:

- VST3 loads in FL Studio.
- Chrome launch from the plugin UI.
- Web app launcher route.
- WebRTC signaling through `dim.productions/linkindaw-signal`.
- Native C++ `libdatachannel` peer in the VST3 process.
- DAW tempo and transport forwarded to WebApps.
- DAW MIDI-style messages forwarded to compatible WebApp modes.
- VST3 parameter sync for Axion `808_decay`, `808_dirt`, and `808_glide`.
- Axion pattern state save/restore plumbing through VST3 state chunks.
- Experimental stereo Audio Return for the current Axion staging setup.
- Local WebSocket / bundled local WebApp fallback remains in the codebase.

Not in scope for Public Alpha:

- Installer.
- Signed binary release.
- Production `/axion/*` deployment.
- macOS / AU.
- Audio Unit, AAX, CLAP.
- Auth/payment.
- Multi-out.
- Product-grade multi-instance routing.
- Arbitrary Web Audio app compatibility claim.

## Axion Mode Policy

FL Studio slide notes are not standard VST MIDI behavior. Do not promise exact FL slide compatibility for Axion 808.

Current Axion policy:

- Drums: Axion step sequencer, synced to FL transport/BPM.
- Native 808: Axion step sequencer, synced to FL transport/BPM.
- Slide / GLI / CHK / END: Axion behavior.
- Audio path: Axion audio returns to FL through experimental stereo Audio Return.
- FL piano-roll MIDI is useful for generic Web synths and probes, but it is not the main Axion Native 808 path.

Axion `.axi` import/export is JSON project import/export. It is separate from DAW MIDI import.

## 808 Export Policy

The main Axion linked-mode 808 path is Axion Native 808 plus Audio Return.

808 MIDI export is experimental and approximate. It is not the current main Public Alpha workflow because exact Axion Slide / GLI / CHK / END behavior cannot be guaranteed through ordinary MIDI export.

808 WAV/stem export is the safer path when Axion-specific 808 slide behavior must be preserved outside real-time Audio Return.

## DAW Automation Direction

DAW automation is implemented through VST3 parameters, not DAW host remote control.

Supported architecture:

```text
Axion UI parameter
<-> WebRTC DataChannel
<-> LinkinDAW VST3 parameter
<-> DAW automation lane
```

Initial synced parameters:

- `808_decay`
- `808_dirt`
- `808_glide`

Out of scope:

- Axion controlling FL Studio Play/Stop.
- Axion controlling FL Mixer, Playlist, or Channel Rack.
- DAW-specific host remote-control APIs.

## Local Development / Fallback

The repository still contains the local static server and WebSocket fallback path.

Typical local fallback routes:

```text
http://127.0.0.1:18080
ws://127.0.0.1:8080
```

The current cloud launcher/WebRTC path is the main Public Alpha direction. The local fallback remains useful for development and recovery.

Rebuild the WebApp after WebApp changes:

```powershell
cd C:\Users\Davinci\Documents\LinkinDAW\WebApp
npm run build
```

Build the VST3 target:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' --build build-webrtc5 --config Release --target LinkinDAW-vst3
```

Build output:

```text
build-webrtc5\out\LinkinDAW.vst3\Contents\x86_64-win\LinkinDAW.vst3
```

Do not copy build outputs into this path unless intentionally updating the local test installation:

```text
C:\Program Files\Common Files\VST3\LinkinDAW.vst3
```

## State Save Test

Do not claim FL project persistence is complete unless this exact sequence is verified:

1. Open FL Studio.
2. Load LinkinDAW.
3. Open Axion through the LinkinDAW launcher and WebRTC.
4. Edit Kick / Snare / Hat / Native 808 pattern state.
5. Save the FL Studio project.
6. Close FL Studio.
7. Reopen the project.
8. Reconnect WebRTC.
9. Confirm Axion restores the saved pattern state.

Current status: implemented and builds, but full FL project close/reopen persistence still needs current-build FL runtime verification.

## Source Publication Setup

Clone with submodules:

```powershell
git clone --recurse-submodules <repo-url>
```

If already cloned:

```powershell
git submodule update --init --recursive
```

Required local tools:

- Windows.
- Visual Studio 2022 with C++ build tools.
- CMake, or Visual Studio bundled CMake.
- Node.js/npm for WebApp builds.
- FL Studio for runtime verification.

## Public Alpha Documents

- [Demo Freeze v0](DEMO_FREEZE_v0.md)
- [Architecture](ARCHITECTURE.md)
- [Public Alpha Checklist](PUBLIC_ALPHA_CHECKLIST.md)
- [Security](SECURITY.md)
- [Third-party Notices](THIRD_PARTY_NOTICES.md)
- [AGENTS.md](AGENTS.md)

## License

LinkinDAW source code is licensed under the MIT License. See [LICENSE](LICENSE).

Third-party dependency notices are tracked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Binary releases are not planned until installer, signing, packaging, and bundled license-notice decisions are explicit.
