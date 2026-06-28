# LinkinDAW

Open-source connector between Web Audio Applications and DAWs.

Current status:

- Windows + FL Studio only.
- Experimental.
- Public Alpha / developer preview.

LinkinDAW is a Windows-first VST3 connector that sends DAW MIDI and tempo to compatible Web Audio apps. It can also exchange transport, project-state, and Web Audio return data with the current Axion reference app.

The current reference WebApp is Axion.

Demo scope is frozen in [Demo Freeze v0](DEMO_FREEZE_v0.md). Architecture notes are in [ARCHITECTURE.md](ARCHITECTURE.md). Public Alpha publication checks are tracked in [PUBLIC_ALPHA_CHECKLIST.md](PUBLIC_ALPHA_CHECKLIST.md).

## Current Development Mode

LinkinDAW now serves the built WebApp locally from `WebApp/dist` when the VST3 is loaded.

- Static WebApp server: `http://127.0.0.1:18080`
- LinkinDAW WebSocket: `ws://127.0.0.1:8080` for the first instance, then the next available port in `8080-8099` for additional instances
- Axion route: `http://127.0.0.1:18080/?app=axion`
- ENIGMA test route: `http://127.0.0.1:18080/?app=enigma`

`npm run dev` is no longer required for normal local testing. Rebuild `WebApp/dist` after WebApp changes:

```powershell
cd C:\Users\Davinci\Documents\LinkinDAW\WebApp
npm run build
```

Then insert LinkinDAW in FL Studio and use the plugin UI to open the WebApp.

## Public Alpha Scope

- VST3 loads in FL Studio.
- WebSocket connection between LinkinDAW and the WebApp.
- DAW tempo and transport are forwarded to the WebApp.
- DAW MIDI Note On / Note Off is forwarded to compatible WebApp modes.
- Current Axion staging mode runs drums and Native 808 from Axion step data synced to DAW transport.
- Axion Native 808 is the current path for Slide / GLI / CHK / END behavior.
- Audio return from Axion to the DAW works in the current Axion staging setup.
- VST3 state chunk support can save and restore Axion pattern JSON state in FL Studio.


## Current Limitation

LinkinDAW Public Alpha includes early multi-instance routing for separate DAW tracks.

Each LinkinDAW plugin instance opens its own local WebSocket endpoint, selected from the `8080-8099` port range. The WebApp receives the endpoint through the `linkindaw` URL parameter.

This is an early implementation and still needs repeated FL Studio testing with multiple plugin instances.

Planned architecture:

- 1 LinkinDAW instance
- 1 local WebSocket endpoint
- 1 Web instrument
- 1 DAW track

Within one endpoint, broadcast mode is for monitor/debug clients only. Instrument audio and state are owned by the active main WebApp client.

## Known Limitations / Future Work

- Only tested on Windows + FL Studio.
- WebApp assets are served from `WebApp/dist` by the local static server. Packaging these assets for redistribution is still future work.
- Current Axion staging policy uses Axion step playback for drums and Native 808. FL piano-roll 808 is not the main linked-mode path.
- Axion 808 slide/glide behavior is Axion-specific. MIDI export of 808 slide is experimental and not exact Axion GLI/CHK/END behavior.
- Playback source selection still needs more cross-mode testing outside the current Axion staging path.
- Pitch Bend and CC handling need more cross-app testing.
- Multi-instance routing is an early alpha feature and needs more FL Studio project testing.
- macOS and AU are not supported yet.
- No installer.
- No production WebApp URL support yet.
- HTTPS-hosted WebApps cannot currently connect to the local bridge over plain `ws://127.0.0.1`.
- WebRTC DataChannel PoC succeeded from `https://dim.productions/axion/` to a local browser peer on Chrome/Edge.
- WebRTC DataChannel PoC also succeeded from `https://dim.productions/axion/` to a local C++ `libdatachannel` peer.
- Cloudflare Worker signaling deployed at `https://dim.productions/linkindaw-signal`; `https://dim.productions/axion/` successfully exchanged WebRTC offer/answer through it with a local C++ `libdatachannel` peer. LinkinDAW Native Peer Integration Probe succeeded for C++ -> browser DAW-style JSON over RTCDataChannel. WebApp Adapter Integration probe succeeded locally and on the staging route without CDP injection; live `dim.productions/axion/*` deployment requires explicit approval.
- No `wss://` / TLS certificate support yet.
- No Electron or Tauri wrapper.
- Audio return is implemented and FL-tested for the current Axion staging setup, but broader Web instrument compatibility still needs testing.

