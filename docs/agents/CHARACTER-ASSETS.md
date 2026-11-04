# Agent character display

The eight existing characters are served from `/agents/{agent-id}/`.
Sources: user-supplied Plexa_Animated_Agents and Plexa_Engineering_Agents packs in Downloads. These are existing character illustrations, not newly generated artwork.

Each selected character uses its original Idle animation, resized to 256px animated WebP. Card thumbnails use a PNG still. Reduced-motion users receive the still automatically; others can pause/play the selected character animation. Loading failures fall back to the still and then an accessible initial.

This component is presentation only. Choosing a character, playing or pausing its animation does not activate tools, change permissions, start a task or incur provider charges. Existing agent execution controls are unchanged. Additional motion poses remain in the original source packs for a future connection to verified execution states.

Rollback: revert the animation feature PR; no data or configuration migrations.

Validation: 378 tests pass, one skipped; TypeScript/lint/build pass. Browser harness using actual component verified Bob/Fiddle visible, Pause switches to still.png with Play control, and HTTP404 for both James image files produces accessible initial fallback. All eight optimized files retain differing animated frames and alpha.


## Interactive character follow-up

Click the selected character or Pop out to open its conversation in a separate resizable browser window (the browser may choose a tab). Keep the parent page open. Return to page or closing the window restores the inline conversation and preserves the draft. Blocked pop-ups produce a visible explanation. Switching agent or leaving the page closes the companion.

Hover and keyboard focus play the supplied attention pose. Sending a message plays Thinking only while the existing talk request is pending; Success briefly acknowledges a saved message, not a completed production task. Failure keeps the draft and returns to idle. All reactions respect Pause and reduced motion. No tool activation, provider call or execution permission is added.

Local browser component checks: pop-out opened and returning preserved the typed draft; send used thinking.webp while pending; saved-message acknowledgement cleared the draft; keyboard focus selected hover.webp. The send check used a local stub and did not send a production message.

Additional browser edge cases passed: blocked popup leaves the form available with a useful error; external window closure restores the draft automatically. Send is disabled while pending. All eight role IDs have all three reaction files.
