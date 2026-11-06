# Player preview, sound and branding

The existing Video.js embed now uses muted autoplay, a sound toggle, the published playlist's next poster/title, and the destination brand's existing local icon. No publication or access rules change. Copyable iframe code includes autoplay permission. Previously copied embeds may need that permission added by their host site.

The next card can select the next published item. Manual skipping does not emit completion. The card disappears at the playlist end; sound choice persists across transitions. Missing preview images leave a text card. Unrecognised brands do not receive a guessed logo. Overlays live within Video.js for fullscreen. Advertising and playback measurement remain opt-in; no ad requests or analytics are enabled by this change.

## Validation

- TypeScript, lint, production build and release gate passed: 439 tests passed, 1 skipped (existing suite).
- Eight player service tests passed, including publication, revocation, analytics and filtered playlist delivery.
- Local browser fixture uses the exact public Football365 embed response and its two real published MP4/poster URLs, with the newly built player assets.
- 1280px desktop and 390px mobile inspected. Poster, next thumbnail and Football365 icon loaded; no mobile horizontal overflow.
- Playback, sound-on control, automatic playlist transition, manual next selection, last-item hiding and preserved sound choice verified. Fullscreen UI retained overlays.
- Browser initially blocked autoplay in the test environment: poster and Play remained usable. Autoplay is requested using Video.js's documented `autoplay: 'muted'` option; browser policy can still require a gesture. No guarantee of autoplay on every device.
- Local screenshots: output/player-review/desktop.png and mobile.png.

## Release

Not deployed. Hosted release QA and approval remain required by docs/plexa-engineering-workflow.md. No credentials or agent configuration changed. Rollback: revert this UI commit and rebuild player assets.

## Follow-up: autoplay and ten-second preview

Native autoplay/muted/playsinline attributes are set before Video.js initialisation, with one readiness retry. Versioned player asset URLs prevent browsers reusing the old bundle. Muted autoplay was confirmed without clicking Play in the local browser: playback advancing, muted=true, paused=false.

Up next appears only when started content has more than zero and at most ten seconds remaining. Browser checks confirmed visible at 8.588 seconds remaining and hidden again after seeking back to 13.588 seconds. Three boundary tests cover unknown duration, ads, missing next items, seeking and completion (11 player tests pass total). Production build and TypeScript passed. Still local, not deployed.
