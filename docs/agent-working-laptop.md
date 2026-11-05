# Agent working laptop

The existing eight character assets are reused with a lightweight CSS laptop overlay. No provider generation, new identity, credit use or duplicate character library is required. Bob/Fiddle and the six padded engineering portraits have separately positioned overlays. The screen cursor and typing movement respect Pause animation, companion animation preferences, reduced motion and hidden tabs.

The read-only companion response supplies working status from an approved Active agent's same-brand, same-workspace Working task with a current run ID and unexpired worker lease. Queued, waiting, paused, completed, failed, cancelled and expired tasks do not display working artwork. Chat uses its existing thinking pose and never implies task execution. Status polls every five seconds while visible; failed reads clear working status, and a twenty-second freshness limit stops stale artwork. No task/permission/provider endpoint is invoked by the animation.

Instructions for future runner integration: keep task owner/scope, run ID and lease current in the existing agent store. Do not trigger artwork by setting a client-only busy flag. Never activate an agent to demonstrate this visual. Other six agents remain paused under the existing execution-release policy.

This release changes presentation only, not the separate pending execution release. Current main keeps every agent paused, so live working artwork will remain absent until authorised execution is deployed. It does not prove Bob/Fiddle production video acceptance.

Rollback: revert this PR. No database migration, credential change or environment variable change.

Validation: release gate passed (438 tests passed, one unrelated skipped), TypeScript, lint and production build. Safari inspected all eight compositions. The real companion script was exercised against an explicitly labelled local fixture: Working displayed the laptop and task title; Pause removed the working label on the next status refresh. This is presentation evidence, not real provider execution. Visual evidence: agent-laptop-evidence/all-eight.png. User authorised main/live release in this chat.
