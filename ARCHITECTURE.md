# Architecture

LinkinDAW is a Windows-first VST3 connector between DAWs and compatible Web Audio applications.

Current status: Developer Preview / Public Alpha. The current reference integration is Axion staging at `https://dim.productions/linkindaw-axion-probe/`.

## Core Roles

```text
FL Studio
-> LinkinDAW VST3
-> local native bridge inside the plug-in process
-> WebRTC DataChannel
-> Axion WebApp staging route
```

LinkinDAW is not a full DAW remote-control layer. It does not control FL Studio transport buttons, mixer, playlist, channel rack, or host-specific UI.

The supported control direction is:

```text
Axion UI parameter
<-> WebRTC DataChannel
<-> LinkinDAW VST3 parameter
<-> DAW automation lane
```

## Current Transport Paths

### Development / Local Fallback

```text
http://127.0.0.1:18080
+
ws://127.0.0.1:8080-8099
```

This path is for local development and bundled-local fallback testing.

### Cloud Staging Path

```text
https://dim.productions/linkindaw-axion-probe/
-> https://dim.productions/linkindaw-signal
-> WebRTC DataChannel
-> LinkinDAW native peer
```

Cloud HTTPS plus plain `ws://127.0.0.1` is not the production direction. That route failed browser testing and should not be revived unless explicitly requested.

## WebRTC Signaling

The Cloudflare Worker signaling endpoint relays WebRTC setup only:

- offer
- answer
- ICE candidates, if used

It must not carry:

- MIDI performance data
- audio return buffers
- Axion state JSON
- VST3 parameter changes
- auth/payment data

Runtime DAW/WebApp data travels through the WebRTC DataChannel after peer connection establishment.

## Runtime Messages

Current DataChannel message groups:

- MIDI: Note On / Note Off / velocity for compatible WebApp modes
- Tempo / transport: BPM, play/stop, PPQ, sample position
- Parameters: `808_decay`, `808_dirt`, `808_glide`
- State: `save_axion_state` and `load_axion_state`
- Audio return: experimental Axion stereo master audio buffers
- System status: engine/webapp status and acknowledgements

## Axion Reference Policy

Current Axion staging linked mode:

- Kick / Snare / Hat: Axion step sequencer, clocked from DAW transport
- Native 808: Axion step sequencer, clocked from DAW transport
- 808 Slide / GLI / CHK / END: Axion behavior, not FL Studio slide-note emulation
- FL piano-roll MIDI 808: not the current main linked-mode path
- 808 MIDI export: experimental fallback, not exact Axion slide semantics
- 808 WAV stem export: fallback/stem workflow for preserving Axion 808 behavior

## State Save

Axion sends filtered project state to LinkinDAW:

- Kick
- Snare
- Hat
- bass808

LinkinDAW stores that JSON in the VST3 state chunk and sends it back after reconnect as `load_axion_state`.

FL piano-roll notes are not LinkinDAW state. They belong to the DAW project.

State persistence should not be claimed complete unless verified with FL Studio close/reopen and WebRTC reconnect using the current installed VST3.

## Audio Return

Current audio return status:

- Stereo Axion master return to one FL mixer channel is FL-verified for the current Axion staging setup.
- It remains Axion-specific until broader compatibility is tested.
- Multi-out is not implemented.
- Arbitrary Web Audio app audio return is not claimed.

Audio return should keep local browser monitoring disabled by default in WebRTC mode to avoid double playback.

## Multi-Instance Direction

Current Public Alpha is not a complete multi-instance product.

The intended later architecture is:

```text
1 LinkinDAW instance
-> 1 bridge endpoint / peer
-> 1 Web instrument
-> 1 DAW track
```

Broadcast-style multiple browser clients are useful for monitor/debug/editor clients, not for running independent instruments from one endpoint.

## Out Of Scope For Public Alpha

- Production `/axion/*` deployment
- Installer
- Auth/payment
- TLS certificate / `wss://127.0.0.1` route
- Electron/Tauri wrapper
- macOS / AU
- Multi-out
- General non-Axion audio return compatibility
- DAW-specific host remote control
