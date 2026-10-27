/**
 * ASS subtitles for News Shorts — approximates slide panel text (FFmpeg/libass burn-in).
 */

import type { NewsShortHeadlineFontId } from "@/app/lib/news-short-fonts";
import { resolveNewsShortFontBundle } from "@/app/lib/news-short-fonts";
import {
  computeNewsShortAssMarginLRpx,
  computeNewsShortSubtitleLayout,
  NEWS_SHORT_ASS_BURN_FONT_SCALE,
  newsShortAssBurnHeadFontPx,
  wrapNewsShortBurnCaptionLines,
} from "@/app/lib/news-short-subtitle-layout";

export type NewsShortAssStyle = {
  fontSize: number;
  /** Matches slide / preview line-height; drives multi-line lift with ASS font size. */
  lineHeight?: number;
  panelColor: string;
  highlightColor: string;
  /** Non-highlight word colour — must match slide `panelTextColor` (e.g. white on charcoal). */
  panelTextColor?: string;
  textBoxWidthPct: number;
  headlineFont?: NewsShortHeadlineFontId;
  /** When burning over motion video, nudge subtitles slightly higher for readability. */
  busyMotionBackdrop?: boolean;
  /** Match slide PNG / FFmpeg frame (default 1080×1920). */
  playResX?: number;
  playResY?: number;
};

export type NewsShortAssCue = {
  startSec: number;
  endSec: number;
  headline: string;
  subline: string;
  highlightWords: string[];
};

/** ASS uses &HAABBGGRR (alpha B G R). Alpha 00 = opaque, FF = transparent (VSFilter / libass). */
function hexToAssColor(hex: string, alphaByte: string = "00"): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return "&H00FFFFFF&";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const bb = b.toString(16).padStart(2, "0");
  const gg = g.toString(16).padStart(2, "0");
  const rr = r.toString(16).padStart(2, "0");
  return `&H${alphaByte}${bb}${gg}${rr}&`;
}

/**
 * Preserve the selected brand panel, including CSS opacity (ASS uses inverse alpha).
 */
function assSubtitlePanelBackColour(panelColor: string): string {
  return cssColorToAssPrimary(panelColor || "#020302");
}

function sanitizeAssLiteral(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, " ")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

/**
 * Map Global Style highlight (hex / shorthand / rgb) to ASS primary colour — must match slide HTML
 * (`renderNewsShortSlide`) with no blend toward another brand.
 */
function cssColorToAssPrimary(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "&H00FFFFFF&";
  const short = s.match(/^#([0-9a-fA-F]{3})$/i);
  if (short) {
    const x = short[1]!.toLowerCase();
    return hexToAssColor(`#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`);
  }
  const long = s.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/i);
  if (long) {
    return hexToAssColor(`#${long[1]!.toLowerCase()}`, long[2] ? (255 - parseInt(long[2], 16)).toString(16).padStart(2, "0") : "00");
  }
  const rgba = s.match(
    /^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i,
  );
  if (rgba) {
    const r = Math.round(Math.min(255, Math.max(0, Number(rgba[1]))));
    const g = Math.round(Math.min(255, Math.max(0, Number(rgba[2]))));
    const b = Math.round(Math.min(255, Math.max(0, Number(rgba[3]))));
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    const opacity = rgba[4] == null ? 1 : Math.min(1, Math.max(0, Number(rgba[4])));
    return hexToAssColor(hex, Math.round((1 - opacity) * 255).toString(16).padStart(2, "0"));
  }
  return "&H00FFFFFF&";
}

/** Normalise a highlight entry to bare alnum tokens (matches per-word ASS tokens). */
function bareHighlightToken(x: string): string {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w-]/g, "");
}

/** Per-word white + vivid lime on keyword matches (uppercase to match slides). Colour only — style Bold=-1 supplies weight. */
function wrapWordsWithHighlights(text: string, highlights: string[], style: NewsShortAssStyle): string {
  const raw = text.trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const set = new Set<string>();
  for (const h of highlights) {
    for (const part of String(h ?? "").trim().split(/\s+/)) {
      const b = bareHighlightToken(part);
      if (b) set.add(b);
    }
  }
  const hl = cssColorToAssPrimary(String(style.highlightColor ?? "").trim());
  const def = cssColorToAssPrimary(String(style.panelTextColor ?? "#ffffff").trim());
  const parts = upper.split(/\s+/).filter(Boolean);
  return parts
    .map((token) => {
      const bare = token.replace(/[^\w-]/g, "").toLowerCase();
      const isHl = set.has(bare);
      const c = isHl ? hl : def;
      return `{\\c${c}}${sanitizeAssLiteral(token)}`;
    })
    .join(" ");
}

