# Floating companion release status — 4 November 2026

User authorised production deployment. Deployment has not occurred: automated release review returned BLOCK MERGE. Agents remain paused.

Changes: shared floating companion, original animated characters, Launch agent button, user preferences, scope-filtered history, verified saved Studio context. No new task runner, tool activation or publishing.

Final release gate: TypeScript, lint, 397 tests passed (1 skipped), production build passed. Tests cover current user preference preservation, revoked/inactive/unverified user rejection and direct dialogue access denial. Authenticated local Admin UI and real OpenAI conversational replies were checked previously; assigned Editor UI and physical-device checks remain outstanding.

Review evidence is companion-review-2026-11-04.json. Review asserts role checks are absent; current requireUser rereads the user, the route checks admin/editor, canAccessAgent enforces active/verified/scope, and saveCompanionPreferences rereads current user and rejects revoked roles before write. Dialogue helper additionally checks canAccessAgent. These disagreements require resolution under existing release rules; the review has not been overridden.

No database migration or environment change. Rollback after any future release: revert feature merge and redeploy previous main. No production agent activation is authorised by this presentation release.
