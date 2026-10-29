# Studio hosted upgrade — 29 October 2026

## Scope

Mount the complete local project editor under authenticated `/workspace`, with entry points from the existing dashboard and Studios menu. Preserve existing Studio routes, provider settings, scheduled work and storage. The menu closes after selecting a link.

Production data uses the separate `plexa-studio-workspace` Netlify Blob store. Conditional writes prevent lost edits; content-addressed media survives worker cleanup. Admin migration verifies every byte before activating projects, templates, images, uploads, completed videos, source clips and brand kits. Missing active media blocks migration; existing records are never silently replaced.

Video/narration run in a background worker, with explicit job deadlines and durable Library completion. Playback supports byte ranges and authenticated downloads. Provider voice listing uses the existing server connection and all returned account pages, without premade fallback. Generation retains selected voice IDs, provider alignment, generated audio and uncertain-request guards. No paid generation was run during this release preparation.

New drafts default to burned captions; existing choices remain editable and unchanged. Hosted image removal uses bundled U2NetP WASM CPU inference, preserving originals and rejecting failed masks. Render fonts are bundled for Linux.

## Preparation evidence

- Release gate: TypeScript, lint, 275 application tests passed; one pre-existing live test skipped. Production build passed with existing warnings.
- Studio/brand tests: 90 passed, including real render/assembly, durable reconstruction after worker cleanup, failure states, voice pagination, narration mocks/alignment, migration conflicts and integrity, freshness, byte ranges and caption preferences.
- Real Linux x64 Node 20 rendering: 640x360, 1 second, text and burned caption visually inspected; full MP4 decode passed. Real Linux U2NetP inference succeeded using the bundled model.
- Isolated hosted-editor Lacey build: 36 seconds, 1920x1080; browser played to end and sought back without media error. That existing draft has no narration, so this is not evidence of Sam audio.
- Original 23 completed files: full decode, download hash and byte-range checks recorded in ignored local migration evidence.
- Final prepared import: 12 projects, 23 completed videos, 10 source clips with measured durations, 14 brand kits, 225 files / 123,631,061 bytes. One missing image is referenced only by an already-trashed test draft; warning retained.
- Deployment trace includes segmentation model and WASM, excludes local runtime data/provider configuration.

## Live verification required

Record exact deployed commit and successful Netlify status. Activate the prepared manifest using the signed-in admin import page, then verify counts, original projects/media, Library replay/download/seek, background removal, a no-charge existing-media build, complete voice response and Sam selection. Check responsive editor/navigation. Local evidence above must not be described as live verification.

MSN feed integration/publishing is planning only. Player links remain authenticated. No eight-video batch, database operation, credential change or subscription change is included.

## Hosting regression checks

- 279 application tests passed (one existing test skipped) after the deployment-origin fix; type/lint/production build passed.
- Netlify offline production package passed; `node scripts/check-studio-package.mjs` checks the exact served page/module bytes plus background-removal model and WASM. Catch-all tracing globs previously omitted `animation.mjs` (confirmed ENOENT in production logs).
- Mutation validation and worker/media URLs use configured deployment origins instead of the internally reconstructed request address. Cross-origin, missing-origin and spoofed-forwarding tests remain rejecting.
- Live legacy Eddie Howe file `news-1793101127041-short.mp4` downloaded and fully decoded: 53.3 seconds, 1920x1080 H.264 / AAC. Browser playback and seeking verified.
- New live account voice API returned 35 provider voices, including custom Sam `2yqdQ7uuPQDBMgFA8dgu`; no premade fallback added.
- Migration remains pending the hosting regression release and must be verified before declaring the upgrade ready.