## Frozen Cloud WebRTC Staging State

The current cloud WebRTC route is frozen on the staging URL:

```text
https://dim.productions/linkindaw-axion-probe/
```

Verified behavior:

- The staging root serves Adapter-enabled Axion directly.
- Query parameters are preserved, including `?linkindaw=webrtc&room=<roomId>`.
- `https://dim.productions/linkindaw-signal` provides cloud HTTPS signaling.
- The local C++ `libdatachannel` bridge probe opens RTCDataChannel successfully.
- The WebApp adapter receives DAW-style JSON and returns acknowledgements.
- `npm run build` remains passing.

This staging route is the official experiment URL for now. Do not deploy the Adapter-enabled Axion Worker to `dim.productions/axion/*` until explicitly approved.

Current decision: keep `linkindaw-axion-probe/` as the official experiment URL and continue VST3/native-peer integration before updating the public Axion route.
## FL Studio Runtime Verification Snapshot

Status label: FL verified for the items listed here, using the current installed VST3 and the staging Axion route on 2026-06-28.

Verified in FL Studio:

- `Open Web App` launches Chrome to the staging Axion WebRTC route.
- WebRTC reconnect works from the LinkinDAW `Reconnect` button.
- Axion Native 808 plays from Axion steps in DAW linked mode.
- Axion Native 808 is the correct path for Slide / GLI / CHK / END behavior.
- Stereo Audio Return from Axion to FL Studio does not audibly drop out in the tested setup.
- Chrome tab background/foreground switching no longer causes catch-up burst playback.
- Startup low-speed / low-pitch distortion improved after keeping Axion on the browser AudioContext sample rate.

Still needs broader verification:

- Long-session stability.
- Multiple FL projects and reloads.
- Other buffer sizes and sample-rate combinations.
- General compatibility with non-Axion Web Audio apps.

## Intended User-Facing Direction

The long-term user-facing design is:

- Axion WebApp hosted at `https://dim.productions/axion/`
- LinkinDAW runs inside the DAW.
- The WebApp connects to the local LinkinDAW bridge.
- Users should not need to run a local Web server.

That mode is not the current development target.

Current browser probe result:

- `https://dim.productions/axion/` -> `ws://127.0.0.1:<port>` failed in Chrome on Windows.
- `https://dim.productions/axion/` -> `ws://127.0.0.1:<port>` failed in Edge on Windows.
- The local WebSocket probe received no connection, so this appears blocked before reaching LinkinDAW.

The current production candidate is therefore:

- `https://dim.productions/axion/`
- Cloud HTTPS signaling endpoint under `dim.productions`
- WebRTC DataChannel
- Local native / LinkinDAW-side peer

The bundled local WebApp server remains the fallback distribution mode. `wss://127.0.0.1:<port>` is no longer the first path to pursue unless WebRTC signaling fails in deployment testing.

## Phase WebRTC-5: VST3 Native Peer Integration

Current implementation status:

- LinkinDAW VST3 generates a WebRTC `roomId` per plugin instance.
- `Open Web App` opens the frozen staging URL:

```text
https://dim.productions/linkindaw-axion-probe/?linkindaw=webrtc&room=<roomId>
```

- The VST3 starts a native `libdatachannel` peer.
- The native peer joins cloud signaling through:

```text
https://dim.productions/linkindaw-signal
```

