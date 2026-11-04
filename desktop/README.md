# Plexa Companion for macOS — 0.1.0 development build

Native Tauri 2 extension of the existing Plexa companion. This is **not approved for distribution**. No production deployment or agent activation has been performed.

## Source and architecture

- `ui/`: small native toolbar and device preferences.
- `scripts/prepare.mjs`: copies the existing `public/agents` assets, companion script and styles into the local bundle. No new character identities or second chat implementation.
- `src-tauri/`: native window, menu bar, secure credential bridge and fixed destinations.
- `../app/api/desktop/`: single-use PKCE sign-in exchange, companion-only authenticated adapter and logout.
- `../app/desktop/connect/`: browser approval page using existing Plexa sign-in.
- `../app/lib/desktop/sessions.ts`: hashed opaque credentials, current-user rechecks, expiration and atomic one-time consumption.

The local WebView cannot access provider keys or its own desktop credential. Rust stores that credential in macOS Keychain and calls only the fixed Plexa companion endpoint. The server reuses existing chat, scope, project, learning and conversation handling. It does not expose task activation, publishing, shell, filesystem or arbitrary URL access. Remote web content is not loaded into the privileged window. Sign-in codes expire after two minutes, pending native flows after five minutes, and desktop sessions after twelve hours. Logout revokes the server token before removing it from Keychain. Offline logout reports an error and can be retried.

Desktop preferences include topmost, start minimised, opt-in login startup and private notifications. Agent appearance/preferences remain in the existing shared preference store. Window size/position are device-local. Notifications contain a generic message, not story/project details. Read-only checks run every 30 seconds while visible and every 90 seconds while hidden only when notifications are enabled and a session has loaded. No POST is automatically replayed.

## Build

Requires Xcode command-line tools, Rust stable and Node/npm. Tauri documentation: https://v2.tauri.app/

```sh
npm ci --prefix desktop
npm run build --prefix desktop -- --debug --bundles app
```

For isolated development only, compile with `PLEXA_DESKTOP_DEV_ORIGIN=http://127.0.0.1:8123`. This override is unavailable in release builds. Never use production data or provider keys in the fixture environment.

## Artifacts

- `artifacts/macos/Plexa Companion.app`
- `artifacts/Plexa-Companion-0.1.0-arm64-development.dmg`
- `artifacts/local-qa/Plexa Companion.app`: local-origin QA build, requires isolated test server; not distributable.

The main artifact points to planetsport.studio. Its new server routes are **not deployed**, so production sign-in cannot work yet. This is Apple Silicon only. The available certificate is Apple Development, not Developer ID; these artifacts are development/ad-hoc builds, not notarised releases. No Gatekeeper bypass should be requested or used.

After approved server deployment and signing, mount the DMG, copy the app to Applications and launch. Use Sign in with browser, approve the matching request, return to the app. Opening the character does not activate tools. The menu bar provides Show, Hide and Quit. For now, use only the local QA workflow; do not send the installer to users.

## Evidence and acceptance status — 4 November 2026

- Rust compilation and native `.app` bundle: passed.
- Real Mac launch: passed, on Apple Silicon.
- Browser login / one-time callback / Keychain storage / authenticated native GET: passed with a synthetic Admin account in an isolated local backend. Screenshot: `../docs/desktop-evidence/native-signed-in.png`.
- Original Bob character rendered in native WebView: observed. All eight assets bundled; all eight native visual states not yet individually checked.
- 420 unit/API tests passed, one skipped (existing suite), including 11 new desktop tests.
- TypeScript and lint passed; lint has existing unrelated warnings.
- Web production build passed before the final collision guard/test additions; final build recorded separately below if rerun.
- A rebuilt app triggered macOS Keychain approval. Automated computer control cannot interact with SecurityAgent; the user was asked to approve. Restart/session persistence remains pending.
- Snapshot captured before clearing a stale sign-in notice; source fixes this on the first successful native load. That visual fix still needs recheck after Keychain approval.
- Process sample: native main process 0.0% CPU, approximately 104 MiB RSS while waiting. This excludes WebKit helper processes and is not sustained performance acceptance.

### Outstanding release blockers

Real OpenAI reply and web/desktop history continuity; native logout and revoked-account UI; multi-monitor repositioning; desktop composited transparency and click-through; drag/resize/menu-bar restore; native notification delivery/dedup across browser; sustained whole-app performance; restart preferences and Keychain access after signing. Intel build not tested. No automatic screen/project reading is provided: project selection is explicit and server validated. The existing companion API returns task and approval records; there is not a separate native notification inbox.

Transparent window is configured, but screenshot capture alone does not establish compositor transparency. Transparent empty areas currently belong to the window; per-region click-through is not implemented. Do not describe these as verified.

Before release: finish native acceptance, review authentication/security diff, obtain Developer ID/notarisation setup if distributing, deploy server endpoints through existing approved workflow, verify production sign-in, then obtain Admin distribution approval. Keep agent tools paused throughout.

### Keychain development repair

Local QA now has its own bundle identity (`studio.planetsport.companion.qa`) and `plexa-dev` callback, avoiding ambiguity with production builds. Loopback debug builds keep a test credential in memory only; closing the app requires sign-in again. Release builds retain Keychain storage and cannot enable the loopback override. The QA callback was verified on the real Mac with Bob displayed and tools paused, without a Keychain request. See `../docs/desktop-evidence/qa-keychain-repair.png`. This resolves local testing only, not production signing or persistent Keychain acceptance.

Build the isolated QA variant:

```sh
PLEXA_DESKTOP_DEV_ORIGIN=http://localhost:8123 npm run build --prefix desktop -- --debug --bundles app --config src-tauri/tauri.qa.conf.json
```
