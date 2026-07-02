# Public Alpha Checklist

This checklist tracks the source-publication gate for LinkinDAW Public Alpha.
It is not a product release checklist and does not authorize binary releases.

## Ready / Prepared

- README states Windows + FL Studio only, experimental developer preview status.
- README describes the current LinkinDAW Launcher flow.
- README states that production `dim.productions/axion/*` is not updated for this preview.
- README documents the temporary Cloudflare Cache API signaling fallback.
- README separates Axion Native 808 / Audio Return from FL piano-roll MIDI.
- README keeps 808 MIDI export language experimental and approximate.
- AGENTS.md prevents roadmap drift and overclaiming.
- ARCHITECTURE.md documents the current WebRTC, Axion, state, audio return, and out-of-scope boundaries.
- SECURITY.md documents Public Alpha security boundaries and non-goals.
- `.gitignore` excludes build outputs, VST3 binaries, local caches, `node_modules`, `WebApp/dist`, `.wrangler`, private env files, exports, and private research notes.
- MIT `LICENSE` added for LinkinDAW source code.
- `THIRD_PARTY_NOTICES.md` added for native and Web dependencies.
- `tools/update-vst3.ps1` defaults to repository build only and does not modify Program Files unless `-InstallToProgramFiles` is passed.
- `Dependencies/libdatachannel` and `Dependencies/mbedtls` are listed in `.gitmodules` and staged as submodule gitlinks for source publication.

## Current Runtime Truth

- FL verified: LinkinDAW can open the cloud launcher.
- FL verified: Launcher can open Axion staging with the generated `roomId`.
- FL verified: Axion can produce sound in FL Studio after the signaling fallback fix.
- FL verified for current Axion staging setup: experimental stereo Audio Return.
- Implemented but still needs broader verification: full FL project close/reopen pattern-state persistence.
- Implemented but still needs broader verification: multiple plugin instances.
- Experimental: ENIGMA probe route exists for non-Axion app testing, but broad arbitrary WebApp compatibility is not claimed.
- Temporary: `linkindaw-signal` currently uses Cloudflare Cache API fallback because Durable Objects hit free-tier request limits.

## Must Check Before First Push

- Resolve or intentionally keep any dirty state inside existing submodules. Current known item: `Dependencies/iPlug2/Dependencies/IPlug/VST3_SDK/README.md` has local changes.
- Confirm `WebApp/package-lock.json` is committed and `WebApp/node_modules` is ignored.
- Confirm `WebApp/dist` is ignored for source publication, unless a later Local Beta packaging decision explicitly changes this.
- Confirm no secrets or account tokens are present in Worker PoC files. `wrangler.toml` route names are public configuration, not credentials.
- Confirm `Web-DAW Connector Feasibility Research.docx` remains ignored unless explicitly approved for publication.
- Confirm Axion opened from LinkinDAW Launcher has no obvious topbar layout overflow at normal Chrome sizes.
- Confirm WebApp name display is metadata/title-driven, not hardcoded to Axion.
- Confirm LinkinDAW `Open Web App` points to `https://dim.productions/linkindaw-launch/` in the current source.
- Confirm `https://dim.productions/linkindaw-signal/` reports `storage: "cache-api-fallback"` while this temporary signaling mode is active.
- Keep MIDI language honest: `.axi` import/export exists, 808 `.mid` export is experimental/approximate, `.mid` import into Axion is not implemented.

## Do Not Do For Public Alpha

- Do not publish a GitHub release binary.
- Do not deploy production `https://dim.productions/axion/*`.
- Do not add installer/signing/notarization work.
- Do not claim macOS, AU, arbitrary Web Audio app compatibility, multi-out, or product beta readiness.
- Do not copy to `C:\Program Files\Common Files\VST3\LinkinDAW.vst3` as part of publication prep.

## Minimum Source Publication Claim

A Windows-first experimental VST3 connector that connects FL Studio to compatible Web Audio apps through a browser launcher and WebRTC DataChannel, with Axion staging used as the current reference integration.