function formatAssTime(sec: number): string {
  const t = Math.max(0, sec);
  const totalCs = Math.round(t * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Bottom `MarginV` for ASS alignment 2 (larger = block sits higher).
 * Delegates to `computeNewsShortSubtitleLayout` — same source as preview `bottom` %.
 */
export function newsShortAssBottomMarginV(
  style: NewsShortAssStyle,
  _fsHeadPx: number,
  headline: string,
  subline: string,
  explicitWrappedLineCount?: number,
): number {
  return computeNewsShortSubtitleLayout({
    textBoxWidthPct: style.textBoxWidthPct,
    slideFontSize: style.fontSize,
    lineHeight: style.lineHeight,
    headline,
    subline,
    busyMotionBackdrop: style.busyMotionBackdrop,
    explicitWrappedLineCount,
    frameWidth: style.playResX,
    frameHeight: style.playResY,
  }).marginVPx;
}

/**
 * Build a full ASS file for News Shorts bottom-panel style subtitles.
 */
export function buildNewsShortAss(cues: NewsShortAssCue[], style: NewsShortAssStyle): string {
  const bundle = resolveNewsShortFontBundle(style.headlineFont);
  const s = NEWS_SHORT_ASS_BURN_FONT_SCALE;
  const fsHead = newsShortAssBurnHeadFontPx(style.fontSize);
  const panel = assSubtitlePanelBackColour(style.panelColor);
  const outlineCol = hexToAssColor("#0a0c0a", "40");
  const playResX = style.playResX && style.playResX > 0 ? Math.round(style.playResX) : 1080;
  const playResY = style.playResY && style.playResY > 0 ? Math.round(style.playResY) : 1920;
  /** ASS Bold=-1: force bold burn-in for readability (per-token \\b tags removed in wrapWordsWithHighlights). */
  const boldHead = -1;
  const tw = Math.min(94, Math.max(50, style.textBoxWidthPct));
  const marginLR = computeNewsShortAssMarginLRpx(tw, playResX);
  const firstJoined = cues[0]
    ? [cues[0].headline, cues[0].subline].filter(Boolean).join(" ").trim()
    : "";
  const firstWrapped = wrapNewsShortBurnCaptionLines(firstJoined || " ", {
    textBoxWidthPct: style.textBoxWidthPct,
    assHeadFontPx: fsHead,
    frameWidth: playResX,
  });
  const styleMarginV = newsShortAssBottomMarginV(
    style,
    fsHead,
    cues[0]?.headline ?? "",
    cues[0]?.subline ?? "",
    Math.max(1, firstWrapped.length),
  );
  const outlinePx = Math.round(2.5 * s);
  /** Slightly condensed width + tighter spacing — social quote / headline look. */
  const scaleX = 92;
  const scaleY = 100;
  const charSpacing = -1;

  const header = `[Script Info]
Title: News Shorts
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${bundle.assHeadlineFont},${fsHead},&H00FFFFFF,&H000000FF,${outlineCol},${panel},${boldHead},0,0,0,${scaleX},${scaleY},${charSpacing},0,3,${outlinePx},0,2,${marginLR},${marginLR},${styleMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  for (const c of cues) {
    const start = formatAssTime(c.startSec);
    const end = formatAssTime(c.endSec);
    const joined = [c.headline, c.subline].filter(Boolean).join(" ").trim();
    const wrappedLines = wrapNewsShortBurnCaptionLines(joined || " ", {
      textBoxWidthPct: style.textBoxWidthPct,
      assHeadFontPx: fsHead,
      frameWidth: playResX,
    });
    const lineCount = Math.max(1, wrappedLines.length);
    const marginV = newsShortAssBottomMarginV(style, fsHead, c.headline, c.subline, lineCount);
    const textBody = wrappedLines
      .map((ln) => wrapWordsWithHighlights(ln, c.highlightWords, style))
      .filter(Boolean)
      .join("\\N");
    const text = textBody || " ";
    lines.push(`Dialogue: 0,${start},${end},Default,,${marginLR},${marginLR},${marginV},,{\\q2}${text}`);
  }

  return `${header}${lines.join("\n")}\n`;
}
