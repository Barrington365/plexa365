# QA follow-up: physical Android companion verification

Status: Open — no paired Android hardware available during this release.
Scope: floating companion presentation, not agent execution.

Known risk: Chrome/Firefox on Android may handle the keyboard and visualViewport offsets differently from Safari. Desktop 480px and physical iPhone Safari checks passed; they do not prove physical Android behavior. Input font size is 16px; viewport bounds have an innerHeight/clientWidth fallback. No permission changes depend on browser layout.

After release, QA should verify on physical Android Chrome (and Firefox where available): open/close, minimise/reopen, drag, keyboard show/hide, input/send visibility, zoom, saved preferences, and one scoped conversational reply. Capture screenshots and browser/device versions. If controls are inaccessible, revert the companion release and redeploy the previous main commit.

Server permission checks remain mandatory on every request, regardless of browser. Negative API tests cover unauthenticated/viewer access, cross-origin writes, private agents, execution actions, and role/scope revocation across asynchronous boundaries.
