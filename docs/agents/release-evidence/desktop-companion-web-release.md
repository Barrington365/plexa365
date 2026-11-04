# Companion web and server release — PR 10

The release adds awake/resting eyes and desktop sign-in endpoints. The native Mac client is development source only: no public app or DMG is distributed. Opening a character does not activate its tools.

- TypeScript, lint, production build and automated tests passed (420 passed, one unrelated external fixture skipped).
- Isolated QA: normal browser login/session/logout, invalid password, companion, cross-origin rejection, desktop authorisation/exchange/read/logout and revoked-token rejection passed. The native QA browser callback showed connected Bob with execution paused.
- Netlify deploy preview: an expiring, scoped PKCE fixture exercised the real blob store, exchange and companion adapter. Eight concurrent exchanges returned one 200 and seven 401s. Read succeeded without issuing a browser cookie; an activation request was rejected. Logout returned 204 and both token reuse and code replay returned 401. This hosted check used a seeded code; browser approval was tested locally.
- Credential storage: hosted deployments use the Netlify blob store. Local QA directory/file modes were checked as 0700/0600. The hosted fixture was revoked, with no tokens persisted to the local QA environment or this report.
- Safari: normal eye artwork renders with an accessibility-hidden overlay. Malformed eye coordinates or a missing stylesheet leave the original character and its controls visible. Return on the focused, named character button opened the conversation history. Accessibility-tree verification does not constitute a spoken VoiceOver test.
- Rollback: revert PR 10 and redeploy. The previous version ignores the new credential records; there is no migration or required environment change.

Mac installer acceptance, Developer ID signing, notarisation and distribution remain separate.

Artwork checks on the final release candidate: 421 tests passed, one skipped. The release gate checks all eight coordinate maps against the real PNG dimensions. A separate isolated Next.js build using the release's AgentCharacter.tsx failed as expected on malformed JSON (exit 1, `Cannot parse JSON`) and a missing map (exit 1, `Module not found`).

VoiceOver test procedure: in Safari, focus the character button. Confirm the announced name is “Expand conversation with Bob”; the decorative eyelid SVG must not be an additional stop. Activate with Return and verify the history panel becomes available. The macOS accessibility tree exposed the named button and excluded the decorative overlay; keyboard Return opened the history. VoiceOver was started for an audible check, but the Mac locked before spoken output could be verified. Do not record audio as passed.
