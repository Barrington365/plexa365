# Local MSN assembly — first implementation slice

Extends the existing Studio repository; existing templates, settings, auth, routes and remote storage code are untouched. This loopback-only test surface allows the new encoder to be verified independently before wiring it into the authenticated Studio UI. It is not a replacement Studio, a production server or the complete MSN/editor upgrade.

Run from the repository root:

    npm run dev:msn-local
    npm run test:msn-local

Open http://127.0.0.1:8100. Uses the existing ffmpeg-static dependency. No environment file is loaded, provider is contacted, remote database is accessed, or paid generation is run.

Sources: existing local output/video, template examples and the user-supplied Desktop demo clips. Stable IDs are recorded under output/msn-local/asset-registry.json. This first local harness has the user's Desktop source directory configured explicitly; production integration must replace that with the existing authenticated Library catalogue.

Workflow: Library selection -> ordered trims and mute -> build snapshot -> normalized clip encoding -> concat -> duration/dimension/audio validation -> atomic final MP4 -> persisted local Library -> range-enabled playback and download. Completed outputs can be reused as inputs. Originals are read only. Silent inputs receive silent audio; muted inputs are re-encoded silent. Source captions stay burned into the pictures. Output is landscape 1920x1080, 30fps H.264/AAC; other aspect ratios are fitted without cropping.

One render at a time, local Host/Origin checks, bounded clip count/duration, cancellation and interrupted-job status. Draft edits while rendering apply to the next build; current jobs retain their input snapshot. Progress is stage-based. Retry currently rebuilds the full sequence (no provider charges). Server stores job and media files on disk and browser stores draft edits.

Verified 28 October 2026:
- Five tests: order/trim/mute validation, invalid bounds, job limits, real mixed-resolution silent/muted encoding, cancellation cleanup.
- Actual 5-clip TEAMtalk output, 20.02s, 1920x1080, audio stream; full decode without errors.
- Browser playback and seek; download hash matches output.
- Completed output and source selection restored after server restart.
- Source transition is 960x540 despite filename; normalized to 1080p.

Still required: wire engine into existing Studio page/authenticated job workflow and full Library, article-to-video four-minute MSN build, narration/music replacement and mixing, subtitle regeneration/editing, template-by-template regression, import/cron fixes and controlled execution, multi-user production worker/recovery/storage. No claims of production readiness, full sync/listening review, cloud delivery or native-device QA.

## Local player and embeds
Completed Library videos have a separate Publish video action. Review title, brand and description, then publish locally. Player preview opens an iframe using `/embed/<job-id>`; Copy embed code provides the same stable URL. Unpublish disables the player and published media routes while retaining the Library MP4. Publication state and UTC update timestamps persist in jobs.json.

These links are loopback-only and do not work for public article readers. No cloud upload, public hosting, MSN delivery, analytics or advertising is implemented. The original Library and source preview URLs remain available locally; unpublishing is not deletion or DRM. Already buffered or downloaded video cannot be recalled.

## Hosted upgrade (29 October 2026)

The editor is now mounted at `/workspace` with the existing verified Studio login.
Production adapters use the dedicated `plexa-studio-workspace` Netlify Blob store;
existing production stores and routes remain available. Migration is an explicit
administrator action at `/workspace/import`: SHA-256 chunks are verified before
one conditional activation preserves project IDs, timestamps and media. Local
source files are never removed. Prepare a package with
`scripts/prepare-studio-migration.mjs` and the approved source-media directories.
Runtime data, provider configuration and migration packages are excluded from Git
and deployment bundles.

Background video and narration jobs use the authenticated Netlify worker. A job
becomes complete only after the MP4 is stored, read back, and added to the same
Library manifest. Duplicate claims, cancelled jobs, unavailable workers and
storage failures remain visible. Narration uses the existing server-side
ElevenLabs connection, complete paginated account voices and provider alignment;
uncertain generation outcomes block automatic paid retries. New drafts enable
captions; saved preferences remain unchanged.

Background removal uses the bundled Apache-licensed U2NetP model on WASM CPU,
with the original image preserved. Rendering uses bundled fonts on Linux.
`preview-hosted-workspace.mjs` is an isolated loopback QA harness with paid
providers disabled. Its media and test evidence do not prove live deployment.

MSN feed integration and delivery are planning only. Studio player links require
sign-in; no public publishing or eight-video batch is started by this upgrade.
