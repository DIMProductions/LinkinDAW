# LinkinDAW Cloudflare Signaling PoC

Minimal HTTPS signaling endpoint for the WebRTC DataChannel PoC.

It only relays WebRTC setup messages:

- `offer`
- `answer`
- `candidate`

It must not carry MIDI, audio, Axion state, auth, payment, or installer logic.

## Endpoints

```text
POST /rooms/:roomId/messages
GET  /rooms/:roomId/messages?to=browser|native&after=<id>
```

Message shape:

```json
{
  "from": "browser",
  "to": "native",
  "kind": "offer",
  "sdp": "..."
}
```

Candidate shape:

```json
{
  "from": "browser",
  "to": "native",
  "kind": "candidate",
  "candidate": "candidate:...",
  "mid": "0"
}
```

## Deploy

From this directory:

```powershell
npx wrangler deploy
```

Then point the PoC runner at the deployed HTTPS endpoint:

```powershell
$env:LINKINDAW_SIGNALING_BASE = "https://dim.productions/linkindaw-signal"
node ..\cloud-signaling-poc.mjs
```

For the product route, bind it under dim.productions, for example:

```text
https://dim.productions/linkindaw-signal
```

Then test:

```powershell
$env:LINKINDAW_SIGNALING_BASE = "https://dim.productions/linkindaw-signal"
node tools\webrtc-poc\cloud-signaling-poc.mjs
```

## Notes

- Uses a Durable Object per `roomId`.
- Messages expire after roughly two minutes.
- This is still a PoC, not LinkinDAW VST3 integration.


## Current deployed route

- Route: https://dim.productions/linkindaw-signal 
- Worker version verified: 7ba1d03b-5b4e-4d47-a881-801002855d44 
- Verified with https://dim.productions/axion/ and the local C++ libdatachannel peer. 

