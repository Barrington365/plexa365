/**
 * Maps the voiceover script to Shorts frames in scene order (e.g. intro → winner → placings → outro).
 * Uses sentence groups when there are enough sentences; otherwise splits words evenly across scenes.
 */

/** Speaking rate for estimating TTS length (words per minute). */
export const DEFAULT_VOICEOVER_WPM = 155;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Rough voiceover length from full script; `voiceSpeed` > 1 shortens the estimate. */
export function estimateVoiceoverDurationSec(
  script: string,
  options?: { wpm?: number; voiceSpeed?: number },
): number {
  const wpm = options?.wpm ?? DEFAULT_VOICEOVER_WPM;
  const speed = Math.min(2, Math.max(0.5, options?.voiceSpeed ?? 1));
  const words = wordCount(script);
  if (words === 0) return 0;
  const baseMin = (words / wpm) * 60;
  return Math.max(0.5, baseMin / speed);
}

/** Split target timeline across scenes by each chunk’s word share (same order as templates / scenes). */
export function distributeDurationsForChunks(
  chunks: string[],
  targetTotalSec: number,
  minSceneSec = 0.2,
): number[] {
  const n = chunks.length;
  if (n === 0) return [];
  const target = Math.max(minSceneSec * n, targetTotalSec);
  const counts = chunks.map((c) => wordCount(c));
  const W = counts.reduce((a, b) => a + b, 0);
  if (W === 0) {
    const each = Math.round((target / n) * 10) / 10;
    return Array.from({ length: n }, () => Math.max(minSceneSec, each));
  }
  let d = counts.map((w) => (w / W) * target);
  d = d.map((x) => Math.max(minSceneSec, x));
  const sum = d.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array.from({ length: n }, () => minSceneSec);
  const factor = target / sum;
  d = d.map((x) => Math.round(x * factor * 10) / 10);
  const drift = Math.round((target - d.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (drift !== 0 && d.length > 0) {
    const last = d[d.length - 1]! + drift;
    d[d.length - 1] = Math.max(minSceneSec, Math.round(last * 10) / 10);
  }
  return d;
}

/**
 * Keep the existing scene count and fit those captions to the probed narration.
 * The last caption absorbs rounding so the cues finish with the audio.
 */
export function alignSceneDurationsToAudio(chunks: string[], audioSec: number): number[] {
  if (chunks.length === 0) {
    throw new Error("Add at least one scene before matching the narration.");
  }
  if (!Number.isFinite(audioSec) || audioSec < 0.2) {
    throw new Error("Narration is too short to time the captions.");
  }
  const rough = distributeDurationsForChunks(chunks, audioSec, 0.2);
  if (rough.length !== chunks.length) {
    throw new Error("Matching the narration changed the scene count.");
  }
  const head = rough.slice(0, -1);
  const headSum = head.reduce((sum, value) => sum + value, 0);
  const last = Math.round((audioSec - headSum) * 1000) / 1000;
  if (!(last >= 0.2)) {
    throw new Error(
      `Narration is ${audioSec.toFixed(1)}s, which is too short for ${chunks.length} captioned scenes without dropping a line.`,
    );
  }
  const durations = [...head, last];
  const sum = durations.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - audioSec) > 0.02) {
    throw new Error("Caption timings could not be matched to the narration.");
  }
  return durations;
}

/** Captions + per-scene durations aligned to estimated template voiceover time. */
export function computeSyncFromScript(
  script: string,
  sceneCount: number,
  voiceSpeed?: number,
): { captions: string[]; durationSec: number[]; estimatedScriptSec: number } {
  const captions = splitScriptIntoSceneCaptions(script, sceneCount);
  const estimatedScriptSec = estimateVoiceoverDurationSec(script, { voiceSpeed });
  const durationSec = distributeDurationsForChunks(captions, estimatedScriptSec);
  return { captions, durationSec, estimatedScriptSec };
}

/**
 * After editing per-scene subtitle lines, redistribute Dur (s) by word count per line.
 * Total length matches estimated voiceover from `script` when set; otherwise from joined captions.
 * Empty lines use that frame’s split of `script` only for counting (when script exists).
 */
export function recalculateDurationsFromCaptionLines(
  captionLines: string[],
  script: string,
  voiceSpeed?: number,
): { durationSec: number[]; targetTotalSec: number } {
  const n = captionLines.length;
  if (n === 0) return { durationSec: [], targetTotalSec: 0 };
  const scriptTrim = script.trim();
  const fallbackChunks = scriptTrim ? splitScriptIntoSceneCaptions(script, n) : Array.from({ length: n }, () => "");
  const effectiveChunks = captionLines.map((cap, i) => {
    const t = cap.trim();
    return t || (fallbackChunks[i] ?? "");
  });
  const targetTotalSec = scriptTrim
    ? estimateVoiceoverDurationSec(script, { voiceSpeed })
    : estimateVoiceoverDurationSec(captionLines.join(" "), { voiceSpeed });
  const durationSec = distributeDurationsForChunks(effectiveChunks, targetTotalSec);
  return { durationSec, targetTotalSec };
}

function chunkStringsToN(parts: string[], n: number): string[] {
  if (n <= 0) return [];
  if (parts.length === 0) return Array.from({ length: n }, () => "");
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const end = Math.round(((i + 1) * parts.length) / n);
    out.push(parts.slice(start, end).join(" ").trim());
    start = end;
  }
  return out;
}

