/**
 * News Shorts headline font presets (browser-safe): metadata for ASS names, CSS, Google Fonts.
 * Filesystem / FFmpeg helpers live in `./news-short-fonts-server` (Node only).
 */

export type NewsShortHeadlineFontId = "roboto-condensed" | "bebas-neue";

export const NEWS_SHORT_HEADLINE_FONT_OPTIONS: ReadonlyArray<{ id: NewsShortHeadlineFontId; label: string }> = [
  { id: "roboto-condensed", label: "Roboto Condensed (bold headline)" },
  { id: "bebas-neue", label: "Bebas Neue (display headline)" },
];

export type NewsShortFontBundle = {
  /** Populated on the server where absolute paths are known; empty in the browser. */
  fontsDirAbs: string;
  /** ASS Style `Fontname` for headline (must match font file internal name). */
  assHeadlineFont: string;
  /** ASS `Fontname` for subline — always readable sans. */
  assSubFont: string;
  /** ASS Bold flag for headline style: -1 = yes */
  assHeadlineBold: boolean;
  /** CSS font-family for html template body / slides */
  cssFontFamily: string;
  /** Google Fonts CSS URL for <link> in slide HTML (Puppeteer). */
  googleFontsHref: string;
};

/** Files shipped in repo under assets/fonts/news-shorts/ (OFL — google/fonts). */
export const NEWS_SHORT_BUNDLED_FONT_FILES = ["RobotoCondensed-Regular.ttf", "RobotoCondensed-Bold.ttf", "BebasNeue-Regular.ttf"] as const;

/** Resolve bundle metadata for ASS + slides. Safe to import from client components. */
export function resolveNewsShortFontBundle(preset: NewsShortHeadlineFontId | undefined): NewsShortFontBundle {
  const id: NewsShortHeadlineFontId = preset ?? "roboto-condensed";

  if (id === "bebas-neue") {
    return {
      fontsDirAbs: "",
      assHeadlineFont: "Bebas Neue",
      assSubFont: "Roboto Condensed",
      assHeadlineBold: false,
      cssFontFamily: '"Bebas Neue", "Roboto Condensed", Impact, "Arial Black", sans-serif',
      googleFontsHref:
        "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Roboto+Condensed:wght@400;700&display=swap",
    };
  }

  return {
    fontsDirAbs: "",
    assHeadlineFont: "Roboto Condensed",
    assSubFont: "Roboto Condensed",
    assHeadlineBold: true,
    cssFontFamily: '"Roboto Condensed", "Bebas Neue", Impact, "Arial Black", sans-serif',
    googleFontsHref: "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap",
  };
}
