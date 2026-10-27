/**
 * Planet Sport Studio - video canvas formats (distinct from camera `VideoRecordOrientation`).
 * `shorts_vertical` keeps legacy News Shorts behaviour; `portrait_video` shares 1080×1920 with different layout rules.
 */

import type { CreativeVideoFormatId, NewsShortStyleControls } from "@/app/features/news-shorts/types";

/** Values written to short-form engine export / sidecar JSON. */
export type CreativeExportFormat = "shorts" | "portrait" | "landscape";

export type CreativeLayoutPresetMeta = { id: string; label: string };

export const SHORTS_LAYOUT_PRESETS: readonly CreativeLayoutPresetMeta[] = [
  { id: "shorts_default", label: "Default (bottom panel)" },
  { id: "shorts_headline_centre", label: "Headline centre" },
  { id: "shorts_caption_centre", label: "Caption centre" },
  { id: "shorts_quick_stat", label: "Quick stat card" },
] as const;

export const PORTRAIT_LAYOUT_PRESETS: readonly CreativeLayoutPresetMeta[] = [
  { id: "portrait_headline_top", label: "Headline top" },
  { id: "portrait_lower_third", label: "Lower-third text" },
  { id: "portrait_split_image_text", label: "Split image + text" },
  { id: "portrait_data_panel", label: "Data panel + text" },
  { id: "portrait_interview", label: "Interview style" },
] as const;

export const LANDSCAPE_LAYOUT_PRESETS: readonly CreativeLayoutPresetMeta[] = [
  { id: "landscape_lower_banner", label: "Lower banner" },
  { id: "landscape_title_safe", label: "Title safe (top band)" },
  { id: "landscape_split_lower", label: "Split + lower line" },
] as const;

export function normalizeCreativeVideoFormat(raw: string | undefined | null): CreativeVideoFormatId {
  if (raw === "portrait_video" || raw === "landscape_video") return raw;
  return "shorts_vertical";
}

/** Query values from Shorts Studio / Landscape Studio entry links. */
export function creativeFormatFromQuery(raw: string | null | undefined): CreativeVideoFormatId | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "landscape" || value === "landscape_video") return "landscape_video";
  if (value === "portrait" || value === "portrait_video") return "portrait_video";
  if (value === "shorts" || value === "shorts_vertical") return "shorts_vertical";
  return null;
}

type CreativeFormatCarrier = {
  creativeVideoFormat?: CreativeVideoFormatId;
  creativeLayoutPreset?: string;
  style: NewsShortStyleControls;
};

export function applyCreativeFormatToTemplate<T extends CreativeFormatCarrier>(
  template: T,
  format: CreativeVideoFormatId,
): T {
  const fmt = normalizeCreativeVideoFormat(format);
  return {
    ...template,
    creativeVideoFormat: fmt,
    creativeLayoutPreset: defaultLayoutPresetForFormat(fmt),
    style: mergeStyleDefaultsForCreativeFormat(fmt, template.style),
  };
}

/** Keep the canvas the user (or studio hub) chose when a parse replaces the template. */
export function preserveCreativeFormat<T extends CreativeFormatCarrier>(
  next: T,
  previous: Pick<CreativeFormatCarrier, "creativeVideoFormat" | "creativeLayoutPreset">,
): T {
  if (!previous.creativeVideoFormat) return next;
  const fmt = normalizeCreativeVideoFormat(previous.creativeVideoFormat);
  return {
    ...next,
    creativeVideoFormat: fmt,
    creativeLayoutPreset: coerceLayoutPresetForFormat(fmt, previous.creativeLayoutPreset),
    style: mergeStyleDefaultsForCreativeFormat(fmt, next.style),
  };
}

export function exportFormatForCreativeVideo(format: CreativeVideoFormatId): CreativeExportFormat {
  if (format === "portrait_video") return "portrait";
  if (format === "landscape_video") return "landscape";
  return "shorts";
}

export function videoDimensionsForCreativeFormat(format: CreativeVideoFormatId): {
  width: number;
  height: number;
  aspectBucket: "9:16" | "16:9";
} {
  if (format === "landscape_video") {
    return { width: 1920, height: 1080, aspectBucket: "16:9" };
  }
  return { width: 1080, height: 1920, aspectBucket: "9:16" };
}

