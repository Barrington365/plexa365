# Agent character display

The eight existing characters are served from `/agents/{agent-id}/`.
Sources: user-supplied Plexa_Animated_Agents and Plexa_Engineering_Agents packs in Downloads. These are existing character illustrations, not newly generated artwork.

Each selected character uses its original Idle animation, resized to 256px animated WebP. Card thumbnails use a PNG still. Reduced-motion users receive the still automatically; others can pause/play the selected character animation. Loading failures fall back to the still and then an accessible initial.

This component is presentation only. Choosing a character, playing or pausing its animation does not activate tools, change permissions, start a task or incur provider charges. Existing agent execution controls are unchanged. Additional motion poses remain in the original source packs for a future connection to verified execution states.

Rollback: revert the animation feature PR; no data or configuration migrations.

Validation: 378 tests pass, one skipped; TypeScript/lint/build pass. Browser harness using actual component verified Bob/Fiddle visible, Pause switches to still.png with Play control, and HTTP404 for both James image files produces accessible initial fallback. All eight optimized files retain differing animated frames and alpha.