- The native peer answers the browser offer and opens RTCDataChannel.
- DAW MIDI, parameter changes, sample rate notification, tempo, and transport JSON are sent over the DataChannel using the same message shape as the local WebSocket bridge.
- WebApp acknowledgements are received and counted by the native peer.
- The existing local WebSocket bridge and bundled local WebApp fallback remain in place.

Verified so far:

- VST3 Release build with `libdatachannel` linked: passed.
- Frozen staging WebApp adapter route: passed.
- Standalone C++ bridge probe against staging: passed.
- FL Studio opens the staging Axion page with a generated `roomId`.
- DataChannel opens from the real VST3 process.
- `Reconnect` can establish a fresh WebRTC session.
- Tempo and transport arrive from FL Studio.

Current Axion staging note:

- MIDI delivery exists for compatible WebApp modes, but Axion Native 808 currently uses Axion step data rather than FL piano-roll 808.
- Audio Return and Native 808 behavior are tracked in the FL Studio Runtime Verification Snapshot above.

Still not part of this phase:

- Production `/axion/*` deployment
- Installer
- Auth/payment
- Multi-output
- Complex State sync

## Phase State-1: Axion Pattern State

Current implementation status:

- Axion sends `save_axion_state` over RTCDataChannel when project state changes.
- The WebRTC adapter stores the Axion pattern-state scope for LinkinDAW: Kick, Snare, Hat, and bass808 tracks.
- Saved Axion pattern state includes steps, mute, solo, volume, track divisions, page, and available track macros/step locks from Axion's project JSON.
- LinkinDAW stores the Axion state JSON in the VST3 state chunk.
- After WebRTC reconnect, LinkinDAW sends `load_axion_state` back to Axion.
- Axion applies the loaded project JSON and restores the pattern state.
- The local WebSocket fallback accepts the same `save_axion_state` command shape.

Explicitly out of scope:

- FL piano-roll notes are not saved by LinkinDAW state. Axion Native 808 step state belongs to Axion pattern state when included in the saved JSON.
- Audio Return over WebRTC for non-Axion apps is not part of State-1.
- Production `/axion/*`, installer, auth/payment, and multi-instance routing are unchanged.

Verified so far:

- `npm run build`: passed.
- VST3 Release build: passed.
- Staging WebRTC adapter route: passed.
- Staging DataChannel DAW-style JSON / ack probe: passed.

Still needs FL Studio runtime verification:

1. Insert the built LinkinDAW VST3.
2. Open staging Axion via WebRTC.
3. Edit Kick/Snare/Hat/808 pattern state.
4. Save the FL Studio project.
5. Close and reopen the project.
6. Reconnect WebRTC.
7. Confirm Axion restores the pattern state.

## Experimental 808 MIDI Export Fallback

Current implementation status:

- Axion can export the internal 808 step pattern as a browser-generated `.mid` file.
- The minimal UI button is `808 MIDI`, placed beside the existing export/import controls.
- Export scope is 808 only. Kick, Snare, and Hat are not exported yet.
- Export uses SMF type 0, PPQ 480, one MIDI track, and embeds the current BPM as a tempo meta event.
- Step note values map to MIDI note numbers.
- Step velocity maps to MIDI note velocity.
- Step timing uses Axion page divisions, including 16th and triplet page division timing.
- Gate/hold length uses the current 808 gate step value when present.
- Choke/end markers truncate the previous exported note when possible.
- Slide export v0 defaults to `legato`: slide steps become overlapped MIDI notes.

Current policy:

- This is not the main Axion linked-mode 808 path.
- The main linked-mode path is Axion Native 808 plus Audio Return, so Slide / GLI / CHK / END remain Axion behavior.
- MIDI export is a fallback/experiment for DAW editing, not an exact recreation of Axion 808 slides.

Experimental limitations:

- Exact Axion GLI/CHK/END semantics are not guaranteed in MIDI v0.
- Pitch bend MIDI export is future work.
- FL Studio import must still be checked manually in the piano roll.

