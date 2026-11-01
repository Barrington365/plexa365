# Plugins release review — 1 November 2026

PR #2, codex/plugins-release. User Barrie approved deployment; the mandatory automated review has not approved merge.

## Remediation
- Invalid and future-dated health checks cannot produce Connected.
- Added invalid JSON, viewer/admin inventory and provider timeout/error tests.
- Added real signed-session/guard integration tests. Active verified Admin can check; Editor/Viewer/guest cannot. Current persisted roles override old session claims. Inactive/unverified users and cross-origin requests are rejected.

## Verification
Full release gate: TypeScript, lint, 331 tests passed, one pre-existing skip, production build passed. Latest main e4a8955 merged. Authentication tests mock only storage/provider IO, not guards or session signing/verification. No existing credentials or permission policy changed.

## Required review
Live Dev Gateway still reports NEEDS FIXES after receiving implementation and passing test evidence. Latest fix prompt: "Review the handling of plugin checks and ensure that all edge cases are covered, particularly around user roles and API interactions." Risks are conditional/general; no failing case or concrete defect supplied. Do not interpret passing tests as reviewer approval. No merge or production deployment performed.

## Rollback
Revert PR via reviewed branch and redeploy previous main. No existing schema/env/credential changes; isolated non-secret health/lease stores can remain unused.
