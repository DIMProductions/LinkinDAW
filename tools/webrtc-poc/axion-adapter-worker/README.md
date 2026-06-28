# Axion Adapter Worker Staging

Staging-only Worker for serving Adapter-enabled Axion without touching production `/axion/*`.

Current route:

```text
dim.productions/linkindaw-axion-probe
dim.productions/linkindaw-axion-probe/*
```

Verified staging URL:

```text
https://dim.productions/linkindaw-axion-probe/
```

Current verified Worker version:

```text
34209dac-1f4b-4c8e-8cbd-a4289e4ee4e2
```

Do not deploy this Worker to `dim.productions/axion/*` until explicitly approved.

Probe command:

```powershell
$env:LINKINDAW_SIGNALING_BASE = 'https://dim.productions/linkindaw-signal'
$env:LINKINDAW_SIGNALING_PAGE_URL = 'https://dim.productions/linkindaw-axion-probe/'
node tools\webrtc-poc\webapp-adapter-integration-poc.mjs
```

## Frozen staging status

`https://dim.productions/linkindaw-axion-probe/` now serves Adapter-enabled Axion directly.

Verified:

- Root URL returns `AXION PROTOTYPE`
- Query parameters are preserved
- `?linkindaw=webrtc&room=<roomId>` starts the adapter
- Cloud signaling succeeds through `https://dim.productions/linkindaw-signal`
- RTCDataChannel opens with the local C++ bridge probe
- DAW-style JSON is acknowledged by the WebApp

Keep this route as the official experiment URL until production `/axion/*` is explicitly approved.

