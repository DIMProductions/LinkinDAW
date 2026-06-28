# Public Alpha Checklist

This checklist tracks the source-publication gate for LinkinDAW Public Alpha.
It is not a product release checklist and does not authorize binary releases.

## Ready / Prepared

- README states Windows + FL Studio only, experimental developer preview status.
- README points to Demo Freeze v0 and current FL verification language.
- AGENTS.md prevents roadmap drift and overclaiming.
- ARCHITECTURE.md documents the current WebRTC, Axion, state, audio return, and out-of-scope boundaries.
- SECURITY.md documents Public Alpha security boundaries and non-goals.
- `.gitignore` excludes build outputs, VST3 binaries, local caches, `node_modules`, `WebApp/dist`, `.wrangler`, private env files, exports, and private research notes.
- MIT `LICENSE` added for LinkinDAW source code.
- `THIRD_PARTY_NOTICES.md` added for native and Web dependencies.
- `tools/update-vst3.ps1` defaults to repository build only and does not modify Program Files unless `-InstallToProgramFiles` is passed.
- `Dependencies/libdatachannel` and `Dependencies/mbedtls` are listed in `.gitmodules` and staged as submodule gitlinks for source publication.

## Must Check Before First Push

- Resolve or intentionally keep any dirty state inside existing submodules. Current known item: `Dependencies/iPlug2/Dependencies/IPlug/VST3_SDK/README.md` has local changes.
- Confirm `WebApp/package-lock.json` is committed and `WebApp/node_modules` is ignored.
- Confirm `WebApp/dist` is ignored for source publication, unless a later Local Beta packaging decision explicitly changes this.
- Confirm no secrets or account tokens are present in Worker PoC files. `wrangler.toml` route names are public configuration, not credentials.
- Confirm `Web-DAW Connector Feasibility Research.docx` remains ignored unless explicitly approved for publication.

## Do Not Do For Public Alpha

- Do not publish a GitHub release binary.
- Do not deploy production `https://dim.productions/axion/*`.
- Do not add installer/signing/notarization work.
- Do not claim macOS, AU, arbitrary Web Audio app compatibility, multi-out, or product beta readiness.
- Do not copy to `C:\Program Files\Common Files\VST3\LinkinDAW.vst3` as part of publication prep.

## Minimum Source Publication Claim

A Windows-first experimental VST3 connector that sends DAW MIDI, tempo, transport,
state, parameters, and experimental stereo audio return data to compatible Web Audio apps,
with Axion staging used as the current reference integration.
