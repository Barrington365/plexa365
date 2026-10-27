import {
  coerceLayoutPresetForFormat,
  normalizeCreativeVideoFormat,
  videoDimensionsForCreativeFormat,
} from "@/app/features/news-shorts/creative-video-format";
import type { NewsShortSlide, NewsShortTemplateData } from "@/app/features/news-shorts/types";
import { getNewsShortBrandTemplateDefinition } from "@/app/features/news-shorts/news-shorts-brand-templates";

function sourceNameFromTemplate(template: NewsShortTemplateData): string {
  try {
    return new URL(template.sourceUrl || "").hostname.replace(/^www\./, "");
  } catch {
    const ph = getNewsShortBrandTemplateDefinition(template.brandTemplateId ?? "")?.articleUrlPlaceholder;
    if (ph) {
      try {
        return new URL(ph).hostname.replace(/^www\./, "");
      } catch {
        /* fall through */
      }
    }
    return "planetsport.com";
  }
}

/**
 * Main headline/subline colour for slides + ASS. TEAMtalk drafts may still carry legacy black
 * (`#000` / `#000000`) after the dark-panel rebrand — force white for readability.
 */
export function resolvedPanelTextColorForNewsShort(
  template: Pick<NewsShortTemplateData, "style" | "brandTemplateId">,
): string | undefined {
  const raw = (template.style.panelTextColor ?? "").trim();
  const lower = raw.toLowerCase();
  if (template.brandTemplateId === "teamtalk") {
    if (!raw || lower === "#000" || lower === "#000000") return "#ffffff";
    return raw;
  }
  return raw || undefined;
}

/**
 * Scene `data` for `news-short-*` HTML → PNG — must stay aligned with
 * `NewsShortsBuilder.buildScenesPayload` so server renders match in-app preview.
 */
export function newsShortSceneDataForSlide(
  template: NewsShortTemplateData,
  slide: NewsShortSlide,
  index: number,
  opts: {
    heroImageForScene: string;
    styledSubtitleBurn?: boolean;
    motionBackdropDimStrength?: number;
    motionBackdropOpaqueOpacity?: number;
  },
): Record<string, unknown> {
  const hideMeta = index === 0 || index === 2;
  const st = template.style;
  const fmt = normalizeCreativeVideoFormat(template.creativeVideoFormat);
  const dims = videoDimensionsForCreativeFormat(fmt);
  const layoutPreset = coerceLayoutPresetForFormat(fmt, template.creativeLayoutPreset);
  const data: Record<string, unknown> = {
    brandTemplateId: template.brandTemplateId,
    width: dims.width,
    height: dims.height,
    headline: slide.headline,
    subline: hideMeta ? "" : slide.subline,
    label:
      slide.type === "intro"
        ? st.introLabel
        : slide.type === "outro"
          ? st.outroLabel
          : slide.label,
    highlightWords: slide.highlightWords,
    heroImage: opts.heroImageForScene,
    sourceName: sourceNameFromTemplate(template),
    category:
      (template.tags && template.tags[0]) ||
      getNewsShortBrandTemplateDefinition(template.brandTemplateId ?? "")?.category ||
      "News",
    panelColor: st.panelColor,
    highlightColor: st.highlightColor,
    overlayOpacity: st.overlayOpacity,
    fontSize: st.fontSize,
    lineHeight: st.lineHeight,
    animationStyle: slide.animationStyle,
    textBoxWidthPct: st.textBoxWidthPct,
    headlineFont: st.headlineFont ?? "roboto-condensed",
    backgroundAnimation: slide.backgroundAnimation,
    backgroundZoom: slide.backgroundZoom,
    hideLabel: hideMeta,
    motionBackdropDimStrength: opts.motionBackdropDimStrength ?? 0.45,
    motionBackdropOpaqueOpacity: opts.motionBackdropOpaqueOpacity ?? 0.3,
    creativeVideoFormat: fmt,
    creativeLayoutPreset: layoutPreset,
  };
  const panelResolved = resolvedPanelTextColorForNewsShort(template);
  if (panelResolved) data.panelTextColor = panelResolved;
  if (st.panelFooterBg) data.panelFooterBg = st.panelFooterBg;
  if (st.panelFooterTextColor) data.panelFooterTextColor = st.panelFooterTextColor;
  if (st.topAccentFrom) data.topAccentFrom = st.topAccentFrom;
  if (st.topAccentTo) data.topAccentTo = st.topAccentTo;
  if (opts.styledSubtitleBurn) data.editorSubtitleOverlayOnly = true;
  return data;
}