function splitWordsAcrossScenes(text: string, sceneCount: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return Array.from({ length: sceneCount }, () => "");
  const out: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const a = Math.round((i * words.length) / sceneCount);
    const b = Math.round(((i + 1) * words.length) / sceneCount);
    out.push(words.slice(a, b).join(" "));
  }
  return out;
}

export function splitScriptIntoSceneCaptions(script: string, sceneCount: number): string[] {
  if (sceneCount <= 0) return [];
  const t = script.trim().replace(/\s+/g, " ");
  if (!t) return Array.from({ length: sceneCount }, () => "");

  const sentences = t
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (sentences.length >= sceneCount) {
    return chunkStringsToN(sentences, sceneCount);
  }

  return splitWordsAcrossScenes(t, sceneCount);
}

/** Burned subtitle / SRT line: use editor caption when set, else script-derived chunk for that frame. */
export function effectiveSceneCaption(captionLine: string, scriptChunk: string): string {
  const c = captionLine.trim();
  if (c) return c;
  return (scriptChunk ?? "").trim();
}

/**
 * Voiceover / ASS dub line for a scene: **script chunk first**, then slide copy.
 * Slide `subline` is slide editor copy, not the dubbing source of truth — do not prefer it over the split script
 * when building preview, ASS, or SRT from the voiceover.
 */
export function sceneSubtitleLineForBurn(
  scriptChunk: string,
  slideHeadline: string,
  slideSubline: string,
): string {
  const chunk = String(scriptChunk ?? "").trim();
  if (chunk) return chunk;
  const h = String(slideHeadline ?? "").trim();
  const s = String(slideSubline ?? "").trim();
  if (h && s) return `${h}. ${s}`;
  return h || s;
}

const CAPTION_AUTO_STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "as",
    "is",
    "was",
    "are",
    "were",
    "been",
    "be",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "this",
    "that",
    "these",
    "those",
    "with",
    "from",
    "by",
    "about",
    "into",
    "through",
    "after",
    "before",
    "between",
    "under",
    "over",
    "out",
    "up",
    "down",
    "off",
    "than",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "what",
    "which",
    "who",
    "whom",
    "such",
    "some",
    "any",
    "no",
    "not",
    "only",
    "own",
    "same",
    "so",
    "too",
    "very",
    "just",
    "also",
    "more",
    "most",
    "other",
    "if",
    "its",
    "it",
    "we",
    "they",
    "them",
    "their",
    "our",
    "your",
    "his",
    "her",
    "he",
    "she",
    "i",
    "me",
    "him",
    "us",
    "how",
    "all",
    "each",
    "few",
    "both",
    "every",
    "either",
    "neither",
    "one",
    "two",
    "first",
    "last",
    "next",
    "new",
    "way",
    "day",
    "time",
    "year",
    "week",
    "like",
    "know",
    "get",
    "got",
    "go",
    "going",
    "gone",
    "make",
    "made",
    "says",
    "said",
    "told",
    "come",
    "came",
    "see",
    "well",
    "even",
    "still",
    "back",
    "being",
    "during",
    "without",
    "against",
    "among",
    "per",
    "via",
    "let",
    "lot",
    "use",
    "used",
    "using",
    "due",
    "yet",
    "nor",
    "now",
    "am",
    "it",
    "its",
  ].map((w) => w.toLowerCase()),
);

function bareCaptionToken(w: string): string {
  return w.replace(/[^\w-]/g, "").toLowerCase();
}

/**
 * Words to highlight in a caption line (ASS + preview): use slide picks that appear in the line,
 * then fill with the longest non-stopwords so every scene keeps white + lime.
 */
export function highlightWordsForCaption(
  captionText: string,
  slideHighlights: string[] | null | undefined,
  options?: { minAutoLen?: number; maxHighlights?: number },
): string[] {
  const minAutoLen = options?.minAutoLen ?? 4;
  const maxHighlights = options?.maxHighlights ?? 3;
  const normalised = captionText.trim().replace(/\s+/g, " ");
  if (!normalised) return [];

  const tokens = normalised.split(/\s+/).filter(Boolean);
  const captionBares = new Set(tokens.map(bareCaptionToken).filter(Boolean));

  const fromSlide: string[] = [];
  const seen = new Set<string>();
  for (const raw of slideHighlights ?? []) {
    const parts = String(raw ?? "")
      .trim()
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      const b = bareCaptionToken(p);
      if (!b || !captionBares.has(b) || seen.has(b)) continue;
      seen.add(b);
      fromSlide.push(p);
    }
  }

  if (fromSlide.length >= maxHighlights) return fromSlide.slice(0, maxHighlights);

  const scored = tokens
    .map((w) => ({ w, b: bareCaptionToken(w), len: bareCaptionToken(w).length }))
    .filter((x) => x.b && x.len >= minAutoLen && !CAPTION_AUTO_STOPWORDS.has(x.b) && !seen.has(x.b))
    .sort((a, b) => b.len - a.len);

  const out = [...fromSlide];
  for (const x of scored) {
    if (out.length >= maxHighlights) break;
    seen.add(x.b);
    out.push(x.w);
  }

  if (out.length === 0 && tokens.length > 0) {
    const fallback = tokens
      .map((w) => ({ w, b: bareCaptionToken(w), len: bareCaptionToken(w).length }))
      .filter((x) => x.b && x.len >= 3 && !CAPTION_AUTO_STOPWORDS.has(x.b))
      .sort((a, b) => b.len - a.len);
    for (const x of fallback) {
      if (out.length >= Math.min(2, maxHighlights)) break;
      if (seen.has(x.b)) continue;
      seen.add(x.b);
      out.push(x.w);
    }
  }

  return out;
}
