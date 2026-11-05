# Separate companion window

The companion toolbar now has **Open agent in separate window**. It opens the same authenticated companion in a movable browser popup. Browser settings may open a tab instead; this is not a transparent, always-on-top native desktop pet. The separate native Tauri app remains subject to its own sign-in and distribution acceptance.

Selected agent and optional project ID are passed as hints, never credentials. The existing companion API revalidates account, role, agent and project access. The window has no opener reference. Popup blocking leaves the original companion visible with instructions. Opening a window never activates tools.

The live conversational endpoint remains chat-only. Retrieval and editing adapters on the separate execution branch are not included in this presentation release. Do not claim that this release fixes video editing permissions or executes a task.

Rollback: revert this change; no data, settings, credential or schema migration.
