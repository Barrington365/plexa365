# Separate companion window

The companion toolbar now has **Open agent in separate window**. It opens the same authenticated companion in a movable browser popup. Browser settings may open a tab instead; this is not a transparent, always-on-top native desktop pet. The separate native Tauri app remains subject to its own sign-in and distribution acceptance.

Selected agent and optional project ID are passed as hints, never credentials. The existing companion API revalidates account, role, agent and project access. The window has no opener reference. Popup blocking leaves the original companion visible with instructions. Opening a window never activates tools.

The live conversational endpoint remains chat-only. Retrieval and editing adapters on the separate execution branch are not included in this presentation release. Do not claim that this release fixes video editing permissions or executes a task.

Rollback: revert this change; no data, settings, credential or schema migration.

## Verification — 5 November 2026

Safari and Chrome opened a separate local browser window. Chrome test-fixture expiry returned a sign-in prompt and cleared private content; restored access reloaded Bob. JavaScript syntax, TypeScript, lint, unit/API tests and production build passed. Project context now includes the actual /workspace/projects editor route.

Release review remains NEEDS FIXES: real authenticated popup expiry/sign-in, main UI regression and context checks remain required. No production deployment of this popup change is claimed.

Live project search was attempted through Bob on 5 November: Bob explicitly could not retrieve the named TEAMtalk project. The conversational endpoint still needs authorised retrieval adapters; this presentation patch does not supply them.
