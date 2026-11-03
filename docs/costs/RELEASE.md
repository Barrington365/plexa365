# Cost & Credits release — 3 November 2026

Branch: `codex/cost-credits`; base main: `8870b67`.
Requested by Barrie Jarrett: push to live and add to Tools.

## Scope
Admin-only `/cost-credits`, Tools submenu and Plugins link; persistent manual accounting, budget records, targets, Studio video history, per-project reporting/reconciliation and Video Library Costs action. No provider settings, live agents or paid execution paths changed. Automated provider billing collection and spending enforcement remain explicitly unavailable.

## Validation
- `npm run release:gate` passed TypeScript, lint (existing warnings), all 365 tests (one skipped) and production build.
- Four additional Blob storage tests passed: CAS contention, creation race, missing/stale etag, unavailable store. Total focused cost tests: 25.
- Authenticated local production-server QA: save200, stale409, anonymous401; Costs links exact project; no overflow320/390/768/1440. Synthetic fixture records restored after tests.
- OpenAI Dev Gateway release review: NEEDS FIXES twice. Second result in `release-review.json`. Review raises generic auth/concurrency/API/performance concerns with no concrete fix prompt despite included code/test evidence. No override has been assumed.

## Storage / environment
New isolated `plexa-cost-controls` Netlify Blob store is created on first Admin save. Existing stored provider settings are reused read-only. No environment changes or migrations. Existing workspace remains source of project/render history. Production agents remain unchanged.

## Rollback
Revert the feature merge via a new pull request and redeploy the previous release. Retain the additive cost store to preserve accounting records; no data deletion or migration is needed. Affected surfaces: Cost & Credits, Tools menu, Plugins link and Video Library Costs button.

## Deployment
Not merged or deployed. Repository release review gate remains unresolved. Production was observed on ancestor `ac92d53`; current main is `8870b67`, so release will also include main's previously merged agent UI changes, without activating agents.

## Follow-up fixes — 3 November 2026
- Cost writes now distinguish validation/conflict from storage outages. Unknown exceptions return fixed 503 messages; invalid commands also use fixed text, not exception details.
- Video reconciliation rejects negative versions and has explicit concurrent ledger/reconciliation CAS coverage.
- Added integration tests using real HMAC session verification and real Admin guard: anonymous/tampered401; editor/viewer/inactive/unverified403 even with an Admin role in a signed token; current verified Admin200.
- Release-review parsing now preserves structured findings (previously lost as `[object Object]`). Blocking outputs without remediation are rejected, leaving merge blocked. Tests cover validation cases. The approval threshold is unchanged.
- Latest full release gate: 378 passed, 1 skipped; TypeScript, lint and production build passed. `git diff --check` passed.
- Latest review remains NEEDS FIXES. It requests authentication verification already covered by `app/api/costs/auth.integration.test.ts`. The complete supplied evidence fit the 24,000-character input limit. No approval was inferred and no merge/deploy performed.