export function engineSafeZoneForFormat(format: CreativeVideoFormatId): string {
  if (format === "portrait_video") return "portrait_editorial_default";
  if (format === "landscape_video") return "landscape_safe_default";
  return "shorts_reels_default";
}

export function layoutPresetsForFormat(format: CreativeVideoFormatId): readonly CreativeLayoutPresetMeta[] {
  if (format === "portrait_video") return PORTRAIT_LAYOUT_PRESETS;
  if (format === "landscape_video") return LANDSCAPE_LAYOUT_PRESETS;
  return SHORTS_LAYOUT_PRESETS;
}

export function defaultLayoutPresetForFormat(format: CreativeVideoFormatId): string {
  if (format === "portrait_video") return "portrait_headline_top";
  if (format === "landscape_video") return "landscape_lower_banner";
  return "shorts_default";
}

/** Coerce stored preset when format changes — avoids invalid cross-format ids. */
export function coerceLayoutPresetForFormat(format: CreativeVideoFormatId, preset: string | undefined): string {
  const ids = new Set(layoutPresetsForFormat(format).map((p) => p.id));
  const p = (preset ?? "").trim();
  if (p && ids.has(p)) return p;
  return defaultLayoutPresetForFormat(format);
}

/**
 * When the user switches Creative Studio format, nudge typography defaults for that format
 * without touching slide copy (headlines / sublines / images).
 */
export function mergeStyleDefaultsForCreativeFormat(
  format: CreativeVideoFormatId,
  style: NewsShortStyleControls,
): NewsShortStyleControls {
  if (format === "shorts_vertical") {
    return {
      ...style,
      fontSize: Math.max(style.fontSize, 62),
      lineHeight: Math.min(Math.max(style.lineHeight, 1.0), 1.12),
      textBoxWidthPct: Math.min(Math.max(style.textBoxWidthPct, 78), 90),
    };
  }
  if (format === "portrait_video") {
    return {
      ...style,
      fontSize: Math.min(Math.max(style.fontSize, 44), 58),
      lineHeight: Math.min(Math.max(style.lineHeight, 1.06), 1.22),
      textBoxWidthPct: Math.min(Math.max(style.textBoxWidthPct, 82), 94),
    };
  }
  return {
    ...style,
    fontSize: Math.min(Math.max(style.fontSize, 40), 54),
    lineHeight: Math.min(Math.max(style.lineHeight, 1.04), 1.18),
    textBoxWidthPct: Math.min(Math.max(style.textBoxWidthPct, 70), 92),
  };
}

/**
 * Extra layout CSS appended after base News Short slide rules.
 * `footerPx` should match `NEWS_SHORT_FOOTER_SAFE_PX` for the active canvas.
 */
