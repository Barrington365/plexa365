import type { NewsShortHeadlineFontId } from "@/app/lib/news-short-fonts";

/** Planet Sport Studio canvas format (distinct per product spec). */
export type CreativeVideoFormatId = "shorts_vertical" | "portrait_video" | "landscape_video";

export type NewsShortSlideType = "intro" | "content" | "outro";

export type NewsShortAnimationStyle = "none" | "fade-up" | "slide-up" | "soft-pop";
export type NewsShortBackgroundAnimation = "none" | "zoom-in" | "pan-left" | "pan-right" | "float";

export type NewsShortSourceType = "url" | "rss";

/**
 * Camera / backdrop clip compositing under slide PNGs in the final MP4 (9:16).
 * `half`: backdrop in top 960px; slide overlay cropped to bottom 960px only (text/data under the video).
 */
export type VideoRecordLayout = "full" | "half" | "circle";

/** PiP anchor for Face in circle (single-stream camera or dual composite camera layer). */
export type VideoRecordCirclePosition = "middle-right" | "top-right" | "bottom-right" | "top-left";

/** Browser camera capture: Shorts-style 9:16 by default; optional 16:9 landscape. */
export type VideoRecordOrientation = "portrait" | "landscape";

export type NewsShortSlide = {
  id: string;
  type: NewsShortSlideType;
  label: string;
  headline: string;
  subline: string;
  imageUrl?: string;
  highlightWords: string[];
  /** Edited on-video caption. When set, the burn uses this line instead of the script split. */
  captionText?: string;
  durationSec: number;
  animationStyle: NewsShortAnimationStyle;
  backgroundAnimation: NewsShortBackgroundAnimation;
  backgroundZoom: number;
};

export type NewsShortStyleControls = {
  fontSize: number;
  lineHeight: number;
  textBoxWidthPct: number;
  overlayOpacity: number;
  panelColor: string;
  highlightColor: string;
  /** Headline / kicker / subline text on the panel (default white). Use e.g. #000000 on bright cyan. */
  panelTextColor?: string;
  /** Source strip at bottom (default dark slate). */
  panelFooterBg?: string;
  panelFooterTextColor?: string;
  /** Top accent bar gradient (defaults to green). */
  topAccentFrom?: string;
  topAccentTo?: string;
  introLabel: string;
  outroLabel: string;
  animationEnabled: boolean;
  /** Headline / ASS + slide HTML font bundle (bundled TTFs + Google Fonts link). */
  headlineFont?: NewsShortHeadlineFontId;
  /**
   * Scales motion full-frame + panel dim gradients (0.25 = light, 1.6 = heavy).
   * Used when compositing backdrop video under transparent PNGs.
   */
  motionBackdropDimStrength?: number;
  /**
   * Uniform black overlay over motion (0–0.85). Separate from `motionBackdropDimStrength`
   * (gradient / panel ramp only). Default ~0.30.
   */
  motionBackdropOpaqueOpacity?: number;
};

export type NewsShortTemplateData = {
  /**
   * Planet Sport Studio output format. Omitted or legacy payloads default to `shorts_vertical`
   * (existing Shorts behaviour — do not merge with portrait).
   */
  creativeVideoFormat?: CreativeVideoFormatId;
  /** Layout preset id — must belong to the preset list for `creativeVideoFormat`. */
  creativeLayoutPreset?: string;
  /** Stable id when using the Planet Sport News Shorts template library (e.g. planetf1, football365). */
  brandTemplateId?: string;
  sourceType: NewsShortSourceType;
  sourceUrl: string;
  title: string;
  /** Short strapline / deck from article meta (used as slide-2 subline). */
  strapline: string;
  author: string;
  publishDate: string;
  heroImage: string;
  /** All article image candidates (best-effort; for UI only). */
  articleImages: string[];
  tags: string[];
  articleBody: string[];
  keyQuotes: string[];
  slides: NewsShortSlide[];
  style: NewsShortStyleControls;
  notes: string;
};

export type NewsShortParseRequest =
  | {
      sourceType: "url";
      url: string;
      contentId?: string;
    }
  | {
      sourceType: "rss";
      feedUrl: string;
      itemUrl?: string;
      itemTitle?: string;
      itemRawXml?: string;
      contentId?: string;
    };

export type NewsShortFfmpegPlan = {
  format: {
    width: 1080;
    height: 1920;
    fps: 30;
    aspect: "9:16";
    targetPlatforms: Array<"youtube-shorts" | "tiktok" | "instagram-reels">;
  };
  background: {
    heroImage: string;
    overlayOpacity: number;
    kenBurns: {
      enabled: boolean;
      zoomPerSlide: number[];
    };
  };
  slides: Array<{
    id: string;
    durationSec: number;
    headline: string;
    subline: string;
    highlightWords: string[];
    animationStyle: NewsShortAnimationStyle;
  }>;
};

export type BackingMusicSourceType = "generated" | "uploaded" | "library" | "stock" | "brand";

export type BackingMusicConfig = {
  enabled: boolean;
  sourceType?: BackingMusicSourceType;
  /** Path under output/, e.g. uploads/{contentId}/music/custom-track.mp3 */
  assetRel?: string;
  volume: number;
  ducking: boolean;
  duckStrength: number;
  duckAttackMs: number;
  duckReleaseMs: number;
  duckUnderNarration: boolean;
  duckUnderClipAudio: boolean;
  loop: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  trimStartMs: number;
  trimEndMs?: number;
  offsetMs: number;
};

export const NEWS_SHORT_DEFAULT_STYLE: NewsShortStyleControls = {
  fontSize: 66,
  lineHeight: 1.05,
  textBoxWidthPct: 86,
  overlayOpacity: 0.52,
  panelColor: "#0f172a",
  highlightColor: "#b7ff1a",
  introLabel: "TOP TIP",
  outroLabel: "READ MORE",
  animationEnabled: true,
  headlineFont: "roboto-condensed",
  motionBackdropDimStrength: 0.45,
  motionBackdropOpaqueOpacity: 0.3,
};
