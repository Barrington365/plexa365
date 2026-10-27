import type { SubtitleCue } from "@/app/features/content/subtitle-generator";
export type CharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};
/** Small readable caption phrases using the speech provider's actual timing. */
export function elevenLabsCaptionCues(a: CharacterAlignment, speed: number): SubtitleCue[] {
  const n = a?.characters?.length;
  if (!n || a.character_start_times_seconds?.length !== n || a.character_end_times_seconds?.length !== n || !Number.isFinite(speed) || speed <= 0) throw new Error("Speech alignment is missing or invalid.");
  const effectiveSpeed = Math.abs(speed - 1) < 0.02 ? 1 : Math.max(0.25, Math.min(4, Math.round(speed * 1000) / 1000));
  const cues: SubtitleCue[] = [];
  let text = "", start = 0, end = 0, words = 0;
  const flush = () => { if (text.trim()) cues.push({text:text.trim(),startSec:start/effectiveSpeed,endSec:end/effectiveSpeed}); text="";words=0; };
  for (let i=0;i<n;i++) {
    const c=a.characters[i], s=a.character_start_times_seconds[i], e=a.character_end_times_seconds[i];
    if (!Number.isFinite(s) || !Number.isFinite(e) || s<0 || e<s || (i>0 && s<a.character_start_times_seconds[i-1])) throw new Error("Speech alignment contains invalid timestamps.");
    if (!text && /\s/.test(c)) continue;
    if (!text) start=s;
    text+=c; end=e;
    if (/\s/.test(c)) words++;
    if (/[.!?]/.test(c) || (/\s/.test(c) && (words>=6 || text.length>=48))) flush();
  }
  flush();
  if (!cues.length) throw new Error("Speech alignment contains no captions.");
  return cues;
}
