# Local core implementation status

28 October 2026. Local checkout: `plexa365-local`, branch `codex/msn-local-upgrade`. No commit, push, deployment, remote database operations or new paid generation performed.

## Implemented locally

- Home with collapsible navigation, light/dark mode and three reusable template starters.
- Persistent independent projects, custom template saves, recoverable trash and UTC update timestamps.
- Existing saved Mac Allister article selection into an editable project. This is a local pilot adapter, not a general live article importer.
- Scene duration, scene add/duplicate/remove, timeline scrubber and visual playback.
- Image/logo/text layers, positioning, sizing, ordering, local fonts, colours and text wrapping.
- Shared local assets, uploads with readable-media validation, retained metadata, image cutouts and brand asset selection.
- Existing narration selection (Sam preference), narration trim/volume, music trim/start placement/volume/fades.
- Editable SRT, three caption presets, burned captions, subtitle download and highlighted brand keywords.
- SEO description/tags/source/language retained with project and render metadata.
- Saved-project-to-FFmpeg rendering, cancellation, real MP4 output, range delivery, local Library, downloads and multi-clip assembly.
- Hourly cron calculation corrected to retain an upcoming run within the current hour. No live cron invoked.

## Verification

41 local module tests and 27 offline scheduler tests pass; 69 selected existing import/voice/library tests passed during the audit. TypeScript check passed before final verification and was rerun afterward.

Three 57-second layouts rendered from the same saved source article and existing Sam recording. The transfer layout deliberately shows an unknown destination, not a claimed deal. A 171.02-second combined file compares the layouts; it is not three different stories. FFmpeg decoded the scene outputs. Browser playback advanced with readyState 4 and no error; MP4 download succeeded. Actual render frames showed white/cyan captions after correcting oversized subtitle scaling.

Desktop review files: `/Users/barriejarrett/Desktop/Planet Sport Videos/Football365/Plexa Core Review 2026-10-28`. Manifest includes SHA256 hashes, local URLs and output timestamps.

## Not finished / not release-ready

The broad platform upgrade is NOT complete. The new editor runs on the loopback service at port 8100; it has not been integrated into the existing authenticated Next application project/job/Library repository. Existing Plexa functionality is preserved in source.

Still required: general article import/feed bridge, AI rewrite/script generation, actual account voice catalogue and synthesis, automatic speech transcription/alignment, full in-editor audio/video synchronization, drag/resize/group/lock/undo workflows, animation and element timing, per-word caption styling controls, template inheritance/versioning, broader brand automation, translation/review workflows, AI image-to-video and creative generation, shared projects and access-controlled public links, full live provider/import/cron verification and production build/deployment checks.

Provider-backed work must use the existing server-side integration paths without exposing credentials. No remote database access is implied by this local work. Shared/public controls must remain unavailable until real authorization and persistence are integrated. See `docs/MSN-CORE-INTEGRATION-AUDIT.md` for the broader audit and historical findings; subsequent fixes are described here.
