# AGENTS.md

Project-specific instructions for coding agents working on LinkinDAW.

## Core Rule

Do not treat experimental work as finished. If a feature has not been verified inside FL Studio with the current build, describe it as `implemented but not verified`, `experimental`, or `needs FL runtime verification`.

## Do Not Drift

Stay on the user's current requested phase. Do not expand the task into adjacent roadmap items unless explicitly asked.

Examples:

- If asked to document demo criteria, do not imply the demo already passes.
- If asked about Axion integration status, separate implemented code from verified FL Studio behavior.
- If asked to fix Audio Return, do not start Multi-Out.
- If asked about GitHub release readiness, do not deploy production web routes.

## Protected Paths And Deployment Rules

Never modify or copy files into this path unless the user explicitly asks in that turn:

```text
C:\Program Files\Common Files\VST3\LinkinDAW.vst3
```

The user may update the installed VST3 manually. Build outputs should stay under the repository, normally:

```text
build-webrtc5\out\LinkinDAW.vst3\Contents\x86_64-win\LinkinDAW.vst3
```

Do not deploy to production Axion unless explicitly approved in that turn:

```text
https://dim.productions/axion/*
```

Staging route is allowed only when the user request requires it:

```text
https://dim.productions/linkindaw-axion-probe/
```

Do not add installer, auth/payment, TLS certificate, wss, Electron, or Tauri work unless explicitly requested.

## Current Demo Truth

The current demo target is a verification checklist, not a completion claim.

Demo minimum:

- FL Studio opens LinkinDAW VST3.
- `Open Web App` launches Chrome to `linkindaw-axion-probe` with a roomId.
- WebRTC connects.
- FL Studio sends Play / Stop / BPM / MIDI Note / Velocity to Axion.
- Axion and FL Studio sync `808 Decay`, `808 Dirt`, and `808 Glide` both ways.
- Axion Kick / Snare / Hat can run from DAW transport.
- Axion Native 808 can run from DAW transport in WebRTC linked mode.
- Axion internal 808 slide / GLI / CHK / END behavior is preserved by Axion playback and can also be exported as `808.wav` using `808 WAV`.

Stereo Audio Return is FL-verified for the current Axion staging setup, but remains Axion-specific until broader compatibility is tested.

## Axion / LinkinDAW Integration Status Language

Use precise labels:

- `Implemented`: code exists and builds.
- `Staging deployed`: code is live on `linkindaw-axion-probe`.
- `FL verified`: tested in FL Studio with the current installed VST3.
- `Experimental`: implemented but not stable enough for a demo or release claim.

Do not say `done`, `complete`, or `finished` unless the exact current build has passed FL Studio runtime verification.

## 808 Policy

FL Studio slide notes are not standard VST MIDI behavior. Do not promise exact FL slide compatibility for Axion 808.

Current policy:

- In the current WebRTC linked Axion mode, 808 should use Axion Native 808 rather than FL piano-roll MIDI.
- Axion-specific 808 slide / GLI / CHK / END behavior should be preserved by Axion playback and Audio Return, or by WAV stem export.
- MIDI export of 808 slide is approximate unless explicitly redesigned and verified.

## Audio Return Policy

Stereo Audio Return is FL-verified for the current Axion staging setup, but not yet generalized for arbitrary Web Audio apps.

When working on Audio Return:

- First stabilize Axion Master -> one stereo FL Mixer channel.
- Do not start Kick / Snare / Hat / 808 Multi-Out until stereo master return is verified stable.
- Avoid returning reused AudioWorklet buffers before WebRTC send has copied or consumed them.
- Guard against NaN, infinity, and extreme sample values before output.
- Keep local browser monitoring disabled by default in WebRTC mode to avoid double playback.
- Keep Axion Web audio on the browser `AudioContext.sampleRate`; do not recreate the Web engine from DAW sample-rate notifications.
- If Chrome goes to the background, prevent catch-up burst playback by clearing pending Axion step timers and resyncing from DAW transport on visibility restore.

## State Save Policy

Do not claim FL project persistence is complete unless verified by this exact sequence:

1. Open FL Studio.
2. Load LinkinDAW.
3. Open Axion through WebRTC.
4. Edit Kick / Snare / Hat / Native 808 pattern.
5. Save FL project.
6. Close FL Studio.
7. Reopen the project.
8. Reconnect WebRTC.
9. Confirm Axion pattern restores.

FL piano roll notes are not LinkinDAW state. They belong to FL Studio MIDI / piano roll. Axion Native 808 step state belongs to Axion pattern state when included in the saved JSON.

## GitHub Public Alpha Policy

Before GitHub publication:

- Add or verify `.gitignore`.
- Exclude build outputs, VST3 binaries, local caches, `.wrangler`, `node_modules`, and private environment files.
- Add `LICENSE`.
- Add third-party license notices for dependencies.
- Keep README honest: Windows + FL Studio only, experimental, no installer, production route not finalized.

Do not create a GitHub release binary until installer/signing/packaging decisions are explicit.

## Verification Commands

Useful checks:

```powershell
node --check WebApp\public\axion\src\axion\axion-app.js
node --check WebApp\public\axion\src\axion\audio-engine.js
node --check WebApp\public\axion\src\axion\arcana-processor.js
node --check WebApp\public\axion\src\axion\linkindaw-webrtc-adapter.js
cd WebApp
npm run build
```

VST3 build normally uses the Visual Studio bundled CMake when `cmake` is not on PATH:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' --build build-webrtc5 --config Release --target LinkinDAW-vst3
```

## Communication Style

Be direct about uncertainty. If something is not verified, say so.

Prefer:

```text
Implemented and builds, but not yet FL verified.
```

Avoid:

```text
Done.
```