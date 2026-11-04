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
