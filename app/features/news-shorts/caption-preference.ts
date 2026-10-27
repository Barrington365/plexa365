export type CaptionPreference = {
  burnSubtitles: boolean;
  burnSubtitlesReplaceSlideText: boolean;
};

/**
 * New videos burn styled captions. A saved draft keeps an explicit off choice.
 * A draft that never stored the choice stays on, so an old file does not look captioned when it is not.
 */
export function captionPreferenceFromDraft(draft: {
  burnSubtitles?: boolean;
  burnSubtitlesReplaceSlideText?: boolean;
} | null | undefined): CaptionPreference {
  if (!draft || typeof draft.burnSubtitles !== "boolean") {
    return { burnSubtitles: true, burnSubtitlesReplaceSlideText: true };
  }
  if (!draft.burnSubtitles) {
    return { burnSubtitles: false, burnSubtitlesReplaceSlideText: false };
  }
  return {
    burnSubtitles: true,
    burnSubtitlesReplaceSlideText: draft.burnSubtitlesReplaceSlideText !== false,
  };
}

export function captionStatusLabel(burnSubtitles: boolean, styled: boolean): {
  state: "on" | "off";
  short: string;
  detail: string;
} {
  if (!burnSubtitles) {
    return {
      state: "off",
      short: "Captions off",
      detail: "Captions are off for this draft. The MP4 will not burn subtitles.",
    };
  }
  if (!styled) {
    return {
      state: "on",
      short: "Captions on",
      detail: "Captions are on. Plain subtitles are burned. Styled replacement is off.",
    };
  }
  return {
    state: "on",
    short: "Captions on",
    detail: "Captions are on. Styled subtitles are burned into the video and follow the narration.",
  };
}
