# Security Policy

## Supported Status

LinkinDAW is currently a Developer Preview / Public Alpha project.

Current supported test environment:

- Windows
- FL Studio
- LinkinDAW VST3
- Chrome with the LinkinDAW launcher and Axion staging route

No production-grade security support, installer signing, payment/auth system, or binary release channel is active yet.

## Reporting Security Issues

For Public Alpha, do not publish sensitive reports as public issues if they include exploit details, private keys, credentials, or a reproducible attack against a deployed service.

Until a dedicated security contact is published, use a private maintainer contact for sensitive reports. Public GitHub issues are acceptable for non-sensitive bugs, crashes, documentation mistakes, and local development problems.

## Current Security Boundaries

The Cloudflare signaling Worker is intended to relay WebRTC setup messages only:

- offer
- answer
- ICE candidates, if used

It should not carry MIDI, audio, Axion state JSON, VST3 parameter changes, auth/payment data, or private project data.

Runtime DAW/WebApp data should travel over the WebRTC DataChannel after peer connection establishment.

Current Public Alpha signaling uses a temporary Cloudflare Cache API fallback after Durable Objects hit free-tier request limits. This signaling route is for short-lived pairing messages only and should not be treated as authentication or persistent project storage.

## Known Public Alpha Limitations

- No authentication or payment layer.
- No installer or code signing.
- No production `/axion/*` deployment is approved from this repository state.
- No secure local `wss://127.0.0.1` certificate flow.
- No claim of compatibility with arbitrary Web Audio apps.
- Audio Return is experimental and Axion-specific in the current staging setup.
- WebRTC room IDs are pairing tokens, not user authentication.

## Local System Safety

Do not copy builds into:

```text
C:\Program Files\Common Files\VST3\LinkinDAW.vst3
```

unless explicitly installing a local test build.

The default `tools/update-vst3.ps1` behavior builds inside the repository and does not modify Program Files. The `-InstallToProgramFiles` flag is required for copying to the system VST3 path.

## Secrets And Deployment

Do not commit:

- `.env` files
- Cloudflare tokens
- account credentials
- private signing keys
- private project files
- generated build outputs
- VST3 binaries

The `.gitignore` is configured to exclude common local secrets, build outputs, node modules, `WebApp/dist`, and private research notes.
