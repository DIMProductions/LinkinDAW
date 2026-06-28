# Third-Party Notices

This file summarizes third-party components used by LinkinDAW. The original
license files remain in their dependency directories and should be reviewed
before publishing binary releases.

## Native / VST3 Dependencies

| Component | Use | License | Local license file |
| --- | --- | --- | --- |
| iPlug2 | VST3 plug-in framework and iPlug2 graphics | zlib-style iPlug2 license, with bundled third-party components | `Dependencies/iPlug2/LICENSE.txt` |
| Steinberg VST3 SDK bundled through iPlug2 | VST3 interfaces/build support | Steinberg VST3 SDK license | `Dependencies/iPlug2/Dependencies/IPlug/VST3_SDK/LICENSE.txt` |
| libdatachannel | WebRTC DataChannel native peer | MPL-2.0 | `Dependencies/libdatachannel/LICENSE` |
| mbedTLS | TLS/crypto backend for libdatachannel | Apache-2.0 OR GPL-2.0-or-later | `Dependencies/mbedtls/LICENSE` |
| WebSocket++ | Local WebSocket development/fallback bridge | BSD-style license | `Dependencies/websocketpp/COPYING` |
| standalone Asio | Networking used by WebSocket++ | Boost Software License 1.0 | `Dependencies/asio/asio/LICENSE_1_0.txt` |
| nlohmann/json | JSON parsing/serialization | MIT | `Dependencies/json/LICENSE.MIT` |
| readerwriterqueue | Lock-free queues | Simplified BSD license, with noted bundled zlib code | `Dependencies/readerwriterqueue/LICENSE.md` |

## libdatachannel Bundled Dependencies

The current build links libdatachannel statically. Its source tree includes
additional dependencies with their own notices, including:

| Component | License file |
| --- | --- |
| usrsctp | `Dependencies/libdatachannel/deps/usrsctp/LICENSE.md` |
| libjuice | `Dependencies/libdatachannel/deps/libjuice/LICENSE` |
| plog | `Dependencies/libdatachannel/deps/plog/LICENSE` |
| libsrtp | `Dependencies/libdatachannel/deps/libsrtp/LICENSE` |
| nlohmann/json copy | `Dependencies/libdatachannel/deps/json/LICENSE.MIT` |

## WebApp Dependencies

The WebApp is built with Node/npm packages listed in `WebApp/package.json`,
including React, React DOM, Vite, TypeScript, and ESLint tooling. Their exact
resolved versions and licenses should be audited from `WebApp/package-lock.json`
before publishing a binary or hosted production release.

## Distribution Notes

- Public Alpha source publication should include this file and preserve the
  dependency license files above.
- Do not publish a GitHub release binary until installer, signing, packaging,
  and final bundled license notices are explicitly decided.
- Production `/axion/*` deployment is separate from this source publication
  checklist and requires explicit approval.
