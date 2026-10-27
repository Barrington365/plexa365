import type { SubtitleCue } from "@/app/features/content/subtitle-generator";
import type { NewsShortAssCue } from "@/app/features/content/news-short-ass";
import { highlightWordsForCaption } from "./script-scene-captions";

/** Keep provider timing, but carry the editor's brand highlights into the burn. */
export function styleTimedNewsShortCaptions(
  cues: SubtitleCue[],
  scenes: NewsShortAssCue[],
): NewsShortAssCue[] {
  return cues.map((cue) => {
    const overlapping = scenes.filter(scene => scene.startSec < cue.endSec && scene.endSec > cue.startSec);
    const wordCount = cue.text.trim().split(/\s+/).length;
    return {
      startSec: cue.startSec,
      endSec: cue.endSec,
      headline: cue.text,
      subline: "",
      highlightWords: highlightWordsForCaption(cue.text, overlapping.flatMap(scene => scene.highlightWords), {
        // Short spoken phrases still need both white and accent-coloured words.
        maxHighlights: Math.min(3, Math.max(0, Math.floor(wordCount / 2))),
      }),
    };
  });
}
