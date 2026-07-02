# LinkinDAW WebApp Probe Worker

Staging-only Worker for serving LinkinDAW WebApp probes without touching production `/axion/*`.

Current routes:

```text
dim.productions/linkindaw-axion-probe
dim.productions/linkindaw-axion-probe/*
dim.productions/linkindaw-enigma-probe
dim.productions/linkindaw-enigma-probe/*
```

Verified staging URLs:

```text
https://dim.productions/linkindaw-axion-probe/
https://dim.productions/linkindaw-enigma-probe/
```

Current verified Worker version:

```text
f37cd237-0b67-48e0-bce1-342c038f86a3
```

Do not deploy this Worker to `dim.productions/axion/*` until explicitly approved.

Probe command:

```powershell
$env:LINKINDAW_SIGNALING_BASE = 'https://dim.productions/linkindaw-signal'
$env:LINKINDAW_SIGNALING_PAGE_URL = 'https://dim.productions/linkindaw-axion-probe/'
node tools\webrtc-poc\webapp-adapter-integration-poc.mjs
```

## Frozen staging status

`https://dim.productions/linkindaw-axion-probe/` serves Adapter-enabled Axion directly.

Axion verified:

- Root URL returns `Axion`.
- Query parameters are preserved.
- `?linkindaw=webrtc&room=<roomId>` starts the adapter.
- Cloud signaling succeeds through `https://dim.productions/linkindaw-signal`.
- RTCDataChannel opens with the local C++ bridge probe.
- DAW-style JSON is acknowledged by the WebApp.

ENIGMA display/probe verification:

- Root URL returns `ENIGMA Engine - Metallic`.
- `?linkindaw=webrtc&room=<roomId>` still returns ENIGMA HTML.
- Automated browser/native WebRTC probe passes and receives ENIGMA `webapp_ready`, `app_title`, `engine_status`, transport ack, and MIDI ack.
- This route is deployed for display/probe testing and is not FL verified.

Keep these routes as staging experiment URLs until production `/axion/*` is explicitly approved.
