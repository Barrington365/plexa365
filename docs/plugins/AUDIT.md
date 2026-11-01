# Plugins integration audit — 1 November 2026

Baseline: main 922c6fb. Audit precedes implementation. No production deployment authorised for this hub. Existing credentials, voice/model settings, agent states, schedules and publishing permissions must remain unchanged.

## Existing configuration and use

Provider settings live in `app/lib/server-secrets.ts` (environment first, existing `plexa-admin-settings` record second), managed at `/admin/provider-keys-and-platform-services`. The hub must read this source, not create a second credentials store.

| Provider | Existing use / evidence | Safe verification |
|---|---|---|
| OpenAI | Script/image/audio generation; language processing; Dev Gateway; agent review. `app/api/admin/openai-check`, `app/lib/ai/providers/openai-provider.ts` | GET models; no inference |
| ElevenLabs | Audio Studio, Studio narration, voice options and presenter assignments. `app/api/audio/tts/elevenlabs`, `app/api/studio-workspace/elevenlabs` | GET voices only. Existing Admin check also generates speech and will NOT be invoked by the hub |
| Runway | Text/image-to-video, image generation, saved task import. `app/api/runway` | GET organisation |
| Mux | Live Control streams, asset checks, webhooks. `app/api/live/providers/mux` | GET one asset; no stream creation |
| Livepeer | Existing alternative live-provider configuration and Admin check | GET stream list; does not prove Plexa publishes through it |
| Daily | Audio guest rooms. `app/api/audio/guests/sessions/[sessionId]/daily-room` | GET rooms |
| Restream | OAuth channels and stream-key integration. `app/api/integrations/restream` | Do not treat client-secret presence or dummy grant rejection as a connected user account |
| Apify | YouTube transcript importer. `app/api/admin/apify-check` | GET current user; no actor run |
| DeepL | Language Studio translation. `app/api/admin/deepl-check` | Usage check exists; leave unverified unless explicitly run |
| DeepSeek | Optional AI routing. `app/lib/ai/providers/deepseek-provider.ts` | Models; enabled flag remains unchanged |
| Higgsfield | Image creation/editing. `app/api/higgsfield` | No automatic generation test |
| Supabase | RSS Import Builder and existing database clients. `app/lib/rss-builder/supabase-server.ts` | Config detection only; no database mutation |
| Netlify | Hosted workspace assets/settings, background render functions. `app/lib/netlify-blob-json.ts`, `netlify/functions` | Runtime configuration only; do not infer health from hosting |
| Resend | Existing transactional email. `app/lib/email/send-email.ts` | Config detection only; no email sent |
| Publisher APIs / MRSS | Existing authenticated exports and client scopes. `app/lib/language-studio/client-access.ts`, `features/msn-local/publishing.mjs` | Preserve client management, not a new provider login |

No implemented direct YouTube publishing, Google Drive, GitHub repository, Getty, AWS S3 or social-account connector was found in this baseline. List planned integrations as Coming Soon with no Connect action. YouTube transcript extraction is an Apify capability, not YouTube account publishing.

## Health and access findings

Existing provider check endpoints generally return transient results; there is no shared durable, credential-version-bound health record. Stored keys alone do not prove connection. Hub checks will store separate non-secret observations, expire success after 24 hours and invalidate success when effective credentials change. Failure must never clear credentials.

Existing ElevenLabs Admin test calls text-to-speech; it is unsuitable for automatic/read-only regression checks. Existing provider settings remain the management surface. Editors may see a sanitised integration inventory but cannot test, reconnect, change credentials or change provider permissions. Agent access remains governed by its existing tools and grants; this page creates none.

## Baseline limitations

Render generation, paid inference, email sending, social publishing and agent activation are excluded. Regression coverage must distinguish mocked API contracts, real read-only provider checks, and previously existing failures. Provider logos need recorded official source/provenance and local delivery. No Motion screenshot was supplied in this message; use the described icon-container pattern and existing Plexa tokens.
