# Floating companion release status — 4 November 2026

User authorised production deployment. Deployment has not occurred: automated release review returned BLOCK MERGE. Agents remain paused.

Changes: shared floating companion, original animated characters, Launch agent button, user preferences, scope-filtered history, verified saved Studio context. No new task runner, tool activation or publishing.

Final release gate: TypeScript, lint, 397 tests passed (1 skipped), production build passed. Tests cover current user preference preservation, revoked/inactive/unverified user rejection and direct dialogue access denial. Authenticated local Admin UI and real OpenAI conversational replies were checked previously; assigned Editor UI and physical-device checks remain outstanding.

Review evidence is companion-review-2026-11-04.json. Review asserts role checks are absent; current requireUser rereads the user, the route checks admin/editor, canAccessAgent enforces active/verified/scope, and saveCompanionPreferences rereads current user and rejects revoked roles before write. Dialogue helper additionally checks canAccessAgent. These disagreements require resolution under existing release rules; the review has not been overridden.

No database migration or environment change. Rollback after any future release: revert feature merge and redeploy previous main. No production agent activation is authorised by this presentation release.

## Follow-up deployment request

Added fresh current-user authorization after read/config loading, immediately before chat persistence, and after AI reply before reply persistence. Added request-time role-revocation tests. Full release gate passed: 399 tests, 1 skipped; TypeScript, lint and production build passed. Automated review still returned BLOCK MERGE, including assertion that preference role validation is absent despite its explicit active/verified/admin-or-editor check. No merge or deployment performed.

## Preference isolation fix

Identified and removed a real concurrency risk: preference writes previously rewrote the shared authentication object and could overwrite a simultaneous role update. New per-user preference records never write authentication data. Current user checks guard reads and writes; absent preference records fall back to legacy preferences/defaults. Chat reply writes are blocked if access is revoked during provider work.

Final verification: 402 tests passed, 1 skipped; TypeScript, lint and production build passed. Automatic review remains BLOCK MERGE and asks to verify checks already supplied. Independent reviewer choice requested using the review skill. No deployment occurred.

## Independent Security Review and remediation

User selected Security Review. Reviewer examined branch at 61578f5 against 14128c3 and reproduced one Medium finding: original Admin identity projected private agent data after demotion to scoped Editor, including provider failure responses.

Remediation: compare current identity/role/scopes before dispatch and after AI; filter model history with latest permissions; revalidate project after AI; reauthenticate after reply persistence; error responses contain no agent data. Regression tests cover demotion before provider and during provider success/failure. Full release gate: 405 tests passed, 1 skipped; TypeScript, lint and build passed.

Automatic release review still BLOCK MERGE, asserting missing user and post-AI role checks despite explicit checks in the submitted files. No override or deployment performed. Independent review was run once; remediation is regression-tested, not claimed as independently re-reviewed.

## Release review evidence integrity

Fixed silent truncation at 24000 characters: oversized submissions now fail before provider calls; accepted material is sent in full. Regression test proves boundary behaviour. Full gate: 406 passed, 1 skipped; typecheck, lint and production build passed.

Sent a complete size-checked focused package (20810 bytes). The configured gpt-4o-mini review still returns BLOCK MERGE with general potential-risk statements, despite supplied implementation and regression tests. The decision remains enforced. Asked user whether to use a stronger OpenAI review model under unchanged criteria; no model/settings override performed and no deployment occurred.

## Authorised stronger review and authenticated Editor smoke test

User approved stronger OpenAI review, with release criteria unchanged. Local review invocation used gpt-4.1; production provider settings were not changed.

Tested built app on port 8120 with a local verified Editor scoped to TEAMtalk / companion-qa. Only Bob/Fiddle appeared. A real OpenAI reply returned while Bob remained Paused. Saved Reduce motion preference persisted through full reload. Screenshot: ../floating-companion/editor-desktop.png. These tests used isolated local records and did not activate production tools.

Real HTTP smoke checks against the built server passed: cross-origin POST 403; Editor request for private Hubble 403; execution action 400; existing session after demotion to Viewer 403. Evidence: companion-http-smoke-2026-11-04.json.

Strong review output is companion-review-strong-2026-11-04.json. It accepts permission evidence but still returns NEEDS FIXES for missing physical mobile UI testing. Browser responsive testing is not represented as a physical-device test. A paired iPhone was detected, but iPhone Mirroring opens its first-run setup, so no physical interaction check was completed. No bypass, merge or production deployment. All previous test/build results remain valid; this follow-up changes documentation/evidence only.

## Physical iPhone check and viewport repair

On 4 November, tested the paired iPhone 16 Pro Max using Safari through iPhone Mirroring. This was real hardware with mirrored taps, not browser device emulation. Used the isolated Next development server and local verified Editor account. The production build was checked separately; its secure cookies were not relaxed for LAN HTTP.

Confirmed character display, minimise/reopen, a new real OpenAI reply to “Mobile check: confirm tools stay paused.”, and a saved Reduce motion preference surviving refresh. Bob remained Paused. Screenshots: ../floating-companion/iphone-chat.png and ../floating-companion/iphone-preferences.png. Physical Android was not tested.

Found Safari input zoom could clip the companion. Set the command field to 16px and clamp the companion to visualViewport dimensions and offsets during zoom, scrolling and keyboard changes. Retested on iPhone: send button and controls visible, chat worked. Existing Studio sidebar takes substantial width on phone; a broader Studio layout redesign is outside this release.

Repeated full release gate after the fix: TypeScript, lint, production build, 406 tests passed and one skipped. JavaScript syntax check passed. Only companion CSS/JS changed in this follow-up. No production settings or agent execution state changed. Rollback remains revert the feature merge and redeploy.

Review clarifications: the single skipped test is the unrelated SixLogics live football fixture test, conditional on absent SIXLOGICS credentials. All companion tests ran. GET is authenticated and read-only, has no cross-origin CORS opt-in, and uses HttpOnly SameSite=Lax sessions; mutating POST additionally checks origin. Legacy preference fallback is read only from the freshly authenticated user's agentCompanion field, with role/scope filtering still performed on that latest user. It does not copy privileges or write authentication records. Physical Android remains untested.

Final stronger review for this follow-up: NEEDS FIXES. No other blocking issues found; reviewer requires physical Android hardware QA despite the documented limitation/follow-up. See companion-review-phone-2026-11-04.json. Physical iPhone is verified; Android is not. No merge or live deployment performed. Local LAN test server stopped after QA. Changes remain on the existing release PR.

## Personal greeting and release authorization

The shared character brief now receives the authenticated profile name from both chat routes. Greetings use that name and guide the conversation with focused questions; no browser-supplied identity or new tool permissions. 409 tests passed, 1 unrelated live fixture skipped; TypeScript, lint and production build passed. Real OpenAI controlled-profile greeting evidence is attached.

Barrie explicitly instructed: “We don't have a Andriod so will have to skip and push to live”. Physical Android is untested and waived for this release; the follow-up remains open. The final stronger review reports no technical blocker, but requests Bazza approval despite this existing authorization. Its NEEDS FIXES result is retained unmodified. Proceeding on the explicit user release authorization, not claiming the reviewer returned SAFE TO MERGE. No production agent tools activated. Rollback: revert this PR merge and redeploy the prior main commit; no environment or database schema changes.