Verified so far:

- Browser MIDI generation probe: passed.
- Generated MIDI has `MThd`, PPQ 480, note events, velocity preservation, and legato overlap.
- `npm run build`: passed.

## DAW Automation Direction

DAW automation is implemented through VST3 parameters, not DAW host remote control.

LinkinDAW does not attempt to control DAW-specific UI or host functions from Axion. Axion does not control FL Studio Play/Stop, Mixer, Playlist, or Channel Rack. DAW host control is DAW-specific and out of scope.

The supported control architecture is:

```text
Axion UI parameter
<-> WebRTC DataChannel
<-> LinkinDAW VST3 parameter
<-> DAW automation lane
```

Initial VST3 parameter sync scope:

- `808_decay`
- `808_dirt`
- `808_glide`

All synced parameter values use normalized `0.0` to `1.0` values. Conflicts are resolved as last-writer-wins. Existing MIDI, tempo, and transport WebRTC messages remain separate from parameter sync.

Out of scope:

- Axion -> FL Studio transport remote control
- Axion -> FL Studio Mixer / Playlist / Channel Rack control
- DAW-specific host APIs
- Audio Return over WebRTC for non-Axion apps
- Production `/axion/*` deployment
## FL Studio Notes

For DAW MIDI input, LinkinDAW must receive MIDI as an instrument/generator channel. If MIDI is not reaching the plugin, the UI will remain `MIDI: Idle`.

If `MIDI: Receiving` appears, FL Studio is sending MIDI to LinkinDAW.

## License

LinkinDAW source code is licensed under the MIT License. See [LICENSE](LICENSE).

Third-party dependency notices are tracked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Security boundaries and reporting notes are in [SECURITY.md](SECURITY.md). Public Alpha source publication should preserve dependency license files. Binary releases are not planned until installer, signing, packaging, and bundled license notices are explicitly decided.

## Public Alpha Source Setup

This repository is currently a developer preview, not an end-user installer.

Clone with submodules:

```powershell
git clone --recurse-submodules <repo-url>
```

If the repository was already cloned:

```powershell
git submodule update --init --recursive
```

Required local tools:

- Windows
- Visual Studio 2022 with C++ build tools
- CMake, or the Visual Studio bundled CMake
- Node.js/npm for rebuilding `WebApp/dist`
- FL Studio for runtime verification

Do not copy build outputs into `C:\Program Files\Common Files\VST3` unless you intentionally want to update the locally installed test plug-in.

## Build

Build the VST3 target:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' --build build-webrtc5 --config Release --target LinkinDAW-vst3
```

Build the WebApp:

```powershell
cd WebApp
npm run build
```

## Install During Development

The build output is:

```text
build-webrtc5\out\LinkinDAW.vst3\Contents\x86_64-win\LinkinDAW.vst3
```

The FL Studio-tested install location is:

```text
C:\Program Files\Common Files\VST3\LinkinDAW.vst3
```

By default, `tools/update-vst3.ps1` builds the repository VST3 only and does not modify Program Files. Use `tools/update-vst3.ps1 -InstallToProgramFiles` only when you intentionally want to copy the VST3 binary to Program Files.

## State Save Test

State save must be verified with this exact FL Studio runtime sequence:

1. Insert the current LinkinDAW VST3 in FL Studio.
2. Click `Open Web App` and connect staging Axion through WebRTC.
3. Confirm LinkinDAW shows `State: Unsaved` before editing, or `Stored` if a state was already restored from the project.
4. Edit Kick / Snare / Hat / Native 808 pattern state in Axion.
5. Wait for LinkinDAW to show `State: Synced`.
6. Save the FL Studio project.
7. Close FL Studio.
8. Reopen the saved project.
9. Click `Open Web App` or `Reconnect`.
10. Confirm Axion restores the saved pattern state.

Current status: implemented and builds, but full FL project close/reopen persistence still needs FL runtime verification.