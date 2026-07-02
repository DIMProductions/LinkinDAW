# LinkinDAW Cloudflare Signaling PoC

Minimal HTTPS signaling endpoint for LinkinDAW WebRTC DataChannel pairing.

It only relays WebRTC setup messages:

- `offer`
- `answer`
- `candidate`

It must not carry MIDI, audio, Axion state, auth, payment, installer logic, or private project data.

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

## Current Production Status

Route:

```text
https://dim.productions/linkindaw-signal
```

Current deployed Worker version:

```text
17c54c3d-d8fb-496e-948d-2babb9d165dd
```

Current storage mode:

```text
cache-api-fallback
```

Durable Objects signaling hit Cloudflare free-tier request limits during Public Alpha testing. The current production deployment therefore uses a temporary Cloudflare Cache API fallback for room messages.

This is acceptable for short-lived Public Alpha signaling tests, but it is not the final production signaling design.

## Deploy

From this directory:

```powershell
npx wrangler deploy
```

Then verify the deployed HTTPS endpoint:

```powershell
$body = @{ from='browser'; to='native'; kind='offer'; sdp='test-sdp' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'https://dim.productions/linkindaw-signal/rooms/test-room/messages' -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri 'https://dim.productions/linkindaw-signal/rooms/test-room/messages?to=native&after=0'
```

Expected response metadata includes:

```json
{
  "storage": "cache-api-fallback"
}
```

## Notes

- Messages expire after roughly two minutes.
- Room IDs are pairing tokens, not authentication.
- This Worker is only the WebRTC setup relay. Runtime DAW/WebApp data travels over the WebRTC DataChannel.