export function newsShortCreativeLayoutCss(
  format: CreativeVideoFormatId,
  preset: string,
  fontSize: number,
  footerPx: number,
): string {
  const p = preset.trim();
  if (format === "shorts_vertical") {
    if (p === "shorts_headline_centre") {
      return `
    .ns-panel-wrap { top: 50%; bottom: auto; transform: translateY(-46%); }
    .ns-panel-inner { text-align: center; }
    .ns-headline { letter-spacing: 0.04em; }
    .ns-subline { text-align: center; }
    `;
    }
    if (p === "shorts_caption_centre") {
      return `
    .ns-panel-wrap { top: auto; bottom: ${footerPx}px; }
    .ns-panel-inner { text-align: center; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.92)}px; }
    .ns-subline { margin-top: 18px; text-align: center; font-size: ${Math.round(fontSize * 0.88)}px; }
    `;
    }
    if (p === "shorts_quick_stat") {
      return `
    .ns-panel-wrap { left: 8%; right: 8%; bottom: ${footerPx}px; width: auto; }
    .ns-panel { max-width: 72%; margin: 0 auto; border-radius: 20px; padding: 20px 24px; min-height: 200px; }
    .ns-panel-inner { max-width: 100%; text-align: center; }
    .ns-label { font-size: ${Math.round(fontSize * 0.85)}px; }
    .ns-headline { font-size: ${Math.round(fontSize * 1.05)}px; }
    `;
    }
    return "";
  }
  if (format === "portrait_video") {
    const basePortrait = `
    .ns-headline { text-transform: none; letter-spacing: 0.01em; font-weight: 800; }
    .ns-subline { text-transform: none; letter-spacing: 0.01em; font-weight: 600; }
    .ns-label { letter-spacing: 0.12em; font-weight: 800; }
    `;
    if (p === "portrait_headline_top") {
      return (
        basePortrait +
        `
    .ns-panel-wrap { top: 10%; bottom: auto; left: 0; right: 0; }
    .ns-panel { border-radius: 0 0 18px 18px; padding: 22px 26px 18px; min-height: 0; }
    .ns-quote-mark { display: none; }
    `
      );
    }
    if (p === "portrait_lower_third") {
      return (
        basePortrait +
        `
    .ns-panel-wrap { bottom: ${footerPx + 96}px; top: auto; }
    .ns-panel { min-height: 0; padding: 14px 22px 12px; border-radius: 12px 12px 0 0; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.58)}px; line-height: 1.18; }
    .ns-subline { font-size: ${Math.round(fontSize * 0.52)}px; margin-top: 8px; line-height: 1.2; }
    .ns-quote-mark { display: none; }
    `
      );
    }
    if (p === "portrait_split_image_text") {
      return (
        basePortrait +
        `
    .ns-bg, .ns-bg-fallback { width: 46%; height: 100%; left: 0; right: auto; }
    .ns-panel-wrap { left: 44%; right: 0; bottom: ${footerPx}px; top: 8%; width: auto; }
    .ns-panel { border-radius: 14px 0 0 14px; min-height: 0; }
    .ns-panel-inner { max-width: 96%; margin: 0; text-align: left; }
    .ns-quote-mark { left: 72%; }
    `
      );
    }
    if (p === "portrait_data_panel") {
      return (
        basePortrait +
        `
    .ns-panel-wrap::before {
      content: "";
      position: absolute; left: 0; top: 14%; bottom: ${footerPx + 40}px;
      width: 22%; border-radius: 0 12px 12px 0;
      background: rgba(15,23,42,0.92); border: 1px solid rgba(148,163,184,0.25);
      z-index: 0;
    }
    .ns-panel-wrap { bottom: ${footerPx}px; left: 24%; right: 0; }
    .ns-panel { position: relative; z-index: 1; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.62)}px; }
    .ns-subline { font-size: ${Math.round(fontSize * 0.55)}px; }
    `
      );
    }
    if (p === "portrait_interview") {
      return (
        basePortrait +
        `
    .ns-panel-wrap { bottom: ${footerPx + 72}px; left: 10%; right: 10%; }
    .ns-panel { position: relative; border-radius: 10px; padding: 16px 20px; }
    .ns-label { position: absolute; top: -36px; left: 0; font-size: ${Math.round(fontSize * 0.55)}px; opacity: 0.95; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.6)}px; }
    .ns-quote-mark { display: none; }
    `
      );
    }
    return basePortrait;
  }
  /* landscape_video */
  if (p === "landscape_title_safe") {
    return `
    .ns-panel-wrap { top: 6%; bottom: auto; left: 5%; right: 5%; }
    .ns-panel { border-radius: 14px; min-height: 0; padding: 16px 22px; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.72)}px; text-transform: none; }
    .ns-subline { font-size: ${Math.round(fontSize * 0.62)}px; text-transform: none; margin-top: 8px; }
    .ns-footer { font-size: 28px; }
    .ns-source { font-size: 24px; }
    `;
  }
  if (p === "landscape_split_lower") {
    return `
    .ns-bg, .ns-bg-fallback { width: 52%; height: 100%; left: 0; right: auto; }
    .ns-panel-wrap { left: 50%; right: 0; bottom: ${footerPx}px; top: 10%; width: auto; }
    .ns-panel { border-radius: 0; min-height: 0; }
    .ns-headline { font-size: ${Math.round(fontSize * 0.65)}px; text-transform: none; }
    .ns-subline { font-size: ${Math.round(fontSize * 0.55)}px; text-transform: none; }
    `;
  }
  /* landscape_lower_banner (default) */
  return `
  .ns-panel-wrap { bottom: ${footerPx}px; left: 4%; right: 4%; }
  .ns-panel { border-radius: 14px 14px 0 0; min-height: 0; padding: 18px 24px 14px; }
  .ns-headline { font-size: ${Math.round(fontSize * 0.68)}px; text-transform: none; }
  .ns-subline { font-size: ${Math.round(fontSize * 0.58)}px; text-transform: none; }
  .ns-footer { font-size: 30px; }
  `;
}
