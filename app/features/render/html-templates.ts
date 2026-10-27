import { BRAND_HORSE_RACING_MARK, BRAND_MARK } from "@/app/lib/brand";
import { newsShortBrandLogoSvg, NEWS_SHORT_BRAND_LOGO_CSS } from "@/app/lib/news-short-brand-logo";
import { decodeHtmlEntities } from "@/app/lib/html-entities";
import {
  computeF1ResultsLayout,
  displayF1ResultsDriverName,
} from "@/app/lib/f1-results-layout";
import {
  sanitizeSport365Scorers,
  type Sport365MatchScorer,
} from "@/app/lib/match-report/parse-sport365-match-page-summary";

/** Inline SVG — jockey cap cue beside jockey name on classic racecard rows */
const RC_CLASSIC_CAP_ICON = `<svg class="rc-classic-cap-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 14" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 10V7c0-3 3.5-5 8-5s8 2 8 5v3H2zm2-1h12V7.2C16 5.5 13.2 4 10 4S4 5.5 4 7.2V9z"/></svg>`;

/** Placeholder when no course image URL — circular track motif */
const RC_CLASSIC_THUMB_PLACEHOLDER = `<svg class="rc-classic-thumb-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="rct" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a3a5c"/><stop offset="100%" stop-color="#0c1e33"/></linearGradient></defs><circle cx="32" cy="32" r="30" fill="url(#rct)"/><ellipse cx="32" cy="36" rx="22" ry="12" fill="none" stroke="#c9a44a" stroke-width="2"/><path d="M14 38c6-8 30-8 36 0" fill="none" stroke="#e8dcc4" stroke-width="1.5" opacity="0.6"/></svg>`;
import { TEMPLATE_FIELD_ANIM_KEYFRAMES_CSS, tplAnimInlineStyle } from "@/app/lib/template-field-animation";
import type {
  FastIntroFieldAnimations,
  FastOutroFieldAnimations,
  FastPlacingsFieldAnimations,
  FastWinnerFieldAnimations,
  NextOffIntroFieldAnimations,
  NextOffOutroFieldAnimations,
  NextOffTipFieldAnimations,
  RcBoardGridFieldAnimations,
  RcCtaFieldAnimations,
  RcIntroFieldAnimations,
  RcMoverFieldAnimations,
  RunnerSilks,
} from "@/types";
import { raceSilkBadgeHtml } from "./race-silk-html";
import { tryRenderFootballTemplate } from "./football-templates";
import { tryRenderTeamLineUpTemplate } from "./team-line-up-templates";
import { tryRenderTeamSheetTemplate } from "./team-sheet-templates";
import { tryRenderScoreLineTemplate } from "./score-line-templates";
import type { NewsShortHeadlineFontId } from "@/app/lib/news-short-fonts";
import { resolveNewsShortFontBundle } from "@/app/lib/news-short-fonts";
import {
  NEWS_SHORT_MOTION_LETTER_SPACING,
  clampMotionBackdropDimStrength,
  clampMotionBackdropOpaqueOpacity,
  newsShortMotionFullFrameGradient,
  newsShortMotionPanelBorder,
  newsShortMotionPanelGradient,
  newsShortMotionTightLineHeight,
} from "@/app/lib/news-short-motion-layout";
import { NEWS_SHORT_FOOTER_SAFE_PX } from "@/app/lib/news-short-subtitle-layout";
import {
  newsShortCreativeLayoutCss,
  normalizeCreativeVideoFormat,
} from "@/app/features/news-shorts/creative-video-format";
import {
  LEAGUE_TABLE_CARD_TOKENS,
  leagueTableBrandToken,
  leagueTablePageRows,
  leagueTableRowsForMode,
  type LeagueRow,
  type LeagueTableMode,
} from "@/app/lib/league-table-card-config";
import {
  leagueTableBrandLogoSvg,
  normalizePlanetFootballDisplayBrand,
  planetFootballBrandDefaults,
  planetFootballSurfaceTokens,
  resolveLeagueBrandFromSceneData,
} from "@/app/lib/planet-football-table-brands";
import { PLANET_FOOTBALL_COLORS } from "@/app/lib/planet-football-brand";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Uniform black + readability gradient over motion when PNG uses alpha (editor video backdrop). */
function editorMotionBackdropLayersHtml(data: Data): string {
  if (!data.editorTransparentBackground) return "";
  const isSport365 = String(data.brand ?? "") === "sport365";
  let dimStrength = clampMotionBackdropDimStrength(data.motionBackdropDimStrength ?? (isSport365 ? 0.32 : 0.45));
  let opaqueStrength = clampMotionBackdropOpaqueOpacity(data.motionBackdropOpaqueOpacity ?? (isSport365 ? 0.22 : 0.3));
  /** Sport365: enough dim for data legibility without killing motion punch. */
  if (isSport365) {
    dimStrength = Math.min(dimStrength, 0.38);
    opaqueStrength = Math.min(opaqueStrength, 0.28);
  }
  return `<div class="editor-motion-opaque" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;background:rgba(0,0,0,${opaqueStrength.toFixed(3)});"></div><div class="editor-motion-dim" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none;background:${newsShortMotionFullFrameGradient(dimStrength)};"></div>`;
}

/** ISO `yyyy-mm-dd` → readable date; otherwise return trimmed string */
function formatRaceDateLine(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  return s;
}

/** Compact meta line for full racecard runner rows (form, draw, weight, etc.) */
function runnerExtraMetaLine(r: {
  form?: string;
  draw?: number;
  weight?: string;
  officialRating?: number;
  daysSinceRun?: number;
  status?: string;
  movement?: string;
  movementText?: string;
  odds: string;
  bestOdds?: string;
  sp?: string;
  stars?: number;
}): string {
  const bits: string[] = [];
  const form = (r.form ?? "").trim();
  if (form) bits.push(`Form ${form}`);
  if (r.draw != null && Number.isFinite(r.draw)) bits.push(`Dr ${r.draw}`);
  const w = (r.weight ?? "").trim();
  if (w) bits.push(w);
  if (r.officialRating != null && Number.isFinite(r.officialRating)) bits.push(`OR ${r.officialRating}`);
  if (r.daysSinceRun != null && Number.isFinite(r.daysSinceRun)) bits.push(`${r.daysSinceRun}d`);
  const st = (r.status ?? "").trim();
  if (st) bits.push(st);
  const mov = (r.movementText ?? "").trim();
  if (mov) bits.push(mov);
  else if (r.movement && r.movement !== "unknown") bits.push(String(r.movement));
  const bo = (r.bestOdds ?? "").trim();
  if (bo && bo !== (r.odds ?? "").trim()) bits.push(`Best ${bo}`);
  const sp = (r.sp ?? "").trim();
  if (sp) bits.push(`SP ${sp}`);
  if (r.stars != null && r.stars > 0) bits.push(`${"★".repeat(Math.min(5, Math.floor(r.stars)))}`);
  return bits.join(" · ");
}

type Data = Record<string, unknown>;

function editorCompositorImg(data: Data): string {
  const u = data.editorCompositorImageUrl;
  if (typeof u !== "string" || !u.startsWith("data:image/")) return "";
  return `<img class="editor-compositor-layer" src="${esc(u)}" alt="" />`;
}

const templateUiCss = (h: number) => `
  .accent-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 8px;
    background: linear-gradient(90deg, #eab308, #22c55e);
  }
  .brand {
    position: absolute;
    top: 36px;
    right: 40px;
    font-size: ${h > 1600 ? 28 : 22}px;
    font-weight: 800;
    color: #eab308;
    letter-spacing: 0.06em;
  }
  .kicker {
    font-size: ${h > 1600 ? 26 : 20}px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 16px;
  }
  .kicker,
  .fast-intro-race-title,
  .fast-intro-date {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.9);
  }
  .fast-intro-panel h1:not(.next-off-tip-title),
  .fast-winner-panel h1,
  .fast-outro-panel h1 {
    display: inline-block;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(2, 6, 23, 0.86);
  }
  .fast-intro-panel--next-off-tip h1.next-off-tip-title {
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(2, 6, 23, 0.86);
  }
  .fast-scene-shell {
    width: 100%;
    max-width: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: 8px;
    box-sizing: border-box;
  }
  .fast-intro-panel {
    width: 100%;
    max-width: ${h > 1600 ? 920 : 780}px;
    margin: 0 auto;
    text-align: center;
    background: linear-gradient(165deg, #1a1f2e 0%, #111827 45%, #0f172a 100%);
    border: 1px solid rgba(55, 65, 81, 0.9);
    border-radius: 20px;
    padding: ${h > 1600 ? 52 : 42}px ${h > 1600 ? 44 : 36}px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .fast-intro-panel .kicker {
    font-size: ${h > 1600 ? 56 : 42}px;
    line-height: 1.15;
    margin-bottom: ${h > 1600 ? 20 : 16}px;
    color: #ffffff;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .fast-intro-race-title {
    font-size: ${h > 1600 ? 38 : 28}px;
    font-weight: 800;
    color: #f1f5f9;
    line-height: 1.2;
    margin: 0 0 ${h > 1600 ? 18 : 14}px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .fast-intro-panel h1 {
    margin: 0 0 ${h > 1600 ? 16 : 12}px;
    font-size: ${h > 1600 ? 88 : 64}px;
    line-height: 1.05;
    color: #ffffff;
    font-weight: 800;
  }
  .fast-intro-panel .odds {
    font-size: ${h > 1600 ? 80 : 58}px;
    color: #22c55e;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  /* Next-off tip: large silk + horse name must stay inside panel */
  .fast-intro-panel--next-off-tip h1.next-off-tip-title {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    justify-content: center;
    flex-wrap: wrap;
    row-gap: 14px;
    column-gap: 24px;
    font-size: ${h > 1600 ? 68 : 52}px;
    line-height: 1.08;
    text-align: center;
  }
  .fast-intro-panel--next-off-tip h1.next-off-tip-title .next-off-tip-silk {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .fast-intro-panel--next-off-tip h1.next-off-tip-title .next-off-tip-horse {
    min-width: 0;
    flex: 1 1 12rem;
    max-width: 100%;
    text-align: center;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .fast-intro-panel--next-off-tip h1.next-off-tip-title--solo {
    display: block;
  }
  .fast-intro-panel--next-off-tip h1.next-off-tip-title--solo .next-off-tip-horse {
    display: block;
    max-width: 100%;
  }
  .fast-intro-date {
    margin: ${h > 1600 ? 18 : 14}px 0 0;
    font-size: ${h > 1600 ? 28 : 22}px;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.04em;
  }
  .fast-winner-panel {
    width: 100%;
    max-width: ${h > 1600 ? 920 : 780}px;
    margin: 0 auto;
    text-align: left;
    background: linear-gradient(165deg, #1a1f2e 0%, #111827 45%, #0f172a 100%);
    border: 1px solid rgba(55, 65, 81, 0.9);
    border-radius: 20px;
    padding: ${h > 1600 ? 44 : 36}px ${h > 1600 ? 40 : 32}px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .fast-winner-panel h1 {
    margin-bottom: 14px;
    justify-content: center;
    color: #ffffff;
  }
  .fast-board-list-card {
    margin-top: ${h > 1600 ? 16 : 14}px;
    border-radius: 14px;
    background: rgba(8, 18, 20, 0.7);
    border: 1px solid rgba(51, 65, 85, 0.75);
    overflow: hidden;
  }
  .fast-board-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${h > 1600 ? 14 : 10}px;
    padding: ${h > 1600 ? "16px 18px" : "12px 14px"};
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }
  .fast-board-row:last-child { border-bottom: none; }
  .fast-board-left {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: ${h > 1600 ? 14 : 10}px;
    flex: 1;
  }
  .fast-board-pos {
    font-size: ${h > 1600 ? 48 : 36}px;
    line-height: 1;
    font-weight: 900;
    color: #ffffff;
    flex-shrink: 0;
    width: ${h > 1600 ? 54 : 42}px;
    text-align: right;
  }
  .fast-board-name {
    min-width: 0;
    font-size: ${h > 1600 ? 48 : 36}px;
    font-weight: 800;
    line-height: 1.1;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fast-board-price {
    flex-shrink: 0;
    font-size: ${h > 1600 ? 48 : 36}px;
    font-weight: 900;
    color: #22c55e;
    letter-spacing: 0.01em;
  }
  .fast-outro-panel {
    width: 100%;
    max-width: ${h > 1600 ? 920 : 780}px;
    margin: 0 auto;
    text-align: center;
    background: linear-gradient(165deg, #1a1f2e 0%, #111827 45%, #0f172a 100%);
    border: 1px solid rgba(55, 65, 81, 0.9);
    border-radius: 20px;
    padding: ${h > 1600 ? 44 : 36}px ${h > 1600 ? 40 : 32}px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .fast-outro-panel .kicker {
    font-size: ${h > 1600 ? 48 : 38}px;
    line-height: 1.15;
    margin-bottom: ${h > 1600 ? 22 : 18}px;
    color: #ffffff;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .fast-outro-panel h1 {
    margin-bottom: 0;
    line-height: 1.08;
  }
  h1 {
    font-size: ${h > 1600 ? 72 : 52}px;
    line-height: 1.05;
    font-weight: 800;
    margin-bottom: 12px;
  }
  .odds {
    color: #22c55e;
    font-weight: 800;
    font-size: ${h > 1600 ? 64 : 48}px;
  }
  .card {
    background: rgba(18, 26, 22, 0.95);
    border: 1px solid #1f2d26;
    border-radius: 12px;
    padding: 24px 28px;
    margin-top: 20px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid #1f2d26;
    font-size: ${h > 1600 ? 34 : 26}px;
    font-weight: 700;
  }
  .row:last-child { border-bottom: none; }
  /* Fast results — Top four only (scoped so other .card/.row templates unchanged) */
  .fast-placings-stack {
    width: 100%;
    max-width: ${h > 1600 ? 920 : 780}px;
    margin: 0 auto;
    text-align: center;
  }
  .fast-placings-stack .card {
    border-radius: 20px;
    padding: ${h > 1600 ? 32 : 28}px ${h > 1600 ? 36 : 32}px;
    margin-top: ${h > 1600 ? 20 : 16}px;
    background: linear-gradient(165deg, #1a1f2e 0%, #111827 45%, #0f172a 100%);
    border: 1px solid rgba(55, 65, 81, 0.9);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .fast-placings-stack .row {
    font-size: ${h > 1600 ? 46 : 36}px;
    padding: ${h > 1600 ? 18 : 16}px 0;
  }
  .fast-placings-stack .row .odds {
    font-size: ${h > 1600 ? 40 : 32}px;
  }
  .led-silk-wrap {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
  }
  .led-silk-svg { display: block; }
  .muted { color: #64748b; font-size: 0.85em; }
  .stars { color: #eab308; letter-spacing: 4px; }
  .drift { color: #ef4444; }
  .backed { color: #22c55e; }
  /* rc-mover / rc-cta — plate behind text (above backdrop dim + compositor PNG) */
  .rc-slide-bg-wrap {
    position: relative;
    width: 100%;
    max-width: ${h > 1600 ? 920 : 780}px;
    margin: 0 auto;
    text-align: center;
    padding: ${h > 1600 ? 44 : 36}px ${h > 1600 ? 40 : 32}px;
    box-sizing: border-box;
  }
  .rc-slide-bg-wrap::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(165deg, rgba(26, 31, 46, 0.94) 0%, rgba(17, 24, 39, 0.96) 45%, rgba(15, 23, 42, 0.97) 100%);
    border: 1px solid rgba(55, 65, 81, 0.9);
    border-radius: 20px;
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    z-index: 0;
    pointer-events: none;
  }
  .rc-slide-bg-wrap > * {
    position: relative;
    z-index: 1;
  }
  .rc-slide-bg-wrap .kicker {
    font-size: ${h > 1600 ? 56 : 42}px;
    line-height: 1.15;
    margin-bottom: ${h > 1600 ? 20 : 16}px;
    color: #ffffff;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  ${TEMPLATE_FIELD_ANIM_KEYFRAMES_CSS}
`;

const baseStyle = (w: number, h: number) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${w}px;
    height: ${h}px;
    background: linear-gradient(180deg, #0a0a0a 0%, #111827 55%, #0a0a0a 100%);
    color: #f8fafc;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    position: relative;
    overflow: hidden;
  }
  body .editor-compositor-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 0;
    pointer-events: none;
  }
  body .editor-foreground-stack {
    position: relative;
    z-index: 1;
    min-height: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: stretch;
    padding: 48px 40px;
    box-sizing: border-box;
  }
  ${templateUiCss(h)}
`;

const backdropStyleBlock = (w: number, h: number) => `
  body.with-editor-backdrop {
    width: ${w}px;
    height: ${h}px;
    margin: 0;
    padding: 0;
    position: relative;
    overflow: hidden;
    background: #0a0e0c;
  }
  body.with-editor-backdrop .editor-bg-image {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 0;
  }
  body.with-editor-backdrop .editor-bg-dim {
    position: absolute;
    inset: 0;
    background: rgba(10, 14, 12, 0.48);
    z-index: 1;
    pointer-events: none;
  }
  body.with-editor-backdrop .editor-compositor-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 2;
    pointer-events: none;
  }
  body.with-editor-backdrop .editor-foreground {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 48px 40px;
    color: #f8fafc;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  body.with-editor-backdrop .rc-slide-bg-wrap::before {
    background: rgba(0, 0, 0, 0.45);
    border-color: rgba(148, 163, 184, 0.35);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  }
`;

const baseStyleWithEditorBackdrop = (w: number, h: number) => `
  ${backdropStyleBlock(w, h)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ${templateUiCss(h)}
`;

/** PNG alpha — motion video composited under this layer in FFmpeg */
const baseStyleTransparent = (w: number, h: number) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent !important; }
  body.with-editor-transparent {
    width: ${w}px;
    height: ${h}px;
    margin: 0;
    padding: 0;
    position: relative;
    overflow: hidden;
    color: #f8fafc;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  body.with-editor-transparent .editor-compositor-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 2;
    pointer-events: none;
  }
  body.with-editor-transparent .editor-foreground {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 48px 40px;
  }
  body.with-editor-transparent h1,
  body.with-editor-transparent .kicker,
  body.with-editor-transparent .odds,
  body.with-editor-transparent .muted {
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
  }
  body.with-editor-transparent .rc-slide-bg-wrap::before {
    background: rgba(0, 0, 0, 0.52);
    border-color: rgba(148, 163, 184, 0.38);
  }
  ${templateUiCss(h)}
`;

const staticPngCss = `
  body[data-r365-static-png="1"] .editor-foreground *,
  body[data-r365-static-png="1"] .editor-foreground-stack * {
    animation: none !important;
    animation-delay: 0s !important;
    opacity: 1 !important;
    transform: none !important;
  }
`;

function wrap(title: string, inner: string, w: number, h: number, data: Data = {}) {
  const transparent = Boolean(data.editorTransparentBackground);
  const url = data.editorBackgroundImageUrl as string | undefined;
  const hasBgImg = Boolean(url) && !transparent;
  const comp = editorCompositorImg(data);
  const staticPng = Boolean(data.r365StaticPng);
  const staticAttr = staticPng ? ' data-r365-static-png="1"' : "";

  let styles: string;
  let bodyAttrs: string;
  let bodyInner: string;

  if (transparent) {
    styles = baseStyleTransparent(w, h);
    bodyAttrs = ' class="with-editor-transparent"';
    bodyInner = `${editorMotionBackdropLayersHtml(data)}${comp}<div class="editor-foreground"><div class="accent-bar"></div><div class="brand">${BRAND_HORSE_RACING_MARK}</div>${inner}</div>`;
  } else if (hasBgImg) {
    styles = baseStyleWithEditorBackdrop(w, h);
    bodyAttrs = ' class="with-editor-backdrop"';
    bodyInner = `<img class="editor-bg-image" src="${esc(url)}" alt="" /><div class="editor-bg-dim" aria-hidden="true"></div>${comp}<div class="editor-foreground"><div class="accent-bar"></div><div class="brand">${BRAND_HORSE_RACING_MARK}</div>${inner}</div>`;
  } else {
    styles = baseStyle(w, h);
    bodyAttrs = "";
    bodyInner = `${comp}<div class="editor-foreground-stack"><div class="accent-bar"></div><div class="brand">${BRAND_HORSE_RACING_MARK}</div>${inner}</div>`;
  }

  bodyAttrs = `${bodyAttrs}${staticAttr}`;
  const styleBlock = staticPng ? `${styles}${staticPngCss}` : styles;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${styleBlock}</style></head><body${bodyAttrs}>${bodyInner}</body></html>`;
}

/** Full racecard “classic” board — cream panel, navy/gold header & footer (Irish-style reference) */
function rcClassicBoardCss(h: number, hasBgImg: boolean, transparent: boolean): string {
  const big = h > 1600;
  const fs = (a: number, b: number) => (big ? `${a}px` : `${b}px`);
  const base = `
    .led-frame.rc-classic-board {
      border: none;
      border-radius: 0;
      background: #f4efe4;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    }
    .rc-classic-header {
      display: flex;
      align-items: center;
      gap: ${big ? "18px" : "14px"};
      background: #0a1f33;
      color: #f8fafc;
      padding: ${big ? "18px 20px" : "14px 16px"};
      flex-shrink: 0;
    }
    .rc-classic-thumb-wrap {
      flex-shrink: 0;
      width: ${big ? "88px" : "72px"};
      height: ${big ? "88px" : "72px"};
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid #c9a44a;
      background: #0c2844;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    .rc-classic-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .rc-classic-thumb-wrap .rc-classic-thumb-svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .rc-classic-hdr-text {
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .rc-classic-hdr-line1 {
      font-weight: 900;
      font-size: ${fs(40, 30)};
      letter-spacing: 0.04em;
      line-height: 1.1;
      text-transform: uppercase;
      color: #f8fafc;
    }
    .rc-classic-hdr-race {
      margin-top: ${big ? "6px" : "4px"};
      font-weight: 800;
      font-size: ${fs(22, 17)};
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #e5c169;
      line-height: 1.2;
    }
    .rc-classic-hdr-sub {
      margin-top: ${big ? "6px" : "4px"};
      font-size: ${fs(18, 14)};
      font-weight: 600;
      color: rgba(248, 250, 252, 0.88);
      letter-spacing: 0.02em;
    }
    .rc-classic-board1-facts {
      flex-shrink: 0;
      padding: ${big ? "12px 20px" : "10px 14px"};
      background: #e8e0d2;
      border-bottom: 1px solid #c4bba8;
      color: #0a1f33;
      font-size: ${fs(16, 13)};
      line-height: 1.4;
      text-align: center;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .rc-classic-board1-race {
      font-weight: 900;
      text-transform: uppercase;
    }
    .rc-classic-board1-sep {
      font-weight: 700;
      color: #475569;
    }
    .rc-classic-board1-rest {
      font-weight: 700;
    }
    .rc-classic-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${big ? "8px 18px" : "6px 14px"};
      font-size: ${fs(17, 13)};
      font-weight: 700;
      color: #334155;
      background: #ebe4d6;
      border-bottom: 1px solid #cfc6b8;
      flex-shrink: 0;
    }
    .led-frame.rc-classic-board .led-rows.rc-classic-rows {
      background: #f4efe4;
    }
    .led-frame.rc-classic-board .led-row.rc-classic-row {
      border-bottom: 1px solid #cfc6b8;
      padding: ${big ? "10px 16px" : "8px 12px"};
      gap: ${big ? "12px" : "8px"};
      align-items: center;
    }
    .led-frame.rc-classic-board .led-row.rc-classic-row.pick {
      background: rgba(201, 164, 74, 0.12);
    }
    .rc-classic-num {
      flex-shrink: 0;
      font-weight: 900;
      font-size: ${fs(34, 26)};
      color: #0a1f33;
      line-height: 1;
      min-width: ${big ? "36px" : "28px"};
      text-align: center;
      align-self: center;
    }
    .led-frame.rc-classic-board .led-silk-wrap {
      flex-shrink: 0;
      margin-right: 0;
      padding-top: 2px;
    }
    .rc-classic-main {
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .rc-classic-horseline {
      font-weight: 900;
      font-size: ${fs(24, 18)};
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #0a1f33;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rc-classic-horseline-num {
      font-weight: 900;
      margin-right: 0.25em;
    }
    .rc-classic-jockey,
    .rc-classic-trainer {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: ${fs(16, 13)};
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
      line-height: 1.2;
    }
    .rc-classic-cap-icon {
      flex-shrink: 0;
      opacity: 0.85;
    }
    .led-frame.rc-classic-board .led-odds.rc-classic-odds {
      color: #0a1f33;
      background: linear-gradient(180deg, #f0d78c 0%, #e5c169 55%, #d4af37 100%);
      border: 1px solid #a67c2a;
      border-radius: 4px;
      padding: ${big ? "8px 14px" : "6px 10px"};
      min-width: ${big ? "76px" : "62px"};
      text-align: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
      font-size: ${fs(22, 17)};
      align-self: center;
    }
    .rc-classic-footer {
      flex-shrink: 0;
      background: #0a1f33;
      color: #f8fafc;
      text-align: center;
      padding: ${big ? "12px 16px" : "10px 12px"};
      border-top: 2px solid #c9a44a;
    }
    .rc-classic-foot-note {
      font-size: ${fs(15, 12)};
      font-weight: 700;
      color: #e5c169;
      margin-bottom: ${big ? "8px" : "6px"};
      letter-spacing: 0.03em;
    }
    .rc-classic-brand {
      font-size: ${fs(20, 16)};
      font-weight: 900;
      letter-spacing: 0.12em;
      color: #f8fafc;
    }
  `;
  const backdrop =
    hasBgImg || transparent
      ? `
    body.with-editor-backdrop-led .led-frame.rc-classic-board,
    body.with-editor-transparent-led .led-frame.rc-classic-board {
      background: rgba(244, 239, 228, 0.38) !important;
      box-shadow:
        0 8px 40px rgba(0, 0, 0, 0.35),
        0 0 0 1px rgba(234, 179, 8, 0.38) !important;
    }
    body.with-editor-backdrop-led .rc-classic-header,
    body.with-editor-transparent-led .rc-classic-header {
      background: rgba(10, 31, 51, 0.48);
      backdrop-filter: blur(6px);
    }
    body.with-editor-backdrop-led .led-frame.rc-classic-board .led-rows.rc-classic-rows,
    body.with-editor-transparent-led .led-frame.rc-classic-board .led-rows.rc-classic-rows {
      background: rgba(244, 239, 228, 0.28);
    }
    body.with-editor-backdrop-led .led-frame.rc-classic-board .led-row.rc-classic-row,
    body.with-editor-transparent-led .led-frame.rc-classic-board .led-row.rc-classic-row {
      border-bottom-color: rgba(80, 70, 55, 0.4);
      background: rgba(255, 255, 255, 0.06);
    }
    body.with-editor-backdrop-led .rc-classic-board1-facts,
    body.with-editor-transparent-led .rc-classic-board1-facts {
      background: rgba(232, 224, 210, 0.45);
    }
    body.with-editor-backdrop-led .rc-classic-meta,
    body.with-editor-transparent-led .rc-classic-meta {
      background: rgba(235, 228, 214, 0.4);
    }
    body.with-editor-backdrop-led .rc-classic-footer,
    body.with-editor-transparent-led .rc-classic-footer {
      background: rgba(10, 31, 51, 0.48);
      backdrop-filter: blur(6px);
    }
    `
      : "";
  return base + backdrop;
}

/** Dark list racecard (Board 1/2 style) — charcoal panel, green odds */
function rcDarkBoardCss(h: number, hasBgImg: boolean, transparent: boolean): string {
  const big = h > 1600;
  const fs = (a: number, b: number) => (big ? `${a}px` : `${b}px`);
  const base = `
    .led-frame.rc-dark-board {
      border: none;
      border-radius: 0;
      background: #070a0d;
      display: flex;
      flex-direction: column;
      /* Shrink to content when short so the card can sit vertically centred in the frame; cap tall boards. */
      height: auto;
      max-height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .rc-dark-hdr {
      flex-shrink: 0;
      padding: ${big ? "16px 18px 14px" : "12px 14px 10px"};
      border-bottom: 1px solid rgba(51, 65, 85, 0.55);
    }
    .rc-dark-board-title {
      font-size: ${fs(40, 30)};
      font-weight: 900;
      letter-spacing: 0.03em;
      color: #f8fafc;
      text-transform: none;
      line-height: 1.18;
      word-break: break-word;
    }
    .rc-dark-race-name {
      margin-top: ${big ? "10px" : "8px"};
      font-size: ${fs(17, 13)};
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      line-height: 1.25;
    }
    .rc-dark-page-meta {
      margin-top: ${big ? "8px" : "6px"};
      font-size: ${fs(15, 12)};
      font-weight: 700;
      color: #64748b;
    }
    .led-frame.rc-dark-board .led-rows.rc-dark-rows {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: ${big ? "12px 14px 16px" : "10px 12px 14px"};
      background: #070a0d;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
    }
    .rc-dark-list-card {
      border-radius: 14px;
      border: 1px solid rgba(51, 65, 85, 0.65);
      background: rgba(12, 18, 24, 0.92);
      overflow: hidden;
      width: 100%;
      max-height: 100%;
      flex: 0 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .rc-dark-list-inner {
      flex: 1 1 auto;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .rc-dark-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: ${big ? "10px" : "8px"};
      padding: ${big ? "12px 14px" : "8px 10px"};
      border-bottom: 1px solid rgba(148, 163, 184, 0.14);
      flex-shrink: 0;
    }
    .rc-dark-row:last-child { border-bottom: none; }
    .rc-dark-row.pick {
      background: rgba(34, 197, 94, 0.08);
    }
    .rc-dark-left {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: ${big ? "12px" : "10px"};
      flex: 1;
    }
    .rc-dark-pos {
      font-size: ${fs(30, 22)};
      font-weight: 900;
      color: #f8fafc;
      flex-shrink: 0;
      width: ${big ? "42px" : "34px"};
      text-align: right;
      line-height: 1.15;
      align-self: center;
    }
    .led-frame.rc-dark-board .led-silk-wrap {
      flex-shrink: 0;
      margin-right: 0;
    }
    .rc-dark-main {
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .rc-dark-horse {
      font-size: ${fs(26, 19)};
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.15;
      letter-spacing: 0.02em;
    }
    .rc-dark-sub {
      font-size: ${fs(16, 12)};
      font-weight: 600;
      color: #94a3b8;
      margin-top: 4px;
      line-height: 1.25;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .rc-dark-subtle {
      font-size: ${fs(14, 11)};
      font-weight: 600;
      color: #64748b;
      margin-top: 4px;
      line-height: 1.35;
      word-break: break-word;
    }
    .rc-dark-odds {
      color: #22c55e;
      font-weight: 900;
      font-size: ${fs(26, 19)};
      align-self: center;
      flex-shrink: 0;
      min-width: ${big ? "68px" : "52px"};
      text-align: right;
      line-height: 1.1;
    }
    .rc-dark-footer {
      flex-shrink: 0;
      padding: ${big ? "10px 14px" : "8px 10px"};
      border-top: 1px solid rgba(51, 65, 85, 0.55);
      text-align: center;
      background: rgba(0, 0, 0, 0.35);
    }
    .rc-dark-foot-note {
      font-size: ${fs(14, 11)};
      font-weight: 700;
      color: #eab308;
      margin-bottom: 6px;
    }
    .rc-dark-brand {
      font-size: ${fs(16, 13)};
      font-weight: 900;
      letter-spacing: 0.14em;
      color: #cbd5e1;
    }
    .rc-dark-board.rc-dark-board--compact .rc-dark-pos {
      font-size: ${fs(24, 18)};
      width: ${big ? "38px" : "30px"};
    }
    .rc-dark-board.rc-dark-board--compact .rc-dark-horse {
      font-size: ${fs(22, 16)};
    }
    .rc-dark-board.rc-dark-board--compact .rc-dark-odds {
      font-size: ${fs(22, 17)};
    }
    .rc-dark-board.rc-dark-board--compact .rc-dark-sub {
      font-size: ${fs(14, 11)};
    }
    .rc-dark-board.rc-dark-board--compact .rc-dark-subtle {
      font-size: ${fs(12, 10)};
    }
    .rc-dark-board.rc-dark-board--tight .rc-dark-row {
      padding: ${big ? "8px 10px" : "6px 8px"};
    }
    /* Preview + export: centre the full dark board (header + list + footer) vertically; same HTML/CSS for both. */
    body.with-editor-backdrop-led .editor-led-wrap:has(.rc-dark-board),
    body.with-editor-transparent-led .editor-led-wrap:has(.rc-dark-board),
    body:not(.with-editor-backdrop-led):not(.with-editor-transparent-led) .editor-led-plain-wrap:has(.rc-dark-board) {
      justify-content: center;
    }
  `;
  const backdrop =
    hasBgImg || transparent
      ? `
    body.with-editor-backdrop-led .led-frame.rc-dark-board,
    body.with-editor-transparent-led .led-frame.rc-dark-board {
      background: rgba(7, 10, 13, 0.35) !important;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(234, 179, 8, 0.28) !important;
    }
    body.with-editor-backdrop-led .rc-dark-hdr,
    body.with-editor-transparent-led .rc-dark-hdr {
      background: rgba(7, 10, 13, 0.42);
      border-bottom-color: rgba(148, 163, 184, 0.22);
      backdrop-filter: blur(8px);
    }
    body.with-editor-backdrop-led .led-frame.rc-dark-board .led-rows.rc-dark-rows,
    body.with-editor-transparent-led .led-frame.rc-dark-board .led-rows.rc-dark-rows {
      background: transparent;
    }
    body.with-editor-backdrop-led .rc-dark-list-card,
    body.with-editor-transparent-led .rc-dark-list-card {
      background: rgba(12, 18, 24, 0.42);
      border-color: rgba(51, 65, 85, 0.45);
    }
    body.with-editor-backdrop-led .rc-dark-footer,
    body.with-editor-transparent-led .rc-dark-footer {
      background: rgba(0, 0, 0, 0.28);
      border-top-color: rgba(51, 65, 85, 0.35);
      backdrop-filter: blur(6px);
    }
    `
      : "";
  return base + backdrop;
}

/** Cheltenham-style LED board — full bleed black, yellow/green */
function wrapLedBoard(inner: string, w: number, h: number, title: string, data: Data = {}) {
  const transparent = Boolean(data.editorTransparentBackground);
  const url = data.editorBackgroundImageUrl as string | undefined;
  const hasBgImg = Boolean(url) && !transparent;
  const comp = editorCompositorImg(data);
  const padY = h > 1600 ? "28px" : "22px";
  const padX = w > 1200 ? "32px" : "24px";
  const ledBackdrop = hasBgImg
    ? `
    body.with-editor-backdrop-led {
      position: relative;
      width: ${w}px;
      height: ${h}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #000;
      color: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    body.with-editor-backdrop-led .editor-bg-image {
      position: absolute;
      left: 0;
      top: 0;
      width: ${w}px;
      height: ${h}px;
      object-fit: cover;
      z-index: 0;
    }
    body.with-editor-backdrop-led .editor-bg-dim {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.42);
      z-index: 1;
      pointer-events: none;
    }
    body.with-editor-backdrop-led .editor-compositor-layer {
      position: absolute;
      left: 0;
      top: 0;
      width: ${w}px;
      height: ${h}px;
      object-fit: cover;
      z-index: 2;
      pointer-events: none;
    }
    body.with-editor-backdrop-led .editor-led-wrap {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: ${padY} ${padX};
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    `
    : transparent
      ? `
    html, body { background: transparent !important; }
    body.with-editor-transparent-led {
      position: relative;
      width: ${w}px;
      height: ${h}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
      color: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    body.with-editor-transparent-led .editor-compositor-layer {
      position: absolute;
      left: 0;
      top: 0;
      width: ${w}px;
      height: ${h}px;
      object-fit: cover;
      z-index: 2;
      pointer-events: none;
    }
    body.with-editor-transparent-led .editor-led-wrap {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: ${padY} ${padX};
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    `
      : `
    body {
      position: relative;
      width: ${w}px;
      height: ${h}px;
      background: #000;
      color: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      padding: 0;
      margin: 0;
    }
    body:not(.with-editor-backdrop-led):not(.with-editor-transparent-led) .editor-compositor-layer {
      position: absolute;
      left: 0;
      top: 0;
      width: ${w}px;
      height: ${h}px;
      object-fit: cover;
      z-index: 0;
      pointer-events: none;
    }
    body:not(.with-editor-backdrop-led):not(.with-editor-transparent-led) .editor-led-plain-wrap {
      position: relative;
      z-index: 1;
      box-sizing: border-box;
      padding: ${padY} ${padX};
      min-height: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ${ledBackdrop}
    .led-frame {
      max-height: 100%;
      flex: 0 1 auto;
      align-self: stretch;
      width: 100%;
      border: 3px dashed #eab308;
      display: flex;
      flex-direction: column;
      background: #000;
    }
    .led-hdr {
      background: #eab308;
      color: #000;
      font-weight: 900;
      font-size: ${h > 1600 ? "44px" : "34px"};
      text-align: center;
      letter-spacing: 0.04em;
      padding: ${h > 1600 ? "14px" : "10px"} 12px;
    }
    .led-sub {
      color: #22c55e;
      font-weight: 800;
      font-size: ${h > 1600 ? "30px" : "24px"};
      text-align: center;
      padding: ${h > 1600 ? "10px" : "8px"} 8px 6px;
      background: #000;
    }
    .led-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 12px 8px;
      font-size: ${h > 1600 ? "20px" : "16px"};
      color: #64748b;
    }
    .led-rows {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .led-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: ${h > 1600 ? "8px" : "6px"} 14px;
      border-bottom: 1px solid #1a1a1a;
      flex-shrink: 0;
    }
    .led-row.pick {
      background: rgba(34, 197, 94, 0.1);
    }
    .led-silk-wrap {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      margin-right: 2px;
    }
    .led-silk-svg {
      display: block;
    }
    .led-cloth {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      min-width: ${h > 1600 ? "78px" : "62px"};
    }
    .led-num {
      color: #fefce8;
      font-weight: 900;
      font-size: ${h > 1600 ? "26px" : "20px"};
      width: ${h > 1600 ? "40px" : "34px"};
      flex-shrink: 0;
    }
    .led-cloth .led-num {
      width: auto;
      min-width: ${h > 1600 ? "28px" : "22px"};
    }
    .led-name {
      flex: 1;
      color: #eab308;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: ${h > 1600 ? "26px" : "20px"};
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .led-odds {
      color: #22c55e;
      font-weight: 900;
      font-size: ${h > 1600 ? "26px" : "22px"};
      min-width: 72px;
      text-align: right;
      flex-shrink: 0;
    }
    .led-foot {
      color: #22c55e;
      font-weight: 800;
      font-size: ${h > 1600 ? "24px" : "18px"};
      text-align: center;
      padding: ${h > 1600 ? "12px" : "8px"};
      border-top: 1px solid #262626;
    }
    .brand-led {
      position: absolute;
      top: ${h > 1600 ? "20px" : "14px"};
      right: ${h > 1600 ? "28px" : "22px"};
      font-size: ${h > 1600 ? "22px" : "18px"};
      font-weight: 900;
      color: #eab308;
      letter-spacing: 0.08em;
    }
    ${rcClassicBoardCss(h, hasBgImg, transparent)}
    ${rcDarkBoardCss(h, hasBgImg, transparent)}
    ${
      hasBgImg || transparent
        ? `
    /* Static image or motion-video (alpha) — translucent board chrome */
    body.with-editor-backdrop-led .led-frame:not(.rc-classic-board):not(.rc-dark-board),
    body.with-editor-transparent-led .led-frame:not(.rc-classic-board):not(.rc-dark-board) {
      background: rgba(0, 0, 0, 0.42) !important;
    }
    body.with-editor-backdrop-led .led-hdr,
    body.with-editor-transparent-led .led-hdr {
      background: rgba(234, 179, 8, 0.48) !important;
      color: #0a0a0a;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.45);
    }
    body.with-editor-backdrop-led .led-sub,
    body.with-editor-transparent-led .led-sub {
      background: rgba(0, 0, 0, 0.35) !important;
    }
    body.with-editor-backdrop-led .led-meta,
    body.with-editor-transparent-led .led-meta {
      background: rgba(0, 0, 0, 0.28);
    }
    body.with-editor-backdrop-led .led-rows,
    body.with-editor-transparent-led .led-rows {
      background: transparent;
    }
    body.with-editor-backdrop-led .led-row,
    body.with-editor-transparent-led .led-row {
      background: rgba(0, 0, 0, 0.22);
      border-bottom-color: rgba(255, 255, 255, 0.12);
    }
    body.with-editor-backdrop-led .led-row.pick,
    body.with-editor-transparent-led .led-row.pick {
      background: rgba(34, 197, 94, 0.18);
    }
    body.with-editor-backdrop-led .led-foot,
    body.with-editor-transparent-led .led-foot {
      background: rgba(0, 0, 0, 0.4);
    }
    body.with-editor-transparent-led .led-hdr,
    body.with-editor-transparent-led .led-name,
    body.with-editor-transparent-led .led-odds,
    body.with-editor-transparent-led .led-num {
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
    }
    body.with-editor-backdrop-led .led-name,
    body.with-editor-backdrop-led .led-odds,
    body.with-editor-backdrop-led .led-num {
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.75);
    }
    `
        : ""
    }
    ${TEMPLATE_FIELD_ANIM_KEYFRAMES_CSS}
  </style></head><body${
    hasBgImg ? ' class="with-editor-backdrop-led"' : transparent ? ' class="with-editor-transparent-led"' : ""
  }>${
    hasBgImg
      ? `<img class="editor-bg-image" src="${esc(url!)}" alt="" /><div class="editor-bg-dim" aria-hidden="true"></div>${comp}<div class="editor-led-wrap">${inner}</div>`
      : transparent
        ? `${editorMotionBackdropLayersHtml(data)}${comp}<div class="editor-led-wrap">${inner}</div>`
        : `${comp}<div class="editor-led-plain-wrap">${inner}</div>`
  }</body></html>`;
}

/** TEAMtalk News mint accent (brand reference) */
const TT_NEON = "#70E1A1";

function teamtalkNewsLayoutCss(w: number, h: number): string {
  const k = h > 1600 ? 1 : 0.82;
  const fs = (n: number) => `${Math.round(n * k)}px`;
  return `
  body.tt-news, body.with-tt-backdrop, body.with-tt-transparent {
    width: ${w}px;
    height: ${h}px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    position: relative;
    font-family: "Roboto Condensed", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0a0c10;
    color: #f8fafc;
  }
  body.with-tt-transparent { background: transparent !important; }
  html.with-tt-transparent { background: transparent !important; }
  body.tt-news .editor-compositor-layer,
  body.with-tt-backdrop .editor-compositor-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 0;
    pointer-events: none;
  }
  body.with-tt-transparent .editor-compositor-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 2;
    pointer-events: none;
  }
  body.with-tt-backdrop .editor-bg-image {
    position: absolute;
    left: 0;
    top: 0;
    width: ${w}px;
    height: ${h}px;
    object-fit: cover;
    z-index: 0;
  }
  body.with-tt-backdrop .editor-bg-dim {
    position: absolute;
    inset: 0;
    background: rgba(30, 38, 51, 0.82);
    z-index: 1;
    pointer-events: none;
  }
  body.tt-news .tt-foreground,
  body.with-tt-backdrop .tt-foreground {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 40px 32px 48px;
    display: flex;
    flex-direction: column;
  }
  body.with-tt-transparent .tt-foreground {
    position: relative;
    z-index: 3;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 40px 32px 48px;
    display: flex;
    flex-direction: column;
  }
  .tt-badge {
    position: absolute;
    top: 20px;
    left: 28px;
    width: 96px;
    height: 96px;
    background: ${TT_NEON};
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    border-radius: 4px;
  }
  .tt-mark {
    font-size: 40px;
    font-weight: 900;
    color: #0a0a0a;
    letter-spacing: -0.06em;
    line-height: 1;
  }
  .tt-intro-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    text-align: center;
    padding: 32px 12px 28px;
  }
  .tt-tag {
    font-size: ${fs(32)};
    font-weight: 800;
    color: ${TT_NEON};
    letter-spacing: 0.2em;
    margin-bottom: 16px;
    text-transform: uppercase;
  }
  .tt-intro-line {
    font-size: ${fs(46)};
    line-height: 1.08;
    font-weight: 900;
    color: #fff;
    text-transform: uppercase;
    max-width: 920px;
  }
  .tt-kicker {
    margin-top: 20px;
    font-size: ${fs(22)};
    color: #94a3b8;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .tt-tag,
  .tt-intro-line,
  .tt-kicker,
  .tt-player-caption,
  .tt-detail-text,
  .tt-outro-sub {
    display: inline-block;
    padding: ${fs(8)} ${fs(14)};
    border-radius: ${fs(10)};
    background: rgba(2, 6, 23, 0.88);
  }
  .tt-hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
  }
  .tt-hero::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 58%;
    background: linear-gradient(to top, rgba(8, 10, 14, 0.96) 0%, rgba(8, 10, 14, 0.55) 42%, transparent 100%);
    pointer-events: none;
    z-index: 1;
  }
  .tt-bg-logos {
    position: absolute;
    left: 0;
    right: 0;
    top: 56px;
    height: 280px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0 4px;
    pointer-events: none;
    z-index: 0;
  }
  .tt-logo-side {
    width: min(42vw, 260px);
    height: min(42vw, 260px);
    object-fit: contain;
    opacity: 0.34;
    filter: blur(0.8px);
  }
  .tt-img-ph {
    background: rgba(255, 255, 255, 0.06);
    border: 1px dashed rgba(255, 255, 255, 0.12);
  }
  .tt-player-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 88px 8px 4px;
    z-index: 2;
    position: relative;
  }
  .tt-player {
    max-height: 52%;
    max-width: 82%;
    object-fit: contain;
    object-position: center bottom;
    border-radius: 0;
    box-shadow: none;
    filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.55));
  }
  .tt-ph-player {
    width: 280px;
    height: 360px;
    border-radius: 6px;
    background: linear-gradient(160deg, #2a3544, #1a222c);
  }
  .tt-headline-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    margin-top: auto;
    padding: 10px 0 120px;
    z-index: 3;
    position: relative;
  }
  .tt-line-box {
    display: inline-block;
    width: fit-content;
    max-width: 100%;
    background: ${TT_NEON};
    color: #0a0a0a;
    font-weight: 900;
    font-size: ${fs(44)};
    line-height: 1.12;
    padding: 16px 22px 18px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tt-player-caption {
    text-align: center;
    font-size: ${fs(30)};
    font-weight: 800;
    color: #cbd5e1;
    margin: 4px 0 10px;
    position: relative;
    z-index: 2;
  }
  .tt-bar-foot {
    margin-top: auto;
    position: relative;
    z-index: 3;
    background: #fff;
    color: #0f172a;
    font-size: ${fs(26)};
    font-weight: 800;
    letter-spacing: 0.1em;
    padding: 18px 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    text-transform: uppercase;
  }
  .tt-detail-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    margin-top: 88px;
    padding: 0 8px;
  }
  .tt-detail-text {
    font-size: ${fs(32)};
    line-height: 1.35;
    font-weight: 700;
    color: #e2e8f0;
    text-align: center;
    max-width: 920px;
    margin: 0 auto;
  }
  .tt-outro-bar {
    margin-top: auto;
    background: #fff;
    color: #0f172a;
    padding: 18px 22px;
    font-size: ${fs(26)};
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-align: center;
  }
  .tt-outro-sub {
    text-align: center;
    margin: 28px 12px 0;
    font-size: ${fs(52)};
    font-weight: 700;
    color: #cbd5e1;
    line-height: 1.3;
  }
  `;
}

function wrapTeamtalkNews(pageTitle: string, inner: string, w: number, h: number, data: Data = {}) {
  const transparent = Boolean(data.editorTransparentBackground);
  const url = data.editorBackgroundImageUrl as string | undefined;
  const hasBgImg = Boolean(url) && !transparent;
  const comp = editorCompositorImg(data);
  const layoutCss = teamtalkNewsLayoutCss(w, h);
  const chrome = `<div class="tt-badge" aria-hidden="true"><span class="tt-mark">TT</span></div>`;

  let bodyClass: string;
  let bodyInner: string;
  if (transparent) {
    bodyClass = "with-tt-transparent";
    bodyInner = `${editorMotionBackdropLayersHtml(data)}${comp}<div class="tt-foreground">${chrome}${inner}</div>`;
  } else if (hasBgImg) {
    bodyClass = "with-tt-backdrop";
    bodyInner = `<img class="editor-bg-image" src="${esc(url!)}" alt="" /><div class="editor-bg-dim" aria-hidden="true"></div>${comp}<div class="tt-foreground">${chrome}${inner}</div>`;
  } else {
    bodyClass = "tt-news";
    bodyInner = `${comp}<div class="tt-foreground">${chrome}${inner}</div>`;
  }

  const fontLinks = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700;900&display=swap" rel="stylesheet">`;
  return `<!DOCTYPE html><html${
    transparent ? ' class="with-tt-transparent"' : ""
  }><head><meta charset="utf-8"><title>${esc(
    pageTitle,
  )}</title>${fontLinks}<style>* { box-sizing: border-box; margin: 0; padding: 0; }${layoutCss}</style></head><body class="${bodyClass}">${bodyInner}</body></html>`;
}

const F1_PLACEHOLDER_IMAGE = "/grid/drivers/placeholder.svg";

function f1SanitizeHexColor(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s;
  return "#334155";
}

/** Pick light or dark time text for contrast on team colour bar */
function f1ContrastTextColor(hexRaw: string): string {
  const hex = hexRaw.replace(/^#/, "");
  if (hex.length !== 3 && hex.length !== 6) return "#ffffff";
  const expand = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.62 ? "#0f172a" : "#ffffff";
}

function f1ResolveDriverImage(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;
  if (s.startsWith("/")) return s;
  return `/grid/drivers/${s.replace(/^\.?\//, "")}`;
}

function f1FooterBrandLabel(raw: unknown): string {
  const brand = decodeHtmlEntities(String(raw ?? "PLANETF1.com")).trim() || "PLANETF1.com";
  if (/^planetf1\.com$/i.test(brand)) {
    return `PLANET<span class="f1-footer-accent">F1</span>.COM`;
  }
  return esc(brand);
}

function f1FooterBrandHtml(data: Data): string {
  const logoUrl = typeof data.logoUrl === "string" ? data.logoUrl.trim() : "";
  if (logoUrl) {
    return `<div class="f1-footer-logo"><img src="${esc(logoUrl)}" alt="PlanetF1" /></div>`;
  }
  return `<div class="f1-footer-logo">${f1FooterBrandLabel(data.footerBrand ?? "PLANETF1.com")}</div>`;
}

function f1GridLayoutCss(w: number, h: number): string {
  const fs = (n: number) => `${Math.round((n * h) / 1350)}px`;
  return `
  .f1-stage { position: relative; width: ${w}px; height: ${h}px; display: flex; flex-direction: column;
    font-family: "Bebas Neue", "Anton", Impact, sans-serif; color: #f8fafc; overflow: hidden; }
  .f1-bg { position: absolute; inset: 0; z-index: 0;
    background: linear-gradient(165deg, #0d1117 0%, #0a1628 48%, #070a0e 100%); }
  .f1-bg::after { content: ""; position: absolute; inset: 0; opacity: 0.07; pointer-events: none;
    background-image: repeating-linear-gradient(-36deg, transparent, transparent 9px, rgba(255,255,255,0.05) 9px, rgba(255,255,255,0.05) 10px); }
  .f1-fore { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;
    padding: ${fs(24)} ${fs(22)} ${fs(18)}; box-sizing: border-box; min-height: 0; }
  .f1-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${fs(12)}; }
  .f1-titles { text-align: center; flex: 1; }
  .f1-title { font-size: ${fs(86)}; line-height: 0.95; letter-spacing: ${fs(2)}; color: #b6ff00; text-transform: uppercase;
    text-shadow: 0 0 ${fs(24)} rgba(182,255,0,0.35); font-weight: 400; }
  .f1-sub { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(28)}; font-weight: 700; color: #e2e8f0;
    letter-spacing: ${fs(3)}; margin-top: ${fs(6)}; text-transform: uppercase; }
  .f1-page { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(22)}; color: rgba(248,250,252,0.55);
    align-self: flex-start; padding-top: ${fs(4)}; }
  .f1-board { flex: 1; display: flex; flex-direction: column; gap: 0; border: 1px solid rgba(255,255,255,0.2);
    border-radius: ${fs(4)}; overflow: hidden; min-height: 0; }
  .f1-row { display: flex; align-items: stretch; min-height: ${fs(72)};
    border-bottom: 1px solid rgba(255,255,255,0.12); background: rgba(15,23,42,0.35); }
  .f1-row:last-child { border-bottom: none; }
  .f1-row-podium { box-shadow: inset 0 0 ${fs(20)} rgba(182,255,0,0.12); }
  .f1-pos { width: ${fs(56)}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: #111827; border-right: 1px solid rgba(255,255,255,0.25);
    font-size: ${fs(34)}; font-weight: 700; color: #fff; font-family: "Roboto Condensed", sans-serif; }
  .f1-nameblk { flex: 1; display: flex; align-items: center; padding: 0 ${fs(10)}; min-width: 0;
    background: rgba(248,250,252,0.96); color: #0f172a; padding-left: ${fs(12)}; }
  .f1-name { font-size: ${fs(40)}; line-height: 1; letter-spacing: ${fs(1)}; font-weight: 700; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .f1-tag { margin-left: ${fs(8)}; font-family: "Roboto Condensed", sans-serif; font-size: ${fs(18)};
    color: #64748b; font-weight: 600; }
  .f1-photo { width: ${fs(76)}; flex-shrink: 0; position: relative; margin-left: ${fs(-12)}; z-index: 2; display: flex;
    align-items: flex-end; justify-content: center; }
  .f1-face { width: ${fs(88)}; height: ${fs(88)}; object-fit: cover; object-position: top center;
    border-radius: ${fs(4)}; filter: drop-shadow(0 ${fs(4)} ${fs(8)} rgba(0,0,0,0.45));
    border: 1px solid rgba(255,255,255,0.12); background: #0f172a; }
  .f1-timebar { width: 32%; min-width: ${fs(200)}; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;
    padding: 0 ${fs(14)}; position: relative; }
  .f1-time { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(36)}; font-weight: 800; font-style: italic;
    letter-spacing: ${fs(1)}; text-shadow: 0 ${fs(2)} ${fs(8)} rgba(0,0,0,0.25); }
  .f1-intro-center { flex: 1; display: flex; flex-direction: column; min-height: 0; align-items: stretch;
    text-align: center; padding: ${fs(40)} ${fs(24)}; box-sizing: border-box; }
  .f1-intro-hero { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
    width: 100%; min-height: 0; box-sizing: border-box; }
  .f1-intro-hero .f1-titles { width: 100%; max-width: 100%; flex-shrink: 0; }
  .f1-intro-mid { flex: 0 0 auto; display: flex; flex-direction: column; justify-content: flex-start; align-items: center;
    min-height: 0; width: 100%; box-sizing: border-box; }
  .f1-intro-sub { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(58)}; font-weight: 800; color: #f8fafc;
    letter-spacing: ${fs(5)}; margin: 0; text-transform: uppercase; text-align: center; line-height: 1.08;
    max-width: 96%; text-shadow: 0 ${fs(4)} ${fs(20)} rgba(0,0,0,0.35); }
  .f1-intro-line { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(30)}; color: #94a3b8;
    margin-top: ${fs(16)}; max-width: 92%; line-height: 1.35; flex-shrink: 0; align-self: center; }
  .f1-outro-stack { flex: 1; display: flex; flex-direction: column; min-height: 0; width: 100%; }
  .f1-outro-center { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
    text-align: center; padding: ${fs(32)} ${fs(24)}; min-height: 0; }
  .f1-outro-line { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(72)}; font-weight: 700; color: #f8fafc;
    line-height: 1.25; max-width: 92%; margin: 0 auto; padding: ${fs(28)} ${fs(36)};
    background: rgba(0, 0, 0, 0.72); border-radius: ${fs(12)}; box-shadow: 0 ${fs(8)} ${fs(32)} rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12); }
  .f1-title,
  .f1-sub,
  .f1-page,
  .f1-intro-sub,
  .f1-intro-line {
    display: inline-block;
    padding: ${fs(8)} ${fs(14)};
    border-radius: ${fs(10)};
    background: rgba(2, 6, 23, 0.88);
  }
  .f1-outro-line {
    background: rgba(2, 6, 23, 0.9);
  }
  .f1-footer {
    margin-top: auto;
    margin-left: -${fs(22)};
    margin-right: -${fs(22)};
    margin-bottom: -${fs(18)};
    min-height: ${fs(60)};
    padding: ${fs(14)} ${fs(22)} ${fs(16)};
    background: #000000;
    text-align: center;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid rgba(255, 255, 255, 0.18);
  }
  .f1-footer-logo {
    display: inline-block;
    font-family: "Roboto Condensed", sans-serif;
    font-size: ${fs(44)};
    font-weight: 800;
    letter-spacing: ${fs(5)};
    color: #ffffff;
    text-transform: uppercase;
    line-height: 1;
    text-shadow: 0 ${fs(1)} ${fs(5)} rgba(0, 0, 0, 0.75);
    -webkit-font-smoothing: antialiased;
  }
  .f1-footer-accent { color: #e10600; }
  .f1-footer-logo img {
    max-height: ${fs(48)};
    width: auto;
    display: inline-block;
    vertical-align: middle;
    filter: drop-shadow(0 ${fs(1)} ${fs(4)} rgba(0, 0, 0, 0.55));
  }
  .f1-outro-footer-bar {
    margin-top: auto;
    margin-left: -${fs(22)};
    margin-right: -${fs(22)};
    margin-bottom: -${fs(18)};
    min-height: ${fs(60)};
    padding: ${fs(14)} ${fs(22)} ${fs(16)};
    background: #000000;
    color: #ffffff;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid rgba(255, 255, 255, 0.18);
  }
  .f1-outro-footer-bar .f1-footer-logo {
    font-size: ${fs(44)};
    letter-spacing: ${fs(5)};
  }
  .f1-outro-footer-bar .f1-footer-logo img { max-height: ${fs(48)}; }
  .f1-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; color: #64748b;
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(26)}; padding: ${fs(24)}; padding-bottom: ${fs(48)}; }
  .f1-row.f1-row-results { min-height: ${fs(76)}; }
  .f1-board-results .f1-nameblk.f1-nameblk-stack {
    flex: 0 0 var(--f1-name-col, ${fs(280)});
    width: var(--f1-name-col, ${fs(280)});
    min-width: var(--f1-name-col, ${fs(280)});
    max-width: var(--f1-name-col, ${fs(280)});
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: ${fs(4)};
    padding-top: ${fs(6)};
    padding-bottom: ${fs(6)};
    overflow: hidden;
  }
  .f1-board-results .f1-row-results .f1-name {
    font-size: var(--f1-name-font, ${fs(36)});
    letter-spacing: ${fs(0.5)};
    overflow: visible;
    text-overflow: unset;
    white-space: nowrap;
    max-width: 100%;
  }
  .f1-board-results .f1-row-results .f1-team {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .f1-board-results .f1-row-results .f1-photo {
    flex: 0 0 var(--f1-photo-col, ${fs(58)});
    width: var(--f1-photo-col, ${fs(58)});
    margin-left: 0;
    overflow: hidden;
  }
  .f1-board-results .f1-row-results .f1-face {
    width: var(--f1-face-size, ${fs(66)});
    height: var(--f1-face-size, ${fs(66)});
  }
  .f1-board-results .f1-timebar.f1-timebar-results {
    flex: 0 0 var(--f1-time-col, ${fs(136)});
    width: var(--f1-time-col, ${fs(136)});
    min-width: var(--f1-time-col, ${fs(136)});
    max-width: var(--f1-time-col, ${fs(136)});
    padding: 0 ${fs(8)};
  }
  .f1-board-results .f1-row-results .f1-time { font-size: ${fs(30)}; letter-spacing: 0; }
  .f1-board-results .f1-hdr-driver {
    flex: 0 0 var(--f1-name-col, ${fs(280)});
    width: var(--f1-name-col, ${fs(280)});
    min-width: var(--f1-name-col, ${fs(280)});
  }
  .f1-board-results .f1-hdr-photo {
    flex: 0 0 var(--f1-photo-col, ${fs(58)});
    width: var(--f1-photo-col, ${fs(58)});
    margin-left: 0;
  }
  .f1-board-results .f1-hdr-time {
    flex: 0 0 var(--f1-time-col, ${fs(136)});
    width: var(--f1-time-col, ${fs(136)});
    min-width: var(--f1-time-col, ${fs(136)});
    max-width: var(--f1-time-col, ${fs(136)});
  }
  .f1-team { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(22)}; font-weight: 600;
    color: #64748b; text-transform: uppercase; letter-spacing: ${fs(1)}; line-height: 1.1; }
  .f1-pos.f1-pos-letter { font-size: ${fs(30)}; letter-spacing: ${fs(-1)}; }
  .f1-nameblk.f1-nameblk-stack { flex: 1 1 0; flex-direction: column; align-items: flex-start; justify-content: center;
    gap: ${fs(4)}; padding-top: ${fs(6)}; padding-bottom: ${fs(6)}; min-width: 0; }
  .f1-row-results .f1-name { font-size: ${fs(36)}; letter-spacing: ${fs(0.5)}; }
  .f1-stops { width: ${fs(52)}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: #0f172a; border-left: 1px solid rgba(255,255,255,0.18);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(26)}; font-weight: 700; color: #e2e8f0; }
  .f1-results-header { display: flex; align-items: stretch; min-height: ${fs(46)}; flex-shrink: 0;
    border-bottom: 2px solid rgba(182,255,0,0.4); background: rgba(15,23,42,0.92); }
  .f1-hdr-pos { width: ${fs(56)}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-right: 1px solid rgba(255,255,255,0.22);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(19)}; font-weight: 800; letter-spacing: ${fs(2)}; color: #b6ff00; text-transform: uppercase; }
  .f1-hdr-driver { flex: 1; display: flex; align-items: center; padding: 0 ${fs(10)}; padding-left: ${fs(12)}; min-width: 0;
    background: rgba(30,41,59,0.55);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(19)}; font-weight: 800; letter-spacing: ${fs(2)}; color: #b6ff00; text-transform: uppercase; }
  .f1-hdr-photo { width: ${fs(76)}; flex-shrink: 0; margin-left: ${fs(-6)}; background: rgba(30,41,59,0.55); }
  .f1-hdr-time { flex: 0 0 ${fs(168)}; width: ${fs(168)}; min-width: ${fs(132)}; max-width: ${fs(188)}; display: flex; align-items: center; justify-content: flex-end;
    padding: 0 ${fs(8)}; background: rgba(30,41,59,0.55); border-left: 1px solid rgba(255,255,255,0.12);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(19)}; font-weight: 800; letter-spacing: ${fs(1)}; color: #b6ff00; text-transform: uppercase; }
  .f1-hdr-stops { width: ${fs(52)}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: #111827; border-left: 1px solid rgba(255,255,255,0.2);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(19)}; font-weight: 800; letter-spacing: ${fs(2)}; color: #b6ff00; text-transform: uppercase; }
  .f1-fastest-panel { margin-top: ${fs(20)}; width: 100%; max-width: 96%; padding: ${fs(16)} ${fs(20)};
    background: rgba(0,0,0,0.55); border-radius: ${fs(10)}; border: 1px solid rgba(255,255,255,0.12);
    box-sizing: border-box; }
  .f1-fastest-title { font-family: "Bebas Neue", "Anton", Impact, sans-serif; font-size: ${fs(40)};
    letter-spacing: ${fs(3)}; color: #b6ff00; text-align: center; margin-bottom: ${fs(12)}; }
  .f1-fastest-row { display: flex; align-items: stretch; min-height: ${fs(72)}; border-radius: ${fs(4)};
    overflow: hidden; border: 1px solid rgba(255,255,255,0.15); }
  .f1-fastest-photo { width: ${fs(64)}; flex-shrink: 0; display: flex; align-items: flex-end; justify-content: center;
    background: rgba(15,23,42,0.5); }
  .f1-fastest-face { width: ${fs(76)}; height: ${fs(76)}; object-fit: cover; object-position: top center;
    border-radius: ${fs(4)}; border: 1px solid rgba(255,255,255,0.12); background: #0f172a; }
  .f1-fastest-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 ${fs(10)};
    background: rgba(248,250,252,0.96); color: #0f172a; min-width: 0; }
  .f1-fastest-name { font-size: ${fs(32)}; font-weight: 700; line-height: 1.05; letter-spacing: ${fs(1)};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .f1-fastest-team { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(20)}; font-weight: 600;
    color: #64748b; text-transform: uppercase; margin-top: ${fs(2)}; }
  .f1-fastest-timebar { flex: 0 0 ${fs(168)}; width: ${fs(168)}; min-width: ${fs(132)}; max-width: ${fs(188)}; display: flex; align-items: center; justify-content: flex-end;
    padding: 0 ${fs(8)}; }
  .f1-fastest-time { font-family: "Roboto Condensed", sans-serif; font-size: ${fs(28)}; font-weight: 800; font-style: italic; }
  .f1-fastest-stops { width: ${fs(48)}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: #0f172a; border-left: 1px solid rgba(255,255,255,0.15);
    font-family: "Roboto Condensed", sans-serif; font-size: ${fs(24)}; font-weight: 700; color: #e2e8f0; }
  `;
}

function f1GridBoardRows(data: Data): string {
  const drivers = (Array.isArray(data.gridDrivers) ? data.gridDrivers : []) as {
    position?: number;
    name?: string;
    time?: string;
    teamColor?: string;
    image?: string;
    tag?: string;
  }[];
  const highlight = Boolean(data.highlightTop3);
  if (drivers.length === 0) {
    return `<div class="f1-empty">No drivers on this page — add rows in the editor.</div>`;
  }
  return drivers
    .map((d, idx) => {
      const pos = typeof d.position === "number" ? d.position : idx + 1;
      const name = esc((d.name ?? "").toUpperCase() || "DRIVER");
      const time = esc(d.time ?? "—");
      const colRaw = f1SanitizeHexColor(d.teamColor);
      const col = esc(colRaw);
      const timeFg = esc(f1ContrastTextColor(colRaw));
      const tagRaw = typeof d.tag === "string" ? d.tag.trim() : "";
      const tag = tagRaw ? `<span class="f1-tag">${esc(tagRaw)}</span>` : "";
      const imgU = f1ResolveDriverImage(d.image);
      const src = imgU || F1_PLACEHOLDER_IMAGE;
      const face = `<img class="f1-face" src="${esc(src)}" alt="" />`;
      const podium = highlight && idx < 3 ? " f1-row-podium" : "";
      return `<div class="f1-row${podium}">
        <div class="f1-pos">${esc(pos)}</div>
        <div class="f1-nameblk"><span class="f1-name">${name}</span>${tag}</div>
        <div class="f1-photo">${face}</div>
        <div class="f1-timebar" style="background:${col};">
          <span class="f1-time" style="color:${timeFg};">${time}</span>
        </div>
      </div>`;
    })
    .join("");
}

function f1ResultsBoardRows(data: Data, w: number, h: number): { html: string; boardStyle: string } {
  const drivers = (Array.isArray(data.resultDrivers) ? data.resultDrivers : []) as {
    position?: number;
    positionLabel?: string;
    name?: string;
    team?: string;
    time?: string;
    teamColor?: string;
    image?: string;
    stops?: string | number;
  }[];
  const highlight = Boolean(data.highlightTop3);
  const layout = computeF1ResultsLayout(
    w,
    h,
    drivers.map((d) => String(d.name ?? "")),
  );
  if (drivers.length === 0) {
    return {
      boardStyle: layout.boardStyle,
      html: `<div class="f1-empty">No drivers on this page — add rows in the editor.</div>`,
    };
  }
  const headerRow = `<div class="f1-results-header" role="row">
    <div class="f1-hdr-pos">POS</div>
    <div class="f1-hdr-driver">DRIVER</div>
    <div class="f1-hdr-photo" aria-hidden="true"></div>
    <div class="f1-hdr-time">TIME</div>
    <div class="f1-hdr-stops">STOPS</div>
  </div>`;
  const rows = drivers
    .map((d, idx) => {
      const posNum = typeof d.position === "number" ? d.position : idx + 1;
      const labelRaw = typeof d.positionLabel === "string" ? d.positionLabel.trim() : "";
      const posDisplay = labelRaw ? esc(labelRaw) : esc(posNum);
      const posClass = labelRaw ? "f1-pos f1-pos-letter" : "f1-pos";
      const name = esc(displayF1ResultsDriverName(String(d.name ?? "DRIVER"), layout));
      const team = esc((d.team ?? "").trim() || "");
      const time = esc(d.time ?? "—");
      const stops = esc(String(d.stops ?? "—"));
      const colRaw = f1SanitizeHexColor(d.teamColor);
      const col = esc(colRaw);
      const timeFg = esc(f1ContrastTextColor(colRaw));
      const imgU = f1ResolveDriverImage(d.image);
      const src = imgU || F1_PLACEHOLDER_IMAGE;
      const face = `<img class="f1-face" src="${esc(src)}" alt="" />`;
      const podium = highlight && idx < 3 ? " f1-row-podium" : "";
      return `<div class="f1-row f1-row-results${podium}">
        <div class="${posClass}">${posDisplay}</div>
        <div class="f1-nameblk f1-nameblk-stack">
          <span class="f1-name">${name}</span>
          ${team ? `<span class="f1-team">${team}</span>` : ""}
        </div>
        <div class="f1-photo">${face}</div>
        <div class="f1-timebar f1-timebar-results" style="background:${col};">
          <span class="f1-time" style="color:${timeFg};">${time}</span>
        </div>
        <div class="f1-stops">${stops}</div>
      </div>`;
    })
    .join("");
  return { html: headerRow + rows, boardStyle: layout.boardStyle };
}

function f1FastestLapHtml(data: Data): string {
  const fl = data.fastestLap as
    | {
        driverName?: string;
        team?: string;
        time?: string;
        stops?: string | number;
        teamColor?: string;
        image?: string;
      }
    | undefined;
  if (!fl || typeof fl !== "object") return "";
  const name = esc((fl.driverName ?? "").trim() || "—");
  const team = esc((fl.team ?? "").trim() || "");
  const time = esc(fl.time ?? "—");
  const stops = esc(String(fl.stops ?? "—"));
  const colRaw = f1SanitizeHexColor(fl.teamColor);
  const col = esc(colRaw);
  const timeFg = esc(f1ContrastTextColor(colRaw));
  const imgU = f1ResolveDriverImage(fl.image);
  const src = imgU || F1_PLACEHOLDER_IMAGE;
  const face = `<img class="f1-fastest-face" src="${esc(src)}" alt="" />`;
  return `<div class="f1-fastest-panel">
    <p class="f1-fastest-title">FASTEST LAP</p>
    <div class="f1-fastest-row">
      <div class="f1-fastest-photo">${face}</div>
      <div class="f1-fastest-mid">
        <span class="f1-fastest-name">${name}</span>
        ${team ? `<span class="f1-fastest-team">${team}</span>` : ""}
      </div>
      <div class="f1-fastest-timebar" style="background:${col};">
        <span class="f1-fastest-time" style="color:${timeFg};">${time}</span>
      </div>
      <div class="f1-fastest-stops">${stops}</div>
    </div>
  </div>`;
}

function wrapF1Grid(pageTitle: string, inner: string, w: number, h: number, data: Data = {}) {
  const transparent = Boolean(data.editorTransparentBackground);
  const url = data.editorBackgroundImageUrl as string | undefined;
  const hasBgImg = Boolean(url) && !transparent;
  const comp = editorCompositorImg(data);
  const layoutCss = f1GridLayoutCss(w, h);
  const fontLinks = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Roboto+Condensed:ital,wght@0,600;0,700;1,700&display=swap" rel="stylesheet">`;

  let bodyClass: string;
  let bodyInner: string;
  if (transparent) {
    bodyClass = "f1-transparent";
    bodyInner = `${editorMotionBackdropLayersHtml(data)}${comp}<div class="f1-stage" style="background:transparent;position:relative;z-index:3"><div class="f1-fore">${inner}</div></div>`;
  } else if (hasBgImg) {
    bodyClass = "with-editor-backdrop";
    bodyInner = `<img class="editor-bg-image" src="${esc(url!)}" alt="" /><div class="editor-bg-dim" aria-hidden="true"></div>${comp}<div class="f1-stage" style="background:transparent;position:relative;z-index:3"><div class="f1-fore">${inner}</div></div>`;
  } else {
    bodyClass = "";
    bodyInner = `${comp}<div class="f1-stage"><div class="f1-bg" aria-hidden="true"></div><div class="f1-fore">${inner}</div></div>`;
  }

  const backdropBlock =
    hasBgImg || transparent
      ? `${transparent ? `html,body{background:transparent!important;}` : ""}
         body.with-editor-backdrop { margin:0;padding:0;position:relative;width:${w}px;height:${h}px;overflow:hidden; }
         body.with-editor-backdrop .editor-bg-image { position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;z-index:0; }
         body.with-editor-backdrop .editor-bg-dim { position:absolute;inset:0;background:rgba(8,12,20,0.72);z-index:1;pointer-events:none; }
         body.with-editor-backdrop .editor-compositor-layer { position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;z-index:2;pointer-events:none; }
         body.f1-transparent .editor-compositor-layer { position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;z-index:2;pointer-events:none; }`
      : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(pageTitle)}</title>${fontLinks}<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ${backdropBlock}
    ${layoutCss}
  </style></head><body class="${bodyClass}">${bodyInner}</body></html>`;
}

function renderNewsShortSlide(templateId: string, data: Data, w: number, h: number): string {
  const sourceHost = String(data.sourceName ?? "").toLowerCase().replace(/^www\./, "");
  const brandId = String(data.brandTemplateId ?? (sourceHost === "football365.com" ? "football365" : sourceHost === "teamtalk.com" ? "teamtalk" : ""));
  const brandLogo = newsShortBrandLogoSvg(brandId);
  const hfRaw = typeof data.headlineFont === "string" ? data.headlineFont.trim() : "";
  const headlineFontPick: NewsShortHeadlineFontId = hfRaw === "bebas-neue" ? "bebas-neue" : "roboto-condensed";
  const fontBundle = resolveNewsShortFontBundle(headlineFontPick);
  const headlineFontWeight = headlineFontPick === "bebas-neue" ? 400 : 900;
  const highlightSpanWeight = headlineFontPick === "bebas-neue" ? 700 : 900;
  const hideLabel = data.hideLabel === true;
  const labelRaw = decodeHtmlEntities(String(data.label ?? "").trim());
  let labelForKicker = labelRaw;
  if (!labelForKicker) {
    if (templateId === "news-short-outro") labelForKicker = "READ MORE";
    else if (templateId === "news-short-intro") labelForKicker = "TOP STORY";
  }
  const label = esc(labelForKicker);
  const source = esc(decodeHtmlEntities(String(data.sourceName ?? "PlanetF1.com")));
  const heroImage = typeof data.heroImage === "string" ? data.heroImage.trim() : "";
  const overlayOpacity = Number(data.overlayOpacity ?? 0.56);
  const safeOverlay = Number.isFinite(overlayOpacity) ? Math.max(0.15, Math.min(0.9, overlayOpacity)) : 0.56;
  const panelColor = esc(data.panelColor ?? "#0f172a");
  const highlightColorRaw = String(data.highlightColor ?? "#b7ff1a").trim();
  const panelTextRaw = String(data.panelTextColor ?? "").trim();
  const panelTextColor = esc(panelTextRaw || "#ffffff");
  const footerBgRaw = String(data.panelFooterBg ?? "").trim();
  const footerTextRaw = String(data.panelFooterTextColor ?? "").trim();
  const footerBgCss = esc(footerBgRaw || "rgba(2, 6, 23, 0.95)");
  const footerSourceColorCss = esc(footerTextRaw || "#e2e8f0");
  const footerMetaColorCss = esc(footerTextRaw || "#93c5fd");
  const topAccentFrom = esc(String(data.topAccentFrom ?? "").trim() || "#8fd900");
  const topAccentTo = esc(String(data.topAccentTo ?? "").trim() || "#c8ff2f");
  const fontSize = Math.max(32, Math.min(120, Number(data.fontSize ?? 64)));
  const creativeFmt = normalizeCreativeVideoFormat(
    typeof data.creativeVideoFormat === "string" ? data.creativeVideoFormat : undefined,
  );
  const creativePreset = String(data.creativeLayoutPreset ?? "").trim();
  const layoutExtraCss = newsShortCreativeLayoutCss(
    creativeFmt,
    creativePreset,
    fontSize,
    NEWS_SHORT_FOOTER_SAFE_PX,
  );
  const lineHeight = Math.max(0.9, Math.min(1.45, Number(data.lineHeight ?? 1.06)));
  const textBoxWidth = Math.max(56, Math.min(94, Number(data.textBoxWidthPct ?? 84)));
  const zoom = Math.max(1, Math.min(1.2, Number(data.backgroundZoom ?? 1.05)));
  const backgroundAnimation =
    typeof data.backgroundAnimation === "string" ? data.backgroundAnimation.trim() : "zoom-in";
  const bgAnimationCss =
    backgroundAnimation === "none"
      ? "none"
      : backgroundAnimation === "pan-left"
        ? "ns-pan-left 8s ease-in-out infinite alternate"
        : backgroundAnimation === "pan-right"
          ? "ns-pan-right 8s ease-in-out infinite alternate"
          : backgroundAnimation === "float"
            ? "ns-float 7s ease-in-out infinite alternate"
            : "ns-zoom-in 8s ease-in-out infinite forwards";
  const subtitleOverlayOnly = data.editorSubtitleOverlayOnly === true;
  const highlightWords = Array.isArray(data.highlightWords)
    ? (data.highlightWords as unknown[]).map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
  const highlightSet = new Set(highlightWords.map((w) => w.toLowerCase()));

  /** Panel text + highlight colour per word (decoded, escaped tokens). */
  const panelWordSpans = (raw: string, uppercase: boolean): string => {
    const decoded = decodeHtmlEntities(String(raw ?? "")).trim();
    if (!decoded) return "";
    const body = uppercase ? decoded.toUpperCase() : decoded;
    return body
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const bare = token.replace(/[^\w-]/g, "").toLowerCase();
        const safe = esc(token);
        return highlightSet.has(bare)
          ? `<span style="color:${esc(highlightColorRaw)};font-weight:${highlightSpanWeight};">${safe}</span>`
          : `<span style="color:${panelTextColor};font-weight:${headlineFontWeight};">${safe}</span>`;
      })
      .join(" ");
  };

  const highlightedHeadline = subtitleOverlayOnly ? "" : panelWordSpans(String(data.headline ?? ""), true);
  const highlightedSubline =
    subtitleOverlayOnly || !decodeHtmlEntities(String(data.subline ?? "")).trim()
      ? ""
      : panelWordSpans(String(data.subline ?? ""), true);

  /** With ASS burn, headline/subline are omitted — hide kicker too so outro does not show READ MORE / TOP STORY on the PNG. */
  const showKicker = !subtitleOverlayOnly && !hideLabel && Boolean(labelForKicker);

  /** When true, PNG alpha must stay clear so FFmpeg can composite motion video behind UI chrome + panel. */
  const transparentBg = Boolean(data.editorTransparentBackground);
  const bodyBg = transparentBg ? "transparent" : "#020617";
  const dimStrength = clampMotionBackdropDimStrength(data.motionBackdropDimStrength ?? 0.45);
  const opaqueStrength = clampMotionBackdropOpaqueOpacity(data.motionBackdropOpaqueOpacity ?? 0.3);
  const tightLine = newsShortMotionTightLineHeight(lineHeight);
  const panelBgCss = transparentBg ? newsShortMotionPanelGradient(dimStrength) : panelColor;
  const panelBorderCss = transparentBg ? newsShortMotionPanelBorder() : "1px solid rgba(148,163,184,0.25)";

  const backgroundLayer =
    transparentBg
      ? ""
      : heroImage
        ? `<img class="ns-bg" src="${esc(heroImage)}" alt="" />`
        : `<div class="ns-bg-fallback"></div>`;
  /** Uniform black wash, then gradient over motion (PNG alpha). */
  const motionOpaqueLayer = transparentBg
    ? `<div class="ns-motion-opaque" aria-hidden="true"></div>`
    : "";
  const motionDimLayer = transparentBg
    ? `<div class="ns-motion-dim" aria-hidden="true"></div>`
    : "";
  const overlayLayer = transparentBg ? "" : `<div class="ns-overlay"></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(templateId)}</title>
  <link rel="stylesheet" href="${esc(fontBundle.googleFontsHref)}" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      background: ${bodyBg};
      color: #fff;
      font-family: ${fontBundle.cssFontFamily};
    }
    .ns-root { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .ns-bg {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transform: scale(${zoom.toFixed(3)}); transform-origin: 50% 45%;
      animation: ${bgAnimationCss};
      will-change: transform;
    }
    .ns-bg-fallback { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 12%, #122145 0%, #09122a 52%, #020617 100%); }
    @keyframes ns-zoom-in {
      from { transform: scale(${Math.max(1, zoom - 0.04).toFixed(3)}); }
      to { transform: scale(${zoom.toFixed(3)}); }
    }
    @keyframes ns-pan-left {
      from { transform: scale(${zoom.toFixed(3)}) translateX(2%); }
      to { transform: scale(${zoom.toFixed(3)}) translateX(-2%); }
    }
    @keyframes ns-pan-right {
      from { transform: scale(${zoom.toFixed(3)}) translateX(-2%); }
      to { transform: scale(${zoom.toFixed(3)}) translateX(2%); }
    }
    @keyframes ns-float {
      from { transform: scale(${zoom.toFixed(3)}) translateY(1.5%); }
      to { transform: scale(${zoom.toFixed(3)}) translateY(-1.5%); }
    }
    .ns-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, ${safeOverlay.toFixed(3)}); }
    .ns-motion-opaque {
      position: absolute; inset: 0; z-index: 1; pointer-events: none;
      background: rgba(0,0,0,${opaqueStrength.toFixed(3)});
    }
    .ns-motion-dim {
      position: absolute; inset: 0; z-index: 2; pointer-events: none;
      background: ${newsShortMotionFullFrameGradient(dimStrength)};
    }
    .ns-top-line { position: absolute; top: 0; left: 0; right: 0; height: 10px; background: linear-gradient(90deg, ${topAccentFrom}, ${topAccentTo}); z-index: 3; }
    .ns-brand-logo { ${NEWS_SHORT_BRAND_LOGO_CSS} }
    .ns-brand-logo svg { display:block; width:100%; height:auto; }
    .ns-quote-mark { position: absolute; top: ${Math.round(h * 0.09)}px; left: 50%; transform: translateX(-50%); z-index: 4; color: rgba(255,255,255,0.42); font-size: ${Math.round(fontSize * 0.95)}px; font-weight: 900; line-height: 1; }
    .ns-footer-bar { --ns-footer-h: ${NEWS_SHORT_FOOTER_SAFE_PX}px; }
    .ns-panel-wrap {
      position: absolute;
      left: 0;
      right: 0;
      bottom: var(--ns-footer-h, ${NEWS_SHORT_FOOTER_SAFE_PX}px);
      padding: 0;
      z-index: 5;
    }
    .ns-panel {
      width: 100%;
      max-width: 100%;
      min-height: 240px;
      background: ${panelBgCss};
      border: ${panelBorderCss};
      border-bottom: none;
      border-radius: 16px 16px 0 0;
      padding: 28px 28px 22px;
      box-shadow: 0 24px 56px rgba(0,0,0,0.55);
    }
    .ns-panel-inner {
      max-width: ${textBoxWidth}%;
      margin: 0 auto;
      ${transparentBg ? "text-align: center;" : ""}
    }
    .ns-label { font-size: ${fontSize}px; letter-spacing: 0.18em; text-transform: uppercase; color: ${panelTextColor}; font-weight: 800; margin-bottom: 12px; line-height: ${transparentBg ? tightLine : lineHeight}; }
    .ns-headline { font-size: ${fontSize}px; line-height: ${transparentBg ? tightLine : lineHeight}; text-transform: uppercase; font-weight: ${headlineFontWeight}; color: ${panelTextColor}; word-break: break-word; overflow-wrap: anywhere; letter-spacing: ${transparentBg ? NEWS_SHORT_MOTION_LETTER_SPACING : "0.02em"}; }
    .ns-subline { margin-top: 12px; font-size: ${fontSize}px; line-height: ${transparentBg ? tightLine : lineHeight}; font-weight: 700; max-width: 100%; letter-spacing: ${transparentBg ? NEWS_SHORT_MOTION_LETTER_SPACING : "0.02em"}; color: ${panelTextColor}; }
    .ns-footer {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      z-index: 6;
      height: ${NEWS_SHORT_FOOTER_SAFE_PX}px;
      min-height: ${NEWS_SHORT_FOOTER_SAFE_PX}px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 26px;
      background: ${footerBgCss};
      border-top: 1px solid rgba(148,163,184,0.22);
      color: ${footerMetaColorCss};
      font-size: 36px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 800;
    }
    .ns-source { color: ${footerSourceColorCss}; font-size: 32px; letter-spacing: 0.06em; text-transform: none; font-weight: 700; }
    ${layoutExtraCss}
  </style>
  </head><body>
    <div class="ns-root ns-creative-${creativeFmt.replace(/_/g, "-")}">
      ${backgroundLayer}
      ${motionOpaqueLayer}
      ${motionDimLayer}
      ${overlayLayer}
      <div class="ns-top-line"></div>
      ${brandLogo ? `<div class="ns-brand-logo">${brandLogo}</div>` : ""}
      <div class="ns-quote-mark">“</div>
      <div class="ns-panel-wrap ns-footer-bar">
        <div class="ns-panel">
          <div class="ns-panel-inner">
            ${showKicker ? `<p class="ns-label">${label}</p>` : ""}
            ${subtitleOverlayOnly ? "" : `<h1 class="ns-headline">${highlightedHeadline}</h1>`}
            ${highlightedSubline ? `<p class="ns-subline">${highlightedSubline}</p>` : ""}
          </div>
        </div>
      </div>
      <div class="ns-footer">
        <span class="ns-source">${source}</span>
      </div>
    </div>
  </body></html>`;
}

/** Planet Rugby standings — broadcast title (two lines, uppercase). */
function planetRugbyBroadcastTitleLines(data: Data): { line1: string; line2: string } {
  const comp = String(data.competition ?? "Standings")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const mode = String(data.mode ?? "full-table");
  const isPlanetFootball = String(data.brand ?? "") === "planet-football";
  const tableStyle = String(data.tableStyle ?? "");
  if (isPlanetFootball && tableStyle === "top-five") return { line1: comp, line2: "TOP 5" };
  if (isPlanetFootball && tableStyle === "bottom-four") return { line1: comp, line2: "BOTTOM 4" };
  const pr = Number(data.playoffRows ?? 4);
  const playoffN = pr === 6 ? 6 : pr === 8 ? 8 : 4;
  const br = Number(data.bottomRows ?? 4) === 6 ? 6 : 4;
  const map: Record<string, string> = {
    "full-table": "LATEST TABLE",
    "top-half": "TOP HALF",
    "bottom-half": "BOTTOM HALF",
    "playoff-race": `TOP ${playoffN}`,
    "bottom-battle": `BOTTOM ${br}`,
    "head-to-head": "HEAD TO HEAD",
  };
  return { line1: comp, line2: map[mode] ?? "LATEST TABLE" };
}

function planetRugbyBroadcastGridTemplate(visibleColumns: ReadonlyArray<{ key: string }>, canvasW: number): string {
  const s = canvasW / 1080;
  const px = (n: number) => `${Math.max(44, Math.round(n * s))}px`;
  return visibleColumns
    .map((c) => {
      if (c.key === "position") return px(70);
      if (c.key === "team") return "minmax(0,1fr)";
      if (c.key === "played" || c.key === "won" || c.key === "drawn" || c.key === "lost") return px(70);
      if (c.key === "pointsDifference") return px(90);
      if (c.key === "points") return px(82);
      return "minmax(44px,1fr)";
    })
    .join(" ");
}

function sport365LogoSvg(className: string): string {
  return `<svg class="${className}" viewBox="0 0 220 48" role="img" aria-label="Sport365">
    <text x="0" y="34" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="28" font-weight="900" fill="#FFFFFF">SPORT</text>
    <text x="108" y="34" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="28" font-weight="900" fill="#BD33B5">365</text>
  </svg>`;
}

function renderLeagueTableCardTemplate(data: Data, w: number, h: number): string {
  const leagueBrand = resolveLeagueBrandFromSceneData(data);
  const brand = leagueTableBrandToken(leagueBrand);
  const pfSurfaceForCard = planetFootballSurfaceTokens(normalizePlanetFootballDisplayBrand(data.brand));
  const isSport365 = leagueBrand === "sport365";
  const modeRaw = String(data.mode ?? "full").trim();
  const mode: LeagueTableMode =
    modeRaw === "top-half" ||
    modeRaw === "bottom-half" ||
    modeRaw === "head-to-head" ||
    modeRaw === "custom"
      ? modeRaw
      : "full";
  const rows: LeagueRow[] = (Array.isArray(data.rows) ? data.rows : [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        position: Number(r.position ?? 0),
        team: String(r.team ?? "").trim(),
        badge: typeof r.logoUrl === "string" ? r.logoUrl.trim() : "",
        played: Number(r.played ?? 0),
        won: Number(r.won ?? 0),
        drawn: Number(r.drawn ?? 0),
        lost: Number(r.lost ?? 0),
        goalDifference: Number(String(r.pointsDifference ?? "0").replace(/[^\d-]/g, "")) || 0,
        points: Number(r.points ?? 0),
      };
    })
    .filter((row) => row.position > 0 && row.team);
  const modeRows = leagueTableRowsForMode(rows, mode);
  const visibleRows = leagueTablePageRows(modeRows, Number(data.tablePageIndex ?? 0), 20);
  const ultraCompact = visibleRows.length > 15;
  const compact = visibleRows.length > 10;
  const fontScale = Math.max(0.75, Math.min(1.4, Number(data.fontSize ?? 1)));
  const rowScale = Math.max(0.8, Math.min(1.6, Number(data.rowSpacing ?? 1)));
  const rowH = Math.round((ultraCompact ? 42 : compact ? 62 : 74) * rowScale);
  const badgePx = Math.round((ultraCompact ? 26 : compact ? 34 : 40) * Math.min(1.15, fontScale));
  const brandHighlight = String(data.highlightMode ?? "leader") === "brand";
  const configuredHighlight =
    typeof data.highlightColor === "string" && data.highlightColor.trim() ? data.highlightColor.trim() : "";
  const highlightColor = brandHighlight ? brand.primary : configuredHighlight || LEAGUE_TABLE_CARD_TOKENS.leaderHighlight.border;
  const highlightBg = brandHighlight
    ? hexToRgba(brand.primary, 0.14)
    : LEAGUE_TABLE_CARD_TOKENS.leaderHighlight.background;
  const highlightGlow = brandHighlight
    ? hexToRgba(brand.primary, 0.35)
    : LEAGUE_TABLE_CARD_TOKENS.leaderHighlight.glow;
  const highlightedTeam = typeof data.highlightedTeam === "string" ? data.highlightedTeam.trim().toLowerCase() : "";
  const selectedTeamA = typeof data.selectedTeamA === "string" ? data.selectedTeamA.trim().toLowerCase() : "";
  const selectedTeamB = typeof data.selectedTeamB === "string" ? data.selectedTeamB.trim().toLowerCase() : "";
  const backgroundImageUrl =
    typeof data.backgroundImageUrl === "string" && data.backgroundImageUrl.trim()
      ? data.backgroundImageUrl.trim()
      : typeof data.editorBackgroundImageUrl === "string" && data.editorBackgroundImageUrl.trim()
        ? data.editorBackgroundImageUrl.trim()
        : "";
  const transparentBg = Boolean(data.editorTransparentBackground);
  const staticPng = Boolean(data.r365StaticPng);
  const bg = backgroundImageUrl ? esc(backgroundImageUrl) : "";
  const overlay = transparentBg ? "rgba(0,0,0,0)" : LEAGUE_TABLE_CARD_TOKENS.backgroundOverlay;
  const overlayStrength = Math.max(0.2, Math.min(0.9, Number(data.overlayStrength ?? 0.55)));
  const blur = Math.max(0, Math.min(20, Number(data.backgroundBlur ?? 0)));
  const rawPanelOpacity = Number(data.tablePanelOpacity ?? (isSport365 ? 0.82 : 0.84));
  let tableOpacity = Math.max(0.15, Math.min(0.95, rawPanelOpacity));
  if (isSport365) {
    const floor = transparentBg ? 0.9 : 0.82;
    tableOpacity = Math.max(tableOpacity, floor);
  }
  const cardPlateOpacity = transparentBg ? 0.94 : Math.min(0.92, tableOpacity + 0.08);
  const rowBg = isSport365
    ? `rgba(52,14,48,${(0.42 + tableOpacity * 0.18).toFixed(3)})`
    : `rgba(255,255,255,${(0.06 + tableOpacity * 0.1).toFixed(3)})`;
  const tableWidthPercent = Math.max(45, Math.min(100, Number(data.tableWidthPercent ?? 90)));
  const tableHeightPercent = Math.max(28, Math.min(88, Number(data.tableHeightPercent ?? 72)));
  const cardWidth = Math.round(w * (tableWidthPercent / 100));
  const cardMaxHeight = Math.round(h * (tableHeightPercent / 100));
  const showTeamLogos = data.showTeamLogos !== false;
  const motionBackdropLayers = editorMotionBackdropLayersHtml(data);
  const pos = String(data.tablePosition ?? "lower-left");
  const targetY = (() => {
    if (pos === "high-left" || pos === "high-right") return 720;
    if (pos === "middle-left" || pos === "middle-right" || pos === "left" || pos === "center") return 900;
    if (pos === "bottom-left" || pos === "bottom-right") return 1060;
    return LEAGUE_TABLE_CARD_TOKENS.targetTableCenterY;
  })();
  const tableCenterY = Math.min(
    h - LEAGUE_TABLE_CARD_TOKENS.safeBottomPx - 120,
    Math.max(LEAGUE_TABLE_CARD_TOKENS.safeTopPx + 240, Math.round(targetY * (h / 1920))),
  );
  const allColumnDefs = [
    { key: "position", label: "#", weight: 8 },
    { key: "team", label: "TEAM", weight: 42 },
    { key: "played", label: "P", weight: 8 },
    { key: "won", label: "W", weight: 8 },
    { key: "drawn", label: "D", weight: 8 },
    { key: "lost", label: "L", weight: 8 },
    { key: "pointsDifference", label: "GD", weight: 9 },
    { key: "points", label: "PTS", weight: 9 },
  ] as const;
  const visibleColumnKeys = Array.isArray(data.visibleColumns)
    ? (data.visibleColumns as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const visibleColumnDefs =
    visibleColumnKeys.length > 0
      ? allColumnDefs.filter((column) => visibleColumnKeys.includes(column.key))
      : allColumnDefs;
  const safeColumnDefs = visibleColumnDefs.length > 0 ? visibleColumnDefs : allColumnDefs;
  const columnTemplate = safeColumnDefs
    .map((column) => (column.key === "team" ? `minmax(0,${column.weight}fr)` : `${column.weight}fr`))
    .join(" ");
  const footerText = typeof data.footerText === "string" ? data.footerText.trim() : "";
  const explicitTitle = typeof data.competitionTitle === "string" ? data.competitionTitle.trim() : "";
  const headline = typeof data.headline === "string" ? data.headline.trim() : "";
  const title = explicitTitle || (headline && !/^latest table$/i.test(headline) ? headline : "");
  const showBrandLogo = data.showLogo !== false;
  const logoScale = Math.max(1, Math.min(3, Number(data.brandLogoScale ?? (isSport365 ? 1.85 : 1))));
  const logoW = Math.round(112 * logoScale);
  const logoH = Math.round(48 * logoScale);
  const showStandingsTable = data.showStandingsTable !== false;
  const matchRaw = data.matchContext as Record<string, unknown> | undefined;
  const matchHome = typeof matchRaw?.homeTeam === "string" ? matchRaw.homeTeam.trim() : "";
  const matchAway = typeof matchRaw?.awayTeam === "string" ? matchRaw.awayTeam.trim() : "";
  const matchHomeScore = Number(matchRaw?.homeScore ?? NaN);
  const matchAwayScore = Number(matchRaw?.awayScore ?? NaN);
  const hasMatch = Boolean(matchHome && matchAway && Number.isFinite(matchHomeScore) && Number.isFinite(matchAwayScore));
  const showMatchScore = hasMatch && data.showMatchScore !== false;
  const showMatchScorers = hasMatch && data.showMatchScorers !== false;
  const matchStatusLabel =
    typeof matchRaw?.statusLabel === "string" && matchRaw.statusLabel.trim()
      ? matchRaw.statusLabel.trim()
      : typeof matchRaw?.status === "string" && matchRaw.status.trim()
        ? matchRaw.status.trim()
        : "";
  const homeLogoUrl = typeof matchRaw?.homeLogoUrl === "string" ? matchRaw.homeLogoUrl.trim() : "";
  const awayLogoUrl = typeof matchRaw?.awayLogoUrl === "string" ? matchRaw.awayLogoUrl.trim() : "";
  const scorers = sanitizeSport365Scorers(
    (Array.isArray(matchRaw?.scorers) ? matchRaw.scorers : []) as Sport365MatchScorer[],
  );
  const scoreHtml = showMatchScore
    ? `<div class="lt-score">
        <div class="lt-score-teams">
          <div class="lt-score-side">
            ${homeLogoUrl ? `<img class="lt-score-crest" src="${esc(homeLogoUrl)}" alt="" />` : `<span class="lt-score-crest-fallback">${esc(matchHome.slice(0, 3).toUpperCase())}</span>`}
            <span class="lt-score-team">${esc(matchHome)}</span>
          </div>
          <span class="lt-score-line">${matchHomeScore}<span class="lt-score-sep">:</span>${matchAwayScore}</span>
          <div class="lt-score-side lt-score-side--away">
            <span class="lt-score-team">${esc(matchAway)}</span>
            ${awayLogoUrl ? `<img class="lt-score-crest" src="${esc(awayLogoUrl)}" alt="" />` : `<span class="lt-score-crest-fallback">${esc(matchAway.slice(0, 3).toUpperCase())}</span>`}
          </div>
        </div>
        ${matchStatusLabel ? `<div class="lt-score-status">${esc(matchStatusLabel)}</div>` : ""}
      </div>`
    : "";
  const scorersHtml =
    showMatchScorers && scorers.length > 0
      ? `<div class="lt-scorers">${scorers
          .map((row) => {
            const r = row as Record<string, unknown>;
            const player = typeof r.player === "string" ? r.player.trim() : "";
            const minuteLabel = typeof r.minuteLabel === "string" ? r.minuteLabel.trim() : "";
            const team = typeof r.team === "string" ? r.team.trim() : "";
            const isOg = r.type === "own_goal";
            if (!player) return "";
            return `<div class="lt-scorer"><span class="lt-scorer-minute">${esc(minuteLabel)}</span><span class="lt-scorer-name">${esc(player)}${isOg ? " (OG)" : ""}</span><span class="lt-scorer-team">${esc(team)}</span></div>`;
          })
          .filter(Boolean)
          .join("")}</div>`
      : "";
  const rowsHtml = visibleRows
    .map((row, idx) => {
      const teamKey = row.team.toLowerCase();
      const isHighlight = highlightedTeam
        ? teamKey === highlightedTeam
        : selectedTeamA || selectedTeamB
          ? teamKey === selectedTeamA || teamKey === selectedTeamB
          : row.position === 1;
      const teamFont = Math.round((ultraCompact ? (row.team.length > 18 ? 18 : 20) : row.team.length > 18 ? 24 : 28) * fontScale);
      const style = isHighlight
        ? `border-color:${highlightColor};background:${highlightBg};box-shadow:0 0 18px ${highlightGlow};`
        : "";
      const badge = !showTeamLogos
        ? ""
        : row.badge
          ? `<img class="lt-badge" src="${esc(row.badge)}" alt="" />`
          : `<span class="lt-badge lt-badge--fallback">${esc(row.team.slice(0, 2).toUpperCase())}</span>`;
      const cells = safeColumnDefs
        .map((column) => {
          if (column.key === "position") return `<div class="lt-rank">${row.position}</div>`;
          if (column.key === "team") {
            return `<div class="lt-team">${badge}<span class="lt-team-name" style="font-size:${teamFont}px">${esc(row.team)}</span></div>`;
          }
          if (column.key === "points") return `<div class="lt-pts">${row.points}</div>`;
          const value =
            column.key === "played"
              ? row.played
              : column.key === "won"
                ? row.won
                : column.key === "drawn"
                  ? row.drawn
                  : column.key === "lost"
                    ? row.lost
                    : row.goalDifference;
          return `<div class="lt-stat">${value}</div>`;
        })
        .join("");
      return `<div class="lt-row${isHighlight ? " lt-row--highlight" : ""}" style="${style}animation-delay:${idx * 0.1}s">
        ${cells}
      </div>`;
    })
    .join("");
  const css = `
  @keyframes ltBgZoom{from{transform:scale(1)}to{transform:scale(1.06)}}
  @keyframes ltFadeUp{from{opacity:0;transform:translate(-50%,calc(-50% + 20px))}to{opacity:1;transform:translate(-50%,-50%)}}
  @keyframes ltRowIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ltGlowPulse{0%,100%{box-shadow:0 0 14px ${highlightGlow}}50%{box-shadow:0 0 28px ${highlightGlow}}}
  .lt-stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${transparentBg ? "transparent" : brand.secondary};font-family:${LEAGUE_TABLE_CARD_TOKENS.fontFamily};color:${LEAGUE_TABLE_CARD_TOKENS.mainText}}
  .lt-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${blur > 0 ? `blur(${blur}px)` : "none"};animation:ltBgZoom 12s ease-out both}
  .lt-bg-fallback{position:absolute;inset:0;background:${pfSurfaceForCard.radialFallback}}
  .lt-overlay{position:absolute;inset:0;background:${transparentBg ? overlay : `rgba(0,0,0,${overlayStrength})`};z-index:2}
  .lt-card{position:absolute;left:50%;top:${tableCenterY}px;z-index:4;width:min(${cardWidth}px,90%);max-width:920px;max-height:${cardMaxHeight}px;overflow:hidden;box-sizing:border-box;transform:translate(-50%,-50%);background:${isSport365 ? `rgba(36,8,32,${tableOpacity.toFixed(3)})` : `rgba(12,12,12,${tableOpacity.toFixed(3)})`};border-radius:18px;padding:${ultraCompact ? 16 : 24}px;box-shadow:0 16px 48px rgba(0,0,0,.55);animation:ltFadeUp .55s ease-out both${isSport365 ? `;border:1px solid rgba(189,51,181,0.45)` : `;border:1px solid ${hexToRgba(brand.primary, 0.45)}`}${transparentBg ? ";backdrop-filter:blur(12px)" : ""}}
  .lt-card-plate{position:absolute;inset:0;border-radius:18px;z-index:0;background:${isSport365 ? `rgba(14,3,12,${cardPlateOpacity.toFixed(3)})` : `rgba(8,8,8,${cardPlateOpacity.toFixed(3)})`}}
  .lt-card-inner{position:relative;z-index:1}
  .lt-title{font-size:${Math.round(34 * fontScale)}px;font-weight:800;line-height:${Math.round(38 * fontScale)}px;margin:0 0 16px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.45)}
  .lt-head{display:grid;grid-template-columns:${columnTemplate};height:${Math.round((ultraCompact ? 38 : 56) * rowScale)}px;align-items:center;border-bottom:1px solid ${LEAGUE_TABLE_CARD_TOKENS.headerDivider};color:${LEAGUE_TABLE_CARD_TOKENS.headerText};font-size:${Math.round((ultraCompact ? 14 : 18) * fontScale)}px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
  .lt-head span:not(.lt-head--team){text-align:center}
  .lt-rows{display:flex;flex-direction:column;gap:4px;margin-top:8px}
  .lt-row{display:grid;grid-template-columns:${columnTemplate};align-items:center;min-height:${rowH}px;padding:0 16px;border:1px solid ${LEAGUE_TABLE_CARD_TOKENS.standardBorder};border-radius:12px;background:${rowBg};box-sizing:border-box;animation:ltRowIn .42s ease-out both}
  .lt-row--highlight{animation-name:ltRowIn,ltGlowPulse;animation-duration:.42s,2.4s;animation-timing-function:ease-out,ease-in-out;animation-iteration-count:1,infinite}
  .lt-rank{font-size:${Math.round((ultraCompact ? 20 : 28) * fontScale)}px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
  .lt-team{min-width:0;display:flex;align-items:center;gap:14px}
  .lt-badge{width:${badgePx}px;height:${badgePx}px;object-fit:contain;flex:0 0 auto}
  .lt-badge--fallback{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:${brand.primary};color:#111;font-size:13px;font-weight:900}
  .lt-team-name{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;line-height:${ultraCompact ? 22 : 30}px;color:#fff}
  .lt-stat{font-size:${Math.round((ultraCompact ? 18 : 24) * fontScale)}px;font-weight:600;text-align:center;color:${LEAGUE_TABLE_CARD_TOKENS.statsText};font-variant-numeric:tabular-nums}
  .lt-pts{font-size:${Math.round((ultraCompact ? 20 : 28) * fontScale)}px;font-weight:800;text-align:center;color:#fff;font-variant-numeric:tabular-nums}
  .lt-score{margin:0 0 18px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12)}
  .lt-score-teams{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .lt-score-side{flex:1;display:flex;align-items:center;gap:12px;min-width:0}
  .lt-score-side--away{justify-content:flex-end}
  .lt-score-crest{width:${Math.round(44 * fontScale)}px;height:${Math.round(44 * fontScale)}px;object-fit:contain;flex:0 0 auto;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
  .lt-score-crest-fallback{width:${Math.round(44 * fontScale)}px;height:${Math.round(44 * fontScale)}px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.12);font-size:12px;font-weight:900;color:#fff;flex:0 0 auto}
  .lt-score-team{font-size:${Math.round(26 * fontScale)}px;font-weight:800;color:#fff;line-height:1.1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lt-score-line{flex:0 0 auto;font-size:${Math.round(52 * fontScale)}px;font-weight:900;color:#fff;letter-spacing:.04em;font-variant-numeric:tabular-nums}
  .lt-score-sep{opacity:.65;padding:0 6px}
  .lt-score-status{margin-top:8px;font-size:${Math.round(18 * fontScale)}px;font-weight:600;color:${brand.primary};text-transform:uppercase;letter-spacing:.08em}
  .lt-scorers{margin:0 0 16px;display:flex;flex-direction:column;gap:6px}
  .lt-scorer{display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;font-size:${Math.round(18 * fontScale)}px;color:#e5e7eb}
  .lt-scorer-minute{font-weight:800;color:${brand.primary};font-variant-numeric:tabular-nums}
  .lt-scorer-name{font-weight:700;color:#fff}
  .lt-scorer-team{font-size:${Math.round(15 * fontScale)}px;color:#cbd5e1;text-align:right}
  .lt-pf-icon{position:absolute;right:42px;top:48px;z-index:5;width:${logoW}px;height:${logoH}px;display:block;filter:drop-shadow(0 10px 24px rgba(0,0,0,.32))}
  .lt-footer{position:absolute;left:0;right:0;bottom:40px;height:100px;z-index:4;text-align:center;color:${brand.primary};font-size:24px;font-weight:700}
  ${staticPng ? `body[data-r365-static-png="1"] .lt-card{animation:none!important;opacity:1!important;transform:translate(-50%,-50%)!important}body[data-r365-static-png="1"] .lt-row,body[data-r365-static-png="1"] .lt-score,body[data-r365-static-png="1"] .lt-title{animation:none!important;opacity:1!important;transform:none!important}` : ""}
  `;
  const staticAttr = staticPng ? ' data-r365-static-png="1"' : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body style="margin:0"${staticAttr}><div class="lt-stage">
    ${motionBackdropLayers}
    ${bg && !transparentBg ? `<img class="lt-bg" src="${bg}" alt="" />` : transparentBg ? "" : `<div class="lt-bg-fallback"></div>`}
    <div class="lt-overlay"></div>
    <div class="lt-card">
      <div class="lt-card-plate" aria-hidden="true"></div>
      <div class="lt-card-inner">
      ${scoreHtml}
      ${scorersHtml}
      ${title ? `<h1 class="lt-title">${esc(title)}</h1>` : ""}
      ${showStandingsTable ? `<div class="lt-head">${safeColumnDefs.map((column) => `<span class="${column.key === "team" ? "lt-head--team" : ""}">${column.label}</span>`).join("")}</div>
      <div class="lt-rows">${rowsHtml}</div>` : ""}
      </div>
    </div>
    ${showBrandLogo ? leagueTableBrandLogoSvg(leagueBrand, "lt-pf-icon") : ""}
    ${footerText ? `<div class="lt-footer">${esc(footerText)}</div>` : ""}
  </div></body></html>`;
}

function renderPlanetRugbyTemplate(templateId: string, data: Data, w: number, h: number): string | null {
  if (
    templateId !== "planet-rugby-intro" &&
    templateId !== "planet-rugby-table" &&
    templateId !== "planet-rugby-outro" &&
    templateId !== "planet-football-intro" &&
    templateId !== "planet-football-table" &&
    templateId !== "planet-football-outro"
  ) {
    return null;
  }
  const isPlanetFootball = templateId.startsWith("planet-football-");
  const pfDisplayBrand = normalizePlanetFootballDisplayBrand(data.brand);
  const pfSurface = isPlanetFootball ? planetFootballSurfaceTokens(pfDisplayBrand) : null;
  const pfLeagueBrand = isPlanetFootball ? pfSurface!.leagueBrand : "planetrugby";
  const pfBrandDefaults = isPlanetFootball ? planetFootballBrandDefaults(pfDisplayBrand) : null;
  const pfLogoScale = Math.max(1, Math.min(3, Number(data.brandLogoScale ?? (pfLeagueBrand === "sport365" ? 1.85 : 1))));
  const brandMark = isPlanetFootball ? (pfBrandDefaults?.brandFooter.slice(0, 2) ?? "PF") : "PR";
  const brandLogoHtml = isPlanetFootball
    ? leagueTableBrandLogoSvg(pfLeagueBrand, "pf-icon-svg")
    : brandMark;
  const brandFooter = isPlanetFootball ? (pfBrandDefaults?.brandFooter ?? "PLANET FOOTBALL") : "PLANET RUGBY";
  const brandSignoff = isPlanetFootball
    ? (pfBrandDefaults?.outroLine ?? "For more football coverage, head to Sport365.com")
    : "For more rugby coverage, head to PlanetRugby.com";
  const panelRgb = isPlanetFootball ? (pfSurface?.panelRgb ?? "12,12,12") : "8,39,34";
  const accentColor = isPlanetFootball ? (pfSurface?.accentColor ?? "#d4b46a") : "#d4b46a";
  const stageBg = isPlanetFootball ? (pfSurface?.stageBg ?? "#111111") : "#081525";
  const broadcastBg = isPlanetFootball ? (pfSurface?.broadcastBg ?? "#070907") : "#0a1f2e";
  const pfHeroFallback = pfSurface?.heroFallback ?? "linear-gradient(160deg,#1b260f 0%,#090c06 100%)";
  const pfRadialFallback = pfSurface?.radialFallback ?? "radial-gradient(circle at 70% 20%,#1f2b10 0%,#101608 45%,#050605 100%)";
  const pfBrandLogoClass =
    pfLeagueBrand === "planetfootball"
      ? "pr-bc-brand--pf-symbol"
      : pfLeagueBrand === "football365" || pfLeagueBrand === "teamtalk"
        ? "pr-bc-brand--pf-wordmark"
        : "pr-bc-brand--pf-sport365";
  const pfLogoClassPr = pfBrandLogoClass.replace("pr-bc-brand--", "pr-logo--");
  const rows = (Array.isArray(data.rows) ? data.rows : []) as Array<Record<string, unknown>>;
  const allColumns = [
    { key: "position", label: "#" },
    { key: "team", label: "TEAM" },
    { key: "played", label: "P" },
    { key: "won", label: "W" },
    { key: "drawn", label: "D" },
    { key: "lost", label: "L" },
    { key: "pointsDifference", label: "PD" },
    { key: "points", label: "PTS" },
  ] as const;
  const visibleColumnKeysRaw = Array.isArray(data.visibleColumns)
    ? (data.visibleColumns as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const visibleColumns =
    visibleColumnKeysRaw.length > 0
      ? allColumns.filter((c) => visibleColumnKeysRaw.includes(c.key))
      : allColumns;
  const fontScale = Number(data.fontSize ?? 1);
  const rowScale = Number(data.rowSpacing ?? 1);
  const headline = esc(data.headline ?? "Latest Table");
  const subtitle = esc(data.subtitle ?? "");
  const competition = esc(data.competition ?? "Planet Rugby");
  const highlightColor = esc(String(data.highlightColor ?? "#f5c542"));
  const pos = String(data.tablePosition ?? "lower-left");
  const isTableScene = templateId === "planet-rugby-table" || templateId === "planet-football-table";
  const tableStyleRaw = String(data.tableStyle ?? "standard-image-overlay").trim();
  const tableStyle =
    tableStyleRaw === "bottom-four" ||
    tableStyleRaw === "top-five" ||
    tableStyleRaw === "full-block-background" ||
    tableStyleRaw === "standard-image-overlay"
      ? tableStyleRaw
      : "standard-image-overlay";
  if (isPlanetFootball && isTableScene && tableStyle === "standard-image-overlay") {
    return renderLeagueTableCardTemplate(data, w, h);
  }
  const pageLabel = isTableScene ? "" : esc(data.pageLabel ?? "");
  const isHeadToHead = isTableScene && String(data.mode ?? "") === "head-to-head";
  const selectedTeamA = typeof data.selectedTeamA === "string" ? data.selectedTeamA.trim() : "";
  const selectedTeamB = typeof data.selectedTeamB === "string" ? data.selectedTeamB.trim() : "";
  const cleanTeam = (raw: unknown): string =>
    String(raw ?? "")
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/\s+/g, " ")
      .trim();
  const selectedTeams = new Set([cleanTeam(selectedTeamA), cleanTeam(selectedTeamB)].filter(Boolean));
  const showTeamLogos = data.showTeamLogos !== false;
  const teamInitials = (teamName: string): string => {
    const bits = teamName
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (bits.length === 0) return "PR";
    if (bits.length === 1) return bits[0]!.slice(0, 2).toUpperCase();
    return `${bits[0]![0] ?? ""}${bits[1]![0] ?? ""}`.toUpperCase();
  };
  const renderableTeamLogo = (raw: unknown): string | null => {
    if (!showTeamLogos || typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v) return null;
    if (/\/rugbyunion\/leagues\//i.test(v) || /\/leagues\//i.test(v)) return null;
    if (v.startsWith("data:image/")) return v;
    if (/^https?:\/\//i.test(v)) return v;
    return null;
  };
  const isIntroOrOutro =
    templateId === "planet-rugby-intro" ||
    templateId === "planet-rugby-outro" ||
    templateId === "planet-football-intro" ||
    templateId === "planet-football-outro";
  const isIntro = templateId === "planet-rugby-intro" || templateId === "planet-football-intro";
  const isOutro = templateId === "planet-rugby-outro" || templateId === "planet-football-outro";
  const showTopLine = !isTableScene && !isIntroOrOutro;
  const showBottomMeta = !isTableScene && !isIntroOrOutro;
  const fixedSignoff = brandSignoff;
  const introLineRaw = typeof data.introLine === "string" ? data.introLine.trim() : "";
  const introTitle = introLineRaw || `${competition} latest table`;
  const outroLineRaw = typeof data.outroLine === "string" ? data.outroLine.trim() : "";
  const outroTitle = outroLineRaw || fixedSignoff;
  /** Scale vertical offsets for non-1920 exports; keeps “low” visually low on the canvas. */
  const vy = h / 1920;
  const yt = (px: number) => `${Math.round(px * vy)}px`;
  const lx = `${Math.round(28 * (w / 1080))}px`;
  const rx = `${Math.round(28 * (w / 1080))}px`;
  const panelPos = (() => {
    if (pos === "center") {
      return isTableScene
        ? `left:50%;right:auto;top:${yt(520)};bottom:auto;transform:translateX(-50%);`
        : "left:50%;right:auto;top:300px;bottom:auto;transform:translateX(-50%);";
    }
    if (isTableScene) {
      if (pos === "high-left") return `left:${lx};right:auto;top:${yt(240)};bottom:auto;transform:none;`;
      if (pos === "middle-left" || pos === "left") return `left:${lx};right:auto;top:${yt(540)};bottom:auto;transform:none;`;
      if (pos === "low-left" || pos === "lower-left") return `left:${lx};right:auto;top:${yt(820)};bottom:auto;transform:none;`;
      if (pos === "bottom-left") return `left:${lx};right:auto;top:auto;bottom:${yt(110)};transform:none;`;
      if (pos === "high-right") return `left:auto;right:${rx};top:${yt(240)};bottom:auto;transform:none;`;
      if (pos === "middle-right") return `left:auto;right:${rx};top:${yt(560)};bottom:auto;transform:none;`;
      if (pos === "bottom-right") return `left:auto;right:${rx};top:auto;bottom:${yt(110)};transform:none;`;
      return `left:${lx};right:auto;top:${yt(700)};bottom:auto;transform:none;`;
    }
    if (pos === "high-left") return "left:28px;right:auto;top:220px;bottom:auto;transform:none;";
    if (pos === "middle-left" || pos === "left") return "left:28px;right:auto;top:420px;bottom:auto;transform:none;";
    if (pos === "low-left" || pos === "lower-left") return "left:28px;right:auto;top:620px;bottom:auto;transform:none;";
    if (pos === "bottom-left") return "left:28px;right:auto;top:auto;bottom:150px;transform:none;";
    if (pos === "high-right") return "left:auto;right:28px;top:220px;bottom:auto;transform:none;";
    if (pos === "middle-right") return "left:auto;right:28px;top:460px;bottom:auto;transform:none;";
    if (pos === "bottom-right") return "left:auto;right:28px;top:auto;bottom:150px;transform:none;";
    return "left:42px;right:auto;top:auto;bottom:240px;transform:none;";
  })();
  const blur = Math.max(0, Math.min(20, Number(data.backgroundBlur ?? 0)));
  const overlay = Math.max(0.2, Math.min(0.9, Number(data.overlayStrength ?? 0.55)));
  const tablePanelOpacity = Math.max(0.15, Math.min(0.9, Number(data.tablePanelOpacity ?? 0.58)));
  const tableWidthPercent = Math.max(45, Math.min(100, Number(data.tableWidthPercent ?? 94)));
  const tableHeightPercent = Math.max(28, Math.min(88, Number(data.tableHeightPercent ?? 72)));
  const tablePanelW = Math.round(w * (tableWidthPercent / 100));
  const tablePanelMaxH = Math.round(h * (tableHeightPercent / 100));
  const tableRowAlpha = Math.max(0.38, Math.min(1, tablePanelOpacity + 0.18));
  const transparentBg = Boolean(data.editorTransparentBackground);
  const backgroundImageUrl = transparentBg
    ? ""
    : typeof data.backgroundImageUrl === "string" && data.backgroundImageUrl.trim()
      ? data.backgroundImageUrl.trim()
      : typeof data.editorBackgroundImageUrl === "string" && data.editorBackgroundImageUrl.trim()
        ? data.editorBackgroundImageUrl.trim()
        : "";
  const bg = backgroundImageUrl ? esc(backgroundImageUrl) : "";
  const motionBackdropLayers = editorMotionBackdropLayersHtml(data);
  const h2hRows = isHeadToHead ? rows.slice(0, 2) : [];
  const h2hLeadTeam =
    h2hRows.length >= 2
      ? Number(h2hRows[0]?.position ?? 999) <= Number(h2hRows[1]?.position ?? 999)
        ? 0
        : 1
      : 0;
  const h2hCore = [
    { key: "position", label: "#" },
    { key: "played", label: "P" },
    { key: "won", label: "W" },
    { key: "lost", label: "L" },
    { key: "pointsDifference", label: "PD" },
    { key: "points", label: "PTS" },
  ].filter((c) => visibleColumns.some((v) => v.key === c.key));
  const h2hMarkup =
    h2hRows.length === 0
      ? ""
      : `<div class="pr-bc-h2h">${h2hRows
          .map((r, idx) => {
            const lead = idx === h2hLeadTeam ? " pr-bc-h2h-card--lead" : "";
            const team = esc(cleanTeam(r.team));
            const stats = h2hCore
              .map((c) => `<div class="pr-bc-h2h-stat"><span>${c.label}</span><strong>${esc(r[c.key] ?? "")}</strong></div>`)
              .join("");
            return `<div class="pr-bc-h2h-card${lead}"><div class="pr-bc-h2h-team">${team}</div><div class="pr-bc-h2h-stats">${stats}</div></div>`;
          })
          .join("")}</div>`;

  const sx = w / 1080;
  const safeX = Math.round(64 * sx);
  const safeY = Math.round(72 * sx);
  const footH = Math.round(52 * sx);
  const heroFrac = tableStyle === "full-block-background" ? 0.36 : 0.45;
  const heroH = Math.round(h * heroFrac);
  const gapPx = Math.max(3, Math.round(5 * sx * rowScale));
  const gridTpl = planetRugbyBroadcastGridTemplate(visibleColumns, w);
  const titleLines = planetRugbyBroadcastTitleLines(data);
  const rowMinH =
    rows.length <= 4
      ? Math.round(90 * sx * rowScale * fontScale)
      : Math.round(72 * sx * rowScale * fontScale);
  const titleFont = Math.round((rows.length <= 4 ? 46 : 40) * fontScale * sx);
  const cellFont = Math.round((rows.length <= 4 ? 34 : 30) * fontScale * sx);
  const headFont = Math.round(22 * fontScale * sx);
  const titleBoxH = Math.round(18 * sx * 2 + titleFont + titleFont * 0.88 + 6 * sx);
  const tableTopBelowTitle = Math.max(safeY, Math.round(heroH + titleBoxH / 2 + 34 * sx));

  const buildBroadcastRows = (): string => {
    return rows
      .map((r) => {
        const teamName = cleanTeam(r.team);
        const shouldHighlight = selectedTeams.size > 0 && selectedTeams.has(teamName);
        const hl = shouldHighlight ? ` box-shadow:inset 0 0 0 2px ${highlightColor};` : "";
        const logoUrl = renderableTeamLogo(r.logoUrl);
        const cells = visibleColumns
          .map((c) => {
            if (c.key === "team") {
              const initials = esc(teamInitials(teamName));
              const img = !showTeamLogos
                ? ""
                : logoUrl
                  ? `<img class="pr-bc-logo" src="${esc(logoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.remove('is-hidden')" /><span class="pr-bc-logo-fallback is-hidden">${initials}</span>`
                  : `<span class="pr-bc-logo-fallback">${initials}</span>`;
              return `<div class="pr-bc-cell pr-bc-cell--team">${img}<span class="pr-bc-team-txt">${esc(teamName)}</span></div>`;
            }
            const isPts = c.key === "points";
            return `<div class="pr-bc-cell pr-bc-cell--stat${isPts ? " pr-bc-cell--pts" : ""}">${esc(r[c.key] ?? "")}</div>`;
          })
          .join("");
        return `<div class="pr-bc-row" style="grid-template-columns:${gridTpl};gap:${gapPx}px;min-height:${rowMinH}px;${hl}">${cells}</div>`;
      })
      .join("");
  };

  const broadcastHeader = `<div class="pr-bc-colhead" style="grid-template-columns:${gridTpl};gap:${gapPx}px;">${visibleColumns
    .map((c) => `<div class="pr-bc-hcell">${esc(c.label)}</div>`)
    .join("")}</div>`;

  const broadcastTableInner = isHeadToHead ? h2hMarkup : `${broadcastHeader}<div class="pr-bc-rows">${buildBroadcastRows()}</div>`;

  const broadcastPosSlug = pos.toLowerCase().replace(/[^a-z0-9]/g, "") || "lowerleft";
  const broadcastPosClass = `pr-bc-pos-${broadcastPosSlug}`;
  const broadcastBody = `
<div class="pr-bc-root pr-bc-style-${tableStyle} ${showTeamLogos ? "" : "pr-bc-no-logos"} ${broadcastPosClass}">
  ${motionBackdropLayers}
  <div class="pr-bc-hero">
    ${bg ? `<img class="pr-bc-hero-img" src="${bg}" alt="" style="filter:${blur > 0 ? `blur(${blur}px)` : "none"}" />` : transparentBg ? "" : `<div class="pr-bc-hero-fallback"></div>`}
    <div class="pr-bc-hero-grad"></div>
  </div>
  ${data.showLogo === false ? "" : `<div class="pr-bc-brand${isPlanetFootball ? ` ${pfBrandLogoClass}` : ""}${pos.includes("right") ? " pr-bc-brand--corner-left" : ""}">${brandLogoHtml}</div>`}
  <div class="pr-bc-title-wrap" style="top:${heroH}px;">
    <div class="pr-bc-title">
      <div class="pr-bc-title-l1">${esc(titleLines.line1)}</div>
      <div class="pr-bc-title-l2">${esc(titleLines.line2)}</div>
    </div>
  </div>
  <div class="pr-bc-lower" style="top:${tableTopBelowTitle}px;">
    <div class="pr-bc-lower-inner">
      ${pageLabel ? `<div class="pr-bc-meta">${pageLabel}</div>` : ""}
      ${broadcastTableInner}
    </div>
  </div>
  <div class="pr-bc-footer">${brandFooter}</div>
</div>`;

  const useBroadcastTableStyle = isTableScene && tableStyle !== "standard-image-overlay";
  /** Standard overlay: use most of the canvas width so P/W/D/L and team names are not clipped. */
  const legacyPanelMargin = Math.round(20 * sx);
  const legacyPanelW = Math.min(w - 2 * legacyPanelMargin, tablePanelW);
  const legacyTableDense = rows.length >= 12;
  const legacyTdFont = legacyTableDense ? Math.round(34 * fontScale) : Math.round(42 * fontScale);
  const legacyThFont = legacyTableDense ? Math.round(28 * fontScale) : Math.round(34 * fontScale);
  const legacyTeamColMin = Math.round((legacyTableDense ? 200 : 260) * fontScale * sx);
  const legacyLogoPx = Math.max(22, Math.round((legacyTableDense ? 26 : 32) * fontScale));

  const legacyTableBody = `
<div class="pr-stage ${showTeamLogos ? "" : "pr-no-team-logos"}">
  ${motionBackdropLayers}
  ${bg ? `<img class="pr-bg" src="${bg}" alt="" />` : transparentBg ? "" : `<div class="pr-bg pr-bg-fallback"></div>`}
  <div class="pr-overlay"></div>
  ${data.showLogo === false ? "" : `<div class="pr-logo${isPlanetFootball ? ` ${pfLogoClassPr}` : ""}">${brandLogoHtml}</div>`}
  <div class="pr-panel pr-panel--table">
    <div class="pr-title">${headline}</div>
    ${subtitle ? `<div class="pr-sub">${subtitle}</div>` : ""}
    <div class="pr-table-wrap">
      <table class="pr-table">
        <thead><tr>${visibleColumns.map((c) => `<th class="pr-col-${c.key}">${c.label}</th>`).join("")}</tr></thead>
        <tbody>${rows
          .map((r, idx) => {
            const teamName = cleanTeam(r.team);
            const shouldHighlight = selectedTeams.size > 0 && selectedTeams.has(teamName);
            const isH2HLead = String(data.mode ?? "") === "head-to-head" && idx === 0;
            const hl = shouldHighlight || isH2HLead
              ? ` style="box-shadow:inset 0 0 0 2px ${highlightColor};background:color-mix(in srgb, ${highlightColor} 18%, rgba(8,23,38,.9));"`
              : "";
            const logoUrl = renderableTeamLogo(r.logoUrl);
            const initials = esc(teamInitials(teamName));
            const teamCell = `<div class="pr-team-cell">${
              !showTeamLogos
                ? ""
                : logoUrl
                  ? `<img class="pr-team-logo" src="${esc(logoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.remove('is-hidden')" /><span class="pr-team-logo-fallback is-hidden">${initials}</span>`
                  : `<span class="pr-team-logo-fallback">${initials}</span>`
            }<span class="pr-team-name">${esc(teamName)}</span></div>`;
            return `<tr${hl}>${visibleColumns
              .map((c) =>
                c.key === "team"
                  ? `<td class="pr-col-${c.key}" title="${esc(teamName)}">${teamCell}</td>`
                  : `<td class="pr-col-${c.key}">${esc(r[c.key] ?? "")}</td>`,
              )
              .join("")}</tr>`;
          })
          .join("")}</tbody>
      </table>
    </div>
    ${pageLabel ? `<div class="pr-page">${pageLabel}</div>` : ""}
  </div>
</div>`;

  const body = useBroadcastTableStyle
    ? broadcastBody
    : isTableScene
      ? legacyTableBody
    : `
<div class="pr-stage pr-style-standard-image-overlay">
  ${motionBackdropLayers}
  ${bg ? `<img class="pr-bg" src="${bg}" alt="" />` : transparentBg ? "" : `<div class="pr-bg pr-bg-fallback"></div>`}
  <div class="pr-overlay"></div>
  ${data.showLogo === false ? "" : `<div class="pr-logo${isPlanetFootball ? ` ${pfLogoClassPr}` : ""}">${brandLogoHtml}</div>`}
  <div class="pr-panel ${isIntroOrOutro ? "pr-panel--signoff" : ""}">
    ${showTopLine ? `<div class="pr-head">${competition}</div>` : ""}
    <div class="pr-title">${isOutro ? esc(outroTitle) : isIntro ? esc(introTitle) : headline}</div>
    ${isIntroOrOutro ? "" : subtitle ? `<div class="pr-sub">${subtitle}</div>` : ""}
    ${showBottomMeta ? (pageLabel ? `<div class="pr-page">${pageLabel}</div>` : "") : ""}
    ${showBottomMeta ? (data.updatedAt ? `<div class="pr-updated">${esc(data.updatedAt)}</div>` : "") : ""}
  </div>
</div>`;

  const introCss = `
  .pr-stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${transparentBg ? "transparent" : stageBg};font-family:Inter,Arial,sans-serif}
  .pr-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(${blur}px)}
  .pr-bg-fallback{background:${isPlanetFootball ? pfRadialFallback : "radial-gradient(circle at 70% 20%,#1e3a5f 0,#0d2238 45%,#071321 100%)"}}
  .pr-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,${overlay}) 0%,rgba(0,0,0,${overlay * 0.7}) 42%,rgba(0,0,0,0.18) 100%)}
  .pr-logo{position:absolute;right:${safeX}px;top:${safeY}px;color:#fff;border:2px solid ${accentColor};border-radius:10px;padding:10px 16px;font-weight:900;font-size:${Math.round(28 * fontScale * sx)}px;line-height:1;letter-spacing:.08em;z-index:4;background:rgba(${panelRgb},.92)}
  .pr-logo--pf-sport365{width:${Math.round(112 * pfLogoScale * sx)}px;height:${Math.round(48 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-logo--pf-wordmark{width:${Math.round(150 * pfLogoScale * sx)}px;height:${Math.round(48 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-logo--pf-symbol{width:${Math.round(72 * pfLogoScale * sx)}px;height:${Math.round(72 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pf-icon-svg{width:100%;height:100%;display:block;filter:drop-shadow(0 10px 24px rgba(0,0,0,.32))}
  .pr-panel{position:absolute;z-index:2;${panelPos}width:${Math.round(w * 0.58)}px;background:rgba(${panelRgb},.72);border:1px solid rgba(255,255,255,.28);border-radius:14px;padding:14px 14px 10px}
  .pr-panel--signoff{left:50%;top:50%;transform:translate(-50%,-50%);width:auto;max-width:${Math.round(w * 0.8)}px;display:flex;align-items:center;justify-content:center;min-height:${Math.round(h * 0.2)}px;text-align:center;padding:${Math.round(26 * rowScale)}px}
  .pr-head{font-size:${Math.round(48 * fontScale)}px;font-weight:800;color:#fff}
  .pr-title{margin-top:4px;font-size:${Math.round(60 * fontScale)}px;line-height:1.08;font-weight:800;color:#fff}
  .pr-sub{margin-top:8px;font-size:${Math.round(40 * fontScale)}px;color:#d1d5db}
  .pr-page,.pr-updated{margin-top:8px;font-size:${Math.round(14 * fontScale)}px;color:#cbd5e1}`;

  const legacyTableCss = `
  .pr-stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${transparentBg ? "transparent" : stageBg};font-family:Inter,Arial,sans-serif}
  .pr-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(${blur}px)}
  .pr-bg-fallback{background:${isPlanetFootball ? pfRadialFallback : "radial-gradient(circle at 70% 20%,#1e3a5f 0,#0d2238 45%,#071321 100%)"}}
  .pr-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,${overlay}) 0%,rgba(0,0,0,${overlay * 0.7}) 42%,rgba(0,0,0,0.18) 100%)}
  .pr-logo{position:absolute;right:${safeX}px;top:${safeY}px;color:#fff;border:2px solid ${accentColor};border-radius:10px;padding:10px 16px;font-weight:900;font-size:${Math.round(28 * fontScale * sx)}px;line-height:1;letter-spacing:.08em;z-index:4;background:rgba(${panelRgb},.92)}
  .pr-logo--pf-sport365{width:${Math.round(112 * pfLogoScale * sx)}px;height:${Math.round(48 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-logo--pf-wordmark{width:${Math.round(150 * pfLogoScale * sx)}px;height:${Math.round(48 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-logo--pf-symbol{width:${Math.round(72 * pfLogoScale * sx)}px;height:${Math.round(72 * pfLogoScale * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pf-icon-svg{width:100%;height:100%;display:block;filter:drop-shadow(0 10px 24px rgba(0,0,0,.32))}
  .pr-panel{position:absolute;${panelPos}z-index:2;width:${legacyPanelW}px;max-width:calc(100% - ${Math.round(2 * legacyPanelMargin)}px);max-height:${tablePanelMaxH}px;box-sizing:border-box;background:rgba(${panelRgb},${tablePanelOpacity.toFixed(3)});border:1px solid rgba(255,255,255,.24);border-radius:14px;padding:14px 14px 12px;box-shadow:0 12px 30px rgba(0,0,0,.28);backdrop-filter:blur(2px);display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .pr-title{margin-top:4px;font-size:${Math.round((legacyTableDense ? 44 : 52) * fontScale)}px;line-height:1.08;font-weight:800;color:#fff}
  .pr-sub{margin-top:8px;font-size:${Math.round(20 * fontScale)}px;color:#d1d5db}
  .pr-table-wrap{margin-top:10px;width:100%;border:1px solid rgba(255,255,255,.2);border-radius:10px;overflow-x:auto;overflow-y:hidden;background:rgba(${isPlanetFootball ? "7,40,70" : "10,55,48"},${Math.min(0.78, tablePanelOpacity + 0.12).toFixed(3)});min-height:0}
  .pr-table{width:100%;min-width:min(100%,${Math.round(960 * sx)}px);border-collapse:collapse;table-layout:fixed}
  .pr-table th,.pr-table td{border:1px solid rgba(255,255,255,.22);padding:${Math.round(5 * rowScale)}px ${Math.round(9 * rowScale)}px;color:#fff;font-size:${legacyTdFont}px;background:rgba(${isPlanetFootball ? "14,65,105" : "12,65,56"},.24);vertical-align:middle}
  .pr-table th{font-size:${legacyThFont}px;font-weight:800;color:#e5e7eb}
  .pr-table .pr-col-team{text-align:left}
  .pr-table td:not(.pr-col-team){text-align:center;white-space:nowrap;overflow:visible}
  .pr-table td.pr-col-team{white-space:normal;line-height:1.12;overflow-wrap:anywhere;word-break:break-word;min-width:${legacyTeamColMin}px;width:36%}
  .pr-team-cell{display:flex;align-items:center;gap:${Math.max(6, Math.round(8 * rowScale))}px;min-width:0}
  .pr-team-logo{width:${legacyLogoPx}px;height:${legacyLogoPx}px;object-fit:contain;flex:0 0 auto}
  .pr-team-logo-fallback{width:${legacyLogoPx}px;height:${legacyLogoPx}px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(233,241,248,.2);border:1px solid rgba(255,255,255,.32);font-size:${Math.max(11, Math.round(12 * fontScale))}px;font-weight:800;color:#e5e7eb;flex:0 0 auto}
  .pr-team-logo-fallback.is-hidden{display:none}
  .pr-team-name{min-width:0;white-space:normal;overflow:visible;line-height:1.12;display:block;max-width:100%}
  .pr-no-team-logos .pr-team-cell{gap:0}
  .pr-table th.pr-col-position,.pr-table td.pr-col-position{width:5%}
  .pr-table th.pr-col-played,.pr-table td.pr-col-played,.pr-table th.pr-col-won,.pr-table td.pr-col-won,.pr-table th.pr-col-drawn,.pr-table td.pr-col-drawn,.pr-table th.pr-col-lost,.pr-table td.pr-col-lost{width:8.5%}
  .pr-table th.pr-col-pointsDifference,.pr-table td.pr-col-pointsDifference{width:12%}
  .pr-table th.pr-col-points,.pr-table td.pr-col-points{width:8%}
  .pr-page{margin-top:8px;font-size:${Math.round(14 * fontScale)}px;color:#cbd5e1}`;

  const tableCss = `
  .pr-bc-root{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${transparentBg ? "transparent" : broadcastBg};font-family:system-ui,"Segoe UI",Inter,Arial,sans-serif;color:#f8fafc}
  .pr-bc-hero{position:absolute;left:0;top:0;width:100%;height:${heroH}px;overflow:hidden}
  .pr-bc-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top}
  .pr-bc-hero-fallback{position:absolute;inset:0;background:${isPlanetFootball ? pfHeroFallback : "linear-gradient(160deg,#1a3a52 0%,#0d2238 100%)"}}
  .pr-bc-hero-grad{position:absolute;left:0;right:0;bottom:0;height:${Math.round(140 * sx)}px;background:linear-gradient(180deg,rgba(10,31,46,0) 0%,rgba(8,26,40,.55) 45%,rgba(6,20,34,.92) 100%);pointer-events:none}
  .pr-bc-style-full-block-background .pr-bc-hero-img{opacity:.22}
  .pr-bc-brand{position:absolute;right:${safeX}px;top:${safeY}px;z-index:6;color:#fff;border:2px solid ${accentColor};border-radius:10px;padding:10px 14px;font-weight:900;font-size:${Math.round(26 * fontScale * sx)}px;letter-spacing:.12em;background:rgba(${panelRgb},.92)}
  .pr-bc-brand--pf-symbol{width:${Math.round(72 * sx)}px;height:${Math.round(72 * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-bc-brand--pf-sport365{width:${Math.round(112 * sx)}px;height:${Math.round(48 * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-bc-brand--pf-wordmark{width:${Math.round(150 * sx)}px;height:${Math.round(48 * sx)}px;padding:0;border:0;background:transparent;box-shadow:none;letter-spacing:0}
  .pr-bc-brand--pf-symbol .pf-icon-svg,.pr-bc-brand--pf-sport365 .pf-icon-svg,.pr-bc-brand--pf-wordmark .pf-icon-svg{width:100%;height:100%;display:block;filter:drop-shadow(0 10px 24px rgba(0,0,0,.32))}
  .pr-bc-brand--corner-left{left:${safeX}px;right:auto}
  .pr-bc-title-wrap{position:absolute;left:${safeX}px;right:${safeX}px;transform:translateY(-50%);z-index:5;display:flex;justify-content:center;pointer-events:none}
  .pr-bc-title{background:${isPlanetFootball ? "linear-gradient(165deg,#161b10 0%,#080908 100%)" : "linear-gradient(165deg,#0f2a3d 0%,#0a1f2e 100%)"};border:1px solid ${isPlanetFootball ? "rgba(182,246,87,.62)" : "rgba(212,180,106,.55)"};box-shadow:0 14px 40px rgba(0,0,0,.45);padding:${Math.round(18 * sx)}px ${Math.round(28 * sx)}px;max-width:min(94%,${Math.round(980 * sx)}px);text-align:center}
  .pr-bc-title-l1{font-size:${titleFont}px;line-height:1.05;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:#fff}
  .pr-bc-title-l2{margin-top:${Math.round(6 * sx)}px;font-size:${Math.round(titleFont * 0.88)}px;line-height:1.05;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:${isPlanetFootball ? PLANET_FOOTBALL_COLORS.greenYellow : "#e8d5a0"}}
  .pr-bc-lower{position:absolute;left:0;right:0;bottom:0;padding:0 ${safeX}px ${footH + safeY}px;z-index:3}
  .pr-bc-lower-inner{width:min(100%,${tablePanelW}px);height:min(100%,${tablePanelMaxH}px);background:linear-gradient(180deg,rgba(${isPlanetFootball ? "12,12,12" : "11,36,54"},${tablePanelOpacity.toFixed(3)}) 0%,rgba(${isPlanetFootball ? "5,7,5" : "7,24,32"},${tablePanelOpacity.toFixed(3)}) 100%);border-top:3px solid ${accentColor};padding:${Math.round(10 * sx)}px ${Math.round(10 * sx)}px ${Math.round(8 * sx)}px;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;backdrop-filter:blur(2px);overflow:hidden}
  .pr-bc-meta{text-align:center;font-size:${Math.round(18 * sx)}px;font-weight:700;color:#94a3b8;margin-bottom:${Math.round(4 * sx)}px}
  .pr-bc-colhead{display:grid;align-items:end;margin-bottom:${Math.round(6 * sx)}px;padding:0 ${Math.round(2 * sx)}px}
  .pr-bc-hcell{font-size:${headFont}px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${accentColor};text-align:center}
  .pr-bc-hcell:first-child{text-align:center}
  .pr-bc-colhead .pr-bc-hcell:nth-child(2){text-align:left;padding-left:${Math.round(6 * sx)}px}
  .pr-bc-rows{flex:1;min-height:0;display:flex;flex-direction:column;gap:${gapPx}px;overflow:hidden}
  .pr-bc-row{display:grid;align-items:stretch;background:rgba(241,245,249,${tableRowAlpha.toFixed(3)});border-radius:${Math.round(4 * sx)}px;overflow:hidden;box-sizing:border-box}
  .pr-bc-cell{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${cellFont}px;color:#0f172a;font-variant-numeric:tabular-nums;padding:${Math.round(6 * sx)}px ${Math.round(4 * sx)}px;box-sizing:border-box}
  .pr-bc-cell--team{justify-content:flex-start;text-align:left;gap:${Math.round(8 * sx)}px;padding-left:${Math.round(10 * sx)}px}
  .pr-bc-cell--pts{font-size:${Math.round(cellFont * 1.08)}px;font-weight:900;color:#0a1f2e}
  .pr-bc-logo{width:${Math.round(36 * sx * fontScale)}px;height:${Math.round(36 * sx * fontScale)}px;object-fit:contain;flex-shrink:0}
  .pr-bc-logo-fallback{width:${Math.round(36 * sx * fontScale)}px;height:${Math.round(36 * sx * fontScale)}px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(14,42,62,.18);border:1px solid rgba(17,37,55,.24);font-size:${Math.round(15 * sx * fontScale)}px;font-weight:900;color:#0f172a;flex-shrink:0}
  .pr-bc-logo-fallback.is-hidden{display:none}
  .pr-bc-no-logos .pr-bc-logo{display:none}
  .pr-bc-no-logos .pr-bc-logo-fallback{display:none}
  .pr-bc-team-txt{font-weight:900;letter-spacing:.02em;text-transform:uppercase;line-height:1.05;max-height:2.1em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .pr-bc-footer{position:absolute;left:0;right:0;bottom:${Math.round(safeY * 0.85)}px;text-align:center;font-size:${Math.round(18 * sx)}px;font-weight:800;letter-spacing:.22em;color:rgba(248,250,252,.72);z-index:4}
  .pr-bc-h2h{display:flex;flex-direction:column;gap:${Math.round(10 * sx)}px}
  .pr-bc-h2h-card{background:rgba(241,245,249,${tableRowAlpha.toFixed(3)});border-radius:${Math.round(6 * sx)}px;padding:${Math.round(14 * sx)}px;border:1px solid rgba(15,42,61,.12)}
  .pr-bc-h2h-card--lead{box-shadow:inset 0 0 0 2px ${highlightColor}}
  .pr-bc-h2h-team{font-size:${Math.round(36 * fontScale * sx)}px;font-weight:900;color:#0f172a;text-transform:uppercase;margin-bottom:${Math.round(8 * sx)}px}
  .pr-bc-h2h-stats{display:grid;grid-template-columns:repeat(${Math.max(2, h2hCore.length)},minmax(0,1fr));gap:${Math.round(8 * sx)}px}
  .pr-bc-h2h-stat{background:rgba(255,255,255,${Math.max(0.5, tableRowAlpha).toFixed(3)});border:1px solid rgba(15,23,42,.08);border-radius:${Math.round(4 * sx)}px;padding:${Math.round(8 * sx)}px;text-align:center}
  .pr-bc-h2h-stat span{display:block;font-size:${Math.round(16 * sx)}px;color:#64748b;font-weight:700}
  .pr-bc-h2h-stat strong{display:block;font-size:${Math.round(26 * sx * fontScale)}px;font-weight:900;color:#0f172a}
  .pr-bc-pos-highleft .pr-bc-lower-inner,.pr-bc-pos-highright .pr-bc-lower-inner{justify-content:flex-start;padding-top:${Math.round(4 * sx)}px}
  .pr-bc-pos-middleleft .pr-bc-lower-inner,.pr-bc-pos-middleright .pr-bc-lower-inner,.pr-bc-pos-left .pr-bc-lower-inner{justify-content:center}
  .pr-bc-pos-lowleft .pr-bc-lower-inner,.pr-bc-pos-lowerleft .pr-bc-lower-inner{justify-content:flex-end}
  .pr-bc-pos-bottomleft .pr-bc-lower-inner,.pr-bc-pos-bottomright .pr-bc-lower-inner{justify-content:flex-end;padding-bottom:${Math.round(28 * sx)}px}
  .pr-bc-pos-center .pr-bc-lower-inner{justify-content:center;margin-left:auto;margin-right:auto}
  .pr-bc-pos-highright .pr-bc-lower-inner,.pr-bc-pos-middleright .pr-bc-lower-inner,.pr-bc-pos-bottomright .pr-bc-lower-inner{margin-left:auto;align-items:stretch}
  .pr-bc-pos-highleft .pr-bc-lower-inner,.pr-bc-pos-middleleft .pr-bc-lower-inner,.pr-bc-pos-lowleft .pr-bc-lower-inner,.pr-bc-pos-lowerleft .pr-bc-lower-inner,.pr-bc-pos-bottomleft .pr-bc-lower-inner,.pr-bc-pos-left .pr-bc-lower-inner{margin-right:auto;align-items:stretch}`;

  const css = `<style>${useBroadcastTableStyle ? tableCss : isTableScene ? legacyTableCss : introCss}</style>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>${css}</head><body style="margin:0">${body}</body></html>`;
}

export function renderHtmlTemplate(templateId: string, data: Data): string {
  const footballHtml = tryRenderFootballTemplate(templateId, data);
  if (footballHtml) return footballHtml;

  const w = Number(data.width ?? 1080);
  const h = Number(data.height ?? 1920);
  const teamLineUpHtml = tryRenderTeamLineUpTemplate(templateId, data, w, h);
  if (teamLineUpHtml) return teamLineUpHtml;

  const teamSheetHtml = tryRenderTeamSheetTemplate(templateId, data, w, h);
  if (teamSheetHtml) return teamSheetHtml;

  const scoreLineHtml = tryRenderScoreLineTemplate(templateId, data, w, h);
  if (scoreLineHtml) return scoreLineHtml;

  const rugbyHtml = renderPlanetRugbyTemplate(templateId, data, w, h);
  if (rugbyHtml) return rugbyHtml;

  switch (templateId) {
    case "news-short-intro":
    case "news-short-content":
    case "news-short-outro":
      return renderNewsShortSlide(templateId, data, w, h);
    case "next-off-intro": {
      const introKicker =
        typeof data.introKicker === "string" && data.introKicker.trim() ? data.introKicker.trim() : "Next off";
      const introAnim = data.animIntro as NextOffIntroFieldAnimations | undefined;
      const distance = typeof data.distance === "string" ? data.distance : "";
      const going = typeof data.going === "string" ? data.going : "";
      const runnersN =
        typeof data.runnersCount === "number" && Number.isFinite(data.runnersCount)
          ? data.runnersCount
          : typeof data.runnersCount === "string"
            ? data.runnersCount
            : "";
      const goingLine =
        going.trim() !== ""
          ? `<p class="muted" style="margin-top:14px;font-size:26px;line-height:1.25;font-weight:600;letter-spacing:0.02em;${esc(
              tplAnimInlineStyle(introAnim?.going),
            )}"><span style="color:#64748b;font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">Going</span> ${esc(going)}</p>`
          : "";
      return wrap(
        "next-off-intro",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker" style="${esc(tplAnimInlineStyle(introAnim?.introKicker))}">${esc(introKicker)}</div>
        <h1 style="${esc(tplAnimInlineStyle(introAnim?.course))}">${esc(data.course)}</h1>
        <p class="odds" style="${esc(tplAnimInlineStyle(introAnim?.raceTime))}">${esc(data.raceTime)}</p>
        ${goingLine}
        <p class="muted" style="margin-top:24px;font-size:28px;${esc(tplAnimInlineStyle(introAnim?.title))}">${esc(data.title)}</p>
        <p class="muted" style="margin-top:16px;font-size:20px;">
          <span style="${esc(tplAnimInlineStyle(introAnim?.distance))}">${esc(distance)}</span>
          <span> · </span>
          <span style="${esc(tplAnimInlineStyle(introAnim?.runnersCount))}">${esc(runnersN)} runners</span>
        </p>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "next-off-tip": {
      const tipSilks = data.silks as RunnerSilks | undefined;
      const baseSilkH = h > 1600 ? 46 : 36;
      const silkH = baseSilkH * 2;
      const silk = raceSilkBadgeHtml(tipSilks, silkH);
      const tipAnim = data.animTip as NextOffTipFieldAnimations | undefined;
      const h1 =
        silk !== ""
          ? `<h1 class="next-off-tip-title" style="display:flex;align-items:center;"><span class="next-off-tip-silk" style="${esc(
              tplAnimInlineStyle(tipAnim?.silks),
            )}">${silk}</span><span class="next-off-tip-horse" style="${esc(tplAnimInlineStyle(tipAnim?.horse))}">${esc(data.horse)}</span></h1>`
          : `<h1 class="next-off-tip-title next-off-tip-title--solo"><span class="next-off-tip-horse" style="${esc(tplAnimInlineStyle(tipAnim?.horse))}">${esc(data.horse)}</span></h1>`;
      const tipKicker =
        typeof data.tipKicker === "string" && data.tipKicker.trim()
          ? String(data.tipKicker).trim()
          : `Tip ${Number(data.index) || 1}`;
      return wrap(
        "next-off-tip",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel fast-intro-panel--next-off-tip">
        <div class="kicker" style="${esc(tplAnimInlineStyle(tipAnim?.sceneKicker))}">${esc(tipKicker)}</div>
        ${h1}
        <p class="odds" style="${esc(tplAnimInlineStyle(tipAnim?.odds))}">${esc(data.odds)}</p>
        <p class="stars" style="margin-top:16px;font-size:36px;${esc(tplAnimInlineStyle(tipAnim?.stars))}">${"★".repeat(Number(data.stars) || 0)}</p>
        <p class="muted" style="margin-top:32px;">${esc(data.course)}</p>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "next-off-outro": {
      const outroKicker =
        typeof data.outroKicker === "string" && data.outroKicker.trim() ? data.outroKicker.trim() : BRAND_HORSE_RACING_MARK;
      const outAnim = data.animOutro as NextOffOutroFieldAnimations | undefined;
      return wrap(
        "next-off-outro",
        `<div class="fast-scene-shell">
        <div class="fast-outro-panel">
        <div class="kicker" style="${esc(tplAnimInlineStyle(outAnim?.outroKicker))}">${esc(outroKicker)}</div>
        <h1 style="color:#eab308;${esc(tplAnimInlineStyle(outAnim?.outroCta))}">${esc(data.cta)}</h1>
        <p class="muted" style="margin-top:24px;font-size:30px;${esc(tplAnimInlineStyle(outAnim?.course))}">${esc(data.course)}</p>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "fast-intro": {
      const introAnim = data.animIntro as FastIntroFieldAnimations | undefined;
      const raceTitle = String(data.title ?? "").trim();
      const dateShown = formatRaceDateLine(data.raceDate);
      const titleBlock =
        raceTitle !== ""
          ? `<p class="fast-intro-race-title" style="${esc(tplAnimInlineStyle(introAnim?.title))}">${esc(raceTitle)}</p>`
          : "";
      const dateBlock =
        dateShown !== ""
          ? `<p class="fast-intro-date" style="${esc(tplAnimInlineStyle(introAnim?.raceDate))}">${esc(dateShown)}</p>`
          : "";
      return wrap(
        "fast-intro",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker" style="${esc(tplAnimInlineStyle(introAnim?.sceneKicker))}">Fast results</div>
        ${titleBlock}
        <h1 style="${esc(tplAnimInlineStyle(introAnim?.course))}">${esc(data.course)}</h1>
        <p class="odds" style="${esc(tplAnimInlineStyle(introAnim?.raceTime))}">${esc(data.raceTime)}</p>
        ${dateBlock}
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "fast-winner": {
      const anim = data.animWinner as FastWinnerFieldAnimations | undefined;
      const ws = data.winnerSilks as RunnerSilks | undefined;
      const silkH = h > 1600 ? 58 : 46;
      const silk = raceSilkBadgeHtml(ws, silkH);
      const winnerName = esc(data.winner);
      const winnerOdds = esc(data.sp);
      const silkBlock =
        silk !== ""
          ? `<span style="${esc(tplAnimInlineStyle(anim?.silks))}">${silk}</span>`
          : "";
      return wrap(
        "fast-winner",
        `<div class="fast-scene-shell">
        <div class="fast-winner-panel">
        <div class="fast-board-list-card">
          <div class="fast-board-row">
            <div class="fast-board-left">
              <span class="fast-board-pos">1.</span>
              ${silkBlock}
              <span class="fast-board-name" style="${esc(tplAnimInlineStyle(anim?.winner))}">${winnerName}</span>
            </div>
            <span class="fast-board-price" style="${esc(tplAnimInlineStyle(anim?.sp))}">${winnerOdds}</span>
          </div>
        </div>
        <p class="muted" style="margin-top:18px;${esc(tplAnimInlineStyle(anim?.course))}">${esc(data.course)}</p>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "fast-placings": {
      const anim = data.animPlacings as FastPlacingsFieldAnimations | undefined;
      const placings =
        (data.placings as { position: number; horse: string; sp: string; silks?: RunnerSilks }[]) ?? [];
      const silkH = h > 1600 ? 116 : 92;
      const rowGap = h > 1600 ? 18 : 14;
      const rows = placings
        .map((p) => {
          const silk = raceSilkBadgeHtml(p.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:${rowGap}px;min-width:0;"><span style="font-weight:800;flex-shrink:0;">${p.position}.</span>${silk}<span style="min-width:0;">${esc(p.horse)}</span></span>`
              : `<span>${p.position}. ${esc(p.horse)}</span>`;
          return `<div class="row">${left}<span class="odds" style="flex-shrink:0;">${esc(p.sp)}</span></div>`;
        })
        .join("");
      return wrap(
        "fast-placings",
        `<div class="fast-scene-shell">
        <div class="fast-placings-stack"><div class="card" style="${esc(tplAnimInlineStyle(anim?.card))}">${rows}</div></div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "fast-outro": {
      const anim = data.animOutro as FastOutroFieldAnimations | undefined;
      return wrap(
        "fast-outro",
        `<div class="fast-scene-shell">
        <div class="fast-outro-panel">
        <div class="kicker" style="${esc(tplAnimInlineStyle(anim?.sceneKicker))}">Stay close</div>
        <h1 style="color:#eab308;${esc(tplAnimInlineStyle(anim?.cta))}">${esc(data.cta)}</h1>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "teamtalk-intro":
      return wrapTeamtalkNews(
        "teamtalk-intro",
        `<div class="tt-intro-wrap">
          <p class="tt-tag">${esc(data.tag)}</p>
          <h1 class="tt-intro-line">${esc(data.hookLine)}</h1>
          <p class="tt-kicker">TEAMtalk News</p>
        </div>`,
        w,
        h,
        data,
      );
    case "teamtalk-main": {
      const lines = Array.isArray(data.headlineLines) ? (data.headlineLines as string[]) : [];
      const boxes = lines
        .map((line) => String(line).trim())
        .filter(Boolean)
        .map((line) => `<div class="tt-line-box">${esc(line)}</div>`)
        .join("");
      const pUrl = typeof data.playerImageUrl === "string" ? data.playerImageUrl.trim() : "";
      const playerBlock = pUrl ? `<img class="tt-player" src="${esc(pUrl)}" alt="" />` : "";
      const lUrl = typeof data.leftClubLogoUrl === "string" ? data.leftClubLogoUrl.trim() : "";
      const rUrl = typeof data.rightClubLogoUrl === "string" ? data.rightClubLogoUrl.trim() : "";
      const leftLogo = lUrl
        ? `<img class="tt-logo-side" src="${esc(lUrl)}" alt="" />`
        : `<div class="tt-logo-side tt-img-ph" aria-hidden="true"></div>`;
      const rightLogo = rUrl
        ? `<img class="tt-logo-side" src="${esc(rUrl)}" alt="" />`
        : `<div class="tt-logo-side tt-img-ph" aria-hidden="true"></div>`;
      const pname = esc(data.playerName);
      return wrapTeamtalkNews(
        "teamtalk-main",
        `<div class="tt-hero">
          <div class="tt-bg-logos">${leftLogo}${rightLogo}</div>
          ${playerBlock ? `<div class="tt-player-wrap">${playerBlock}</div>` : ""}
          ${pname ? `<p class="tt-player-caption">${pname}</p>` : ""}
          <div class="tt-headline-stack">${boxes || `<div class="tt-line-box">HEADLINE</div>`}</div>
          <div class="tt-bar-foot">🔗 ${esc(data.linkCta)}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "teamtalk-detail": {
      const detail = typeof data.secondaryParagraph === "string" ? data.secondaryParagraph : "";
      const compact = detail.replace(/\s+/g, " ").trim().toUpperCase();
      const words = compact.split(" ").filter(Boolean);
      const detailLines: string[] = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > 40 && cur) {
          detailLines.push(cur);
          cur = w;
          if (detailLines.length >= 3) break;
        } else {
          cur = next;
        }
      }
      if (cur && detailLines.length < 3) detailLines.push(cur);
      const bars = (detailLines.length ? detailLines : ["DETAILS COMING SOON"])
        .slice(0, 3)
        .filter(Boolean)
        .map((line) => `<div class="tt-line-box">${esc(line)}</div>`)
        .join("");
      const pUrl = typeof data.playerImageUrl === "string" ? data.playerImageUrl.trim() : "";
      const playerBlock = pUrl ? `<img class="tt-player" src="${esc(pUrl)}" alt="" />` : "";
      const lUrl = typeof data.leftClubLogoUrl === "string" ? data.leftClubLogoUrl.trim() : "";
      const rUrl = typeof data.rightClubLogoUrl === "string" ? data.rightClubLogoUrl.trim() : "";
      const leftLogo = lUrl
        ? `<img class="tt-logo-side" src="${esc(lUrl)}" alt="" />`
        : `<div class="tt-logo-side tt-img-ph" aria-hidden="true"></div>`;
      const rightLogo = rUrl
        ? `<img class="tt-logo-side" src="${esc(rUrl)}" alt="" />`
        : `<div class="tt-logo-side tt-img-ph" aria-hidden="true"></div>`;
      const pname = esc(data.playerName);
      return wrapTeamtalkNews(
        "teamtalk-detail",
        `<div class="tt-hero">
          <div class="tt-bg-logos">${leftLogo}${rightLogo}</div>
          ${playerBlock ? `<div class="tt-player-wrap">${playerBlock}</div>` : ""}
          ${pname ? `<p class="tt-player-caption">${pname}</p>` : ""}
          <div class="tt-headline-stack">${bars}</div>
          <div class="tt-bar-foot">🔗 ${esc(data.linkCta)}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "teamtalk-outro":
      return wrapTeamtalkNews(
        "teamtalk-outro",
        `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:28px;">
          <p class="tt-outro-sub">${esc(data.outroLine)}</p>
        </div>
        <div class="tt-outro-bar">🔗 ${esc(data.linkCta)}</div>`,
        w,
        h,
        data,
      );
    case "f1-grid-intro": {
      const title = esc(data.title ?? "STARTING GRID");
      const sub = esc(data.subtitle ?? "");
      const line = esc(data.introLine ?? "");
      return wrapF1Grid(
        "f1-grid-intro",
        `<div class="f1-intro-center">
          <div class="f1-intro-hero">
            <div class="f1-titles">
              <h1 class="f1-title">${title}</h1>
            </div>
            ${sub ? `<div class="f1-intro-mid"><p class="f1-intro-sub">${sub}</p></div>` : ""}
            ${line ? `<p class="f1-intro-line">${line}</p>` : ""}
          </div>
          <div class="f1-footer">${f1FooterBrandHtml(data)}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "f1-grid-board": {
      const title = esc(data.title ?? "STARTING GRID");
      const sub = esc(data.subtitle ?? "");
      const page = esc(data.pageLabel ?? "1/2");
      const footerHtml = f1FooterBrandHtml(data);
      return wrapF1Grid(
        "f1-grid-board",
        `<div class="f1-head">
          <span style="width:48px"></span>
          <div class="f1-titles">
            <h1 class="f1-title">${title}</h1>
            ${sub ? `<p class="f1-sub">${sub}</p>` : ""}
          </div>
          <span class="f1-page">${page}</span>
        </div>
        <div class="f1-board">${f1GridBoardRows(data)}</div>
        <div class="f1-footer">${footerHtml}</div>`,
        w,
        h,
        data,
      );
    }
    case "f1-grid-outro": {
      const line = esc(data.outroLine ?? "");
      const logoHtml = f1FooterBrandHtml(data);
      return wrapF1Grid(
        "f1-grid-outro",
        `<div class="f1-outro-stack">
          <div class="f1-outro-center">
            ${line ? `<p class="f1-outro-line">${line}</p>` : ""}
          </div>
          <div class="f1-outro-footer-bar">${logoHtml}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "f1-results-intro": {
      const title = esc(data.title ?? "RACE RESULTS");
      const sub = esc(data.subtitle ?? "");
      const line = esc(data.introLine ?? "");
      return wrapF1Grid(
        "f1-results-intro",
        `<div class="f1-intro-center">
          <div class="f1-intro-hero">
            <div class="f1-titles">
              <h1 class="f1-title">${title}</h1>
            </div>
            ${sub ? `<div class="f1-intro-mid"><p class="f1-intro-sub">${sub}</p></div>` : ""}
            ${line ? `<p class="f1-intro-line">${line}</p>` : ""}
          </div>
          <div class="f1-footer">${f1FooterBrandHtml(data)}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "f1-results-board": {
      const title = esc(data.title ?? "RACE RESULTS");
      const sub = esc(data.subtitle ?? "");
      const page = esc(data.pageLabel ?? "1/2");
      const footerHtml = f1FooterBrandHtml(data);
      const board = f1ResultsBoardRows(data, w, h);
      return wrapF1Grid(
        "f1-results-board",
        `<div class="f1-head">
          <span style="width:48px"></span>
          <div class="f1-titles">
            <h1 class="f1-title">${title}</h1>
            ${sub ? `<p class="f1-sub">${sub}</p>` : ""}
          </div>
          <span class="f1-page">${page}</span>
        </div>
        <div class="f1-board f1-board-results" style="${board.boardStyle}">${board.html}</div>
        <div class="f1-footer">${footerHtml}</div>`,
        w,
        h,
        data,
      );
    }
    case "f1-results-outro": {
      const line = esc(data.outroLine ?? "");
      const logoHtml = f1FooterBrandHtml(data);
      const fastest = f1FastestLapHtml(data);
      return wrapF1Grid(
        "f1-results-outro",
        `<div class="f1-outro-stack">
          <div class="f1-outro-center">
            ${line ? `<p class="f1-outro-line">${line}</p>` : ""}
            ${fastest}
          </div>
          <div class="f1-outro-footer-bar">${logoHtml}</div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "rc-intro": {
      const introAnim = data.animIntro as RcIntroFieldAnimations | undefined;
      const raceTitle = String(data.title ?? "").trim();
      const dateShown = formatRaceDateLine(data.raceDate);
      const titleBlock =
        raceTitle !== ""
          ? `<p class="fast-intro-race-title" style="${esc(tplAnimInlineStyle(introAnim?.title))}">${esc(raceTitle)}</p>`
          : "";
      const dateBits: string[] = [];
      if (dateShown !== "") dateBits.push(esc(dateShown));
      if (data.runnersCount != null && String(data.runnersCount).trim() !== "") {
        dateBits.push(`${esc(data.runnersCount)} runners`);
      }
      const metaBlock =
        dateBits.length > 0
          ? `<p class="fast-intro-date" style="${esc(tplAnimInlineStyle(introAnim?.meta))}">${dateBits.join(" · ")}</p>`
          : "";
      return wrap(
        "rc-intro",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker" style="${esc(tplAnimInlineStyle(introAnim?.sceneKicker))}">Race card</div>
        ${titleBlock}
        <h1 style="${esc(tplAnimInlineStyle(introAnim?.course))}">${esc(data.course)}</h1>
        <p class="odds" style="${esc(tplAnimInlineStyle(introAnim?.raceTime))}">${esc(data.raceTime)}</p>
        ${metaBlock}
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "rc-board-grid": {
      const animBoard = data.animBoard as RcBoardGridFieldAnimations | undefined;
      type RcRow = {
        horse: string;
        odds: string;
        number: number;
        jockey?: string;
        trainer?: string;
        form?: string;
        silks?: RunnerSilks;
        draw?: number;
        daysSinceRun?: number;
        officialRating?: number;
        weight?: string;
        status?: string;
        movement?: string;
        movementText?: string;
        sp?: string;
        bestOdds?: string;
        stars?: number;
      };
      const runners = (data.runners as RcRow[]) ?? [];
      const picks = new Set((data.topPicks as string[]) ?? []);
      const pageIndex = Number(data.pageIndex ?? 1);
      const pageCount = Number(data.pageCount ?? 1);
      const footerNote = data.footerNote != null ? String(data.footerNote) : "";
      const n = runners.length;
      const compact = n > 10 ? " rc-dark-board--compact" : "";
      const tight = n > 14 ? " rc-dark-board--tight" : "";
      const silkH = n > 14 ? 44 : n > 10 ? 52 : h > 1600 ? 68 : 56;
      const raceDateShown = formatRaceDateLine(data.raceDate);
      const boardTitleHeadline = `${esc(data.raceTime)} ${esc(data.course)}${
        raceDateShown ? ` · ${esc(raceDateShown)}` : ""
      }`;
      const rows = runners
        .map((r) => {
          const pick = picks.has(r.horse) ? " pick" : "";
          const silk = raceSilkBadgeHtml(r.silks, silkH);
          const silkBlock = silk !== "" ? `<span class="led-silk-wrap">${silk}</span>` : "";
          const jockey = (r.jockey ?? "").trim();
          const trainer = (r.trainer ?? "").trim();
          const jockeyLine = jockey
            ? `<div class="rc-dark-sub">${RC_CLASSIC_CAP_ICON}<span>J: ${esc(jockey)}</span></div>`
            : "";
          const trainerLine = trainer ? `<div class="rc-dark-sub"><span>T: ${esc(trainer)}</span></div>` : "";
          const extra = runnerExtraMetaLine({
            form: r.form,
            draw: r.draw,
            weight: r.weight,
            officialRating: r.officialRating,
            daysSinceRun: r.daysSinceRun,
            status: r.status,
            movement: r.movement,
            movementText: r.movementText,
            odds: r.odds,
            bestOdds: r.bestOdds,
            sp: r.sp,
            stars: r.stars,
          });
          const extraBlock = extra ? `<div class="rc-dark-subtle">${esc(extra)}</div>` : "";
          return `<div class="rc-dark-row${pick}">
            <div class="rc-dark-left">
              <span class="rc-dark-pos">${esc(r.number)}.</span>
              ${silkBlock}
              <div class="rc-dark-main">
                <div class="rc-dark-horse">${esc(r.horse)}</div>
                ${jockeyLine}
                ${trainerLine}
                ${extraBlock}
              </div>
            </div>
            <span class="rc-dark-odds">${esc(r.odds)}</span>
          </div>`;
        })
        .join("");
      const pageMeta =
        pageCount > 1
          ? `<div class="rc-dark-page-meta" style="${esc(tplAnimInlineStyle(animBoard?.pageMeta))}">Page ${pageIndex} / ${pageCount}</div>`
          : "";
      const footBlock = `<div class="rc-dark-footer">${
        footerNote ? `<p class="rc-dark-foot-note">${esc(footerNote)}</p>` : ""
      }<div class="rc-dark-brand">${esc(BRAND_HORSE_RACING_MARK)}</div></div>`;
      const inner = `<div class="led-frame rc-dark-board${compact}${tight}">
          <div class="rc-dark-hdr">
            <div class="rc-dark-board-title" style="${esc(tplAnimInlineStyle(animBoard?.headerTitle))}">${boardTitleHeadline}</div>
            <div class="rc-dark-race-name" style="${esc(tplAnimInlineStyle(animBoard?.raceName))}">${esc(data.title)}</div>
            ${pageMeta}
          </div>
          <div class="led-rows rc-dark-rows">
            <div class="rc-dark-list-card" style="${esc(tplAnimInlineStyle(animBoard?.listCard))}">
              <div class="rc-dark-list-inner">${rows}</div>
            </div>
          </div>
          ${footBlock}
        </div>`;
      return wrapLedBoard(inner, w, h, "rc-board-grid", data);
    }
    case "rc-top-runners": {
      const runners =
        (data.runners as { horse: string; odds: string; number: number; silks?: RunnerSilks }[]) ?? [];
      const picks = new Set((data.topPicks as string[]) ?? []);
      const silkH = h > 1600 ? 68 : 56;
      const rows = runners
        .map((r) => {
          const tag = picks.has(r.horse) ? '<span class="backed" style="font-size:22px;margin-left:12px;">PICK</span>' : "";
          const silk = raceSilkBadgeHtml(r.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:10px;min-width:0;"><span style="font-weight:800;flex-shrink:0;">${r.number}.</span>${silk}<span style="min-width:0;">${esc(r.horse)}${tag}</span></span>`
              : `<span>${r.number}. ${esc(r.horse)}${tag}</span>`;
          return `<div class="row">${left}<span class="odds" style="flex-shrink:0;">${esc(r.odds)}</span></div>`;
        })
        .join("");
      return wrap("rc-top-runners", `<div class="kicker">Key runners</div><div class="card">${rows}</div>`, w, h, data);
    }
    case "rc-odds": {
      const runners =
        (data.runners as { horse: string; odds: string; number: number; silks?: RunnerSilks }[]) ?? [];
      const silkH = h > 1600 ? 68 : 56;
      const rows = runners
        .map((r) => {
          const silk = raceSilkBadgeHtml(r.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:10px;min-width:0;"><span style="font-weight:800;flex-shrink:0;">${r.number}.</span>${silk}<span style="min-width:0;">${esc(r.horse)}</span></span>`
              : `<span>${r.number}. ${esc(r.horse)}</span>`;
          return `<div class="row">${left}<span class="odds" style="flex-shrink:0;">${esc(r.odds)}</span></div>`;
        })
        .join("");
      return wrap("rc-odds", `<div class="kicker">Live odds</div><div class="card">${rows}</div>`, w, h, data);
    }
    case "rc-mover": {
      const anim = data.animMover as RcMoverFieldAnimations | undefined;
      const r = data.runner as {
        horse: string;
        odds: string;
        movementText?: string;
        movement?: string;
        silks?: RunnerSilks;
      };
      const mov = r.movement ?? "steady";
      const cls = mov === "drift" ? "drift" : mov === "backed" ? "backed" : "";
      const silk = raceSilkBadgeHtml(r.silks, h > 1600 ? 80 : 64);
      const title = silk
        ? `<h1 style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;"><span style="${esc(tplAnimInlineStyle(anim?.silks))}">${silk}</span><span style="${esc(tplAnimInlineStyle(anim?.horse))}">${esc(r.horse)}</span></h1>`
        : `<h1 style="${esc(tplAnimInlineStyle(anim?.horse))}">${esc(r.horse)}</h1>`;
      return wrap(
        "rc-mover",
        `<div class="rc-slide-bg-wrap">
        <div class="kicker" style="${esc(tplAnimInlineStyle(anim?.sceneKicker))}">Market mover</div>
        ${title}
        <p class="odds" style="${esc(tplAnimInlineStyle(anim?.odds))}">${esc(r.odds)}</p>
        <p class="${cls}" style="margin-top:20px;font-size:32px;font-weight:700;${esc(tplAnimInlineStyle(anim?.movementText))}">${esc(r.movementText ?? "")}</p>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "rc-cta": {
      const anim = data.animCta as RcCtaFieldAnimations | undefined;
      return wrap(
        "rc-cta",
        `<div class="rc-slide-bg-wrap">
        <div class="kicker" style="${esc(tplAnimInlineStyle(anim?.course))}">${esc(data.course)}</div>
        <h1 style="color:#eab308;${esc(tplAnimInlineStyle(anim?.brand))}">${BRAND_HORSE_RACING_MARK}</h1>
        <p class="muted" style="margin-top:24px;font-size:28px;${esc(tplAnimInlineStyle(anim?.cta))}">${esc(data.cta)}</p>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "social-next-off": {
      const tips =
        (data.tips as { horse: string; odds: string; stars: number; silks?: RunnerSilks }[]) ?? [];
      const silkH = 30;
      const tipRows = tips
        .map((t, i) => {
          const silk = raceSilkBadgeHtml(t.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-weight:800;flex-shrink:0;">${i + 1}.</span>${silk}<span style="min-width:0;">${esc(t.horse)}</span></span>`
              : `<span>${i + 1}. ${esc(t.horse)}</span>`;
          return `<div class="row">${left}<span class="odds" style="flex-shrink:0;">${esc(t.odds)}</span></div>`;
        })
        .join("");
      const titleRaw = typeof data.title === "string" ? data.title.trim() : "";
      const titleLine = titleRaw
        ? `<p class="muted" style="margin-top:10px;font-size:26px;line-height:1.25;font-weight:600;">${esc(titleRaw)}</p>`
        : "";
      const dist = typeof data.distance === "string" ? data.distance.trim() : "";
      const going = typeof data.going === "string" ? data.going.trim() : "";
      const rc = data.runnersCount;
      const runnersPart =
        typeof rc === "number" && Number.isFinite(rc)
          ? `${rc} runners`
          : typeof rc === "string" && rc.trim()
            ? `${rc.trim()} runners`
            : "";
      const metaParts = [dist, going, runnersPart].filter(Boolean);
      const metaLine =
        metaParts.length > 0
          ? `<p class="muted" style="margin-top:${titleLine ? "8px" : "10px"};font-size:22px;line-height:1.35;">${metaParts
              .map((p) => esc(p))
              .join(" · ")}</p>`
          : "";
      return wrap(
        "social-next-off",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker">Next off tips</div>
        <h1 style="font-size:46px;">${esc(data.course)} <span class="odds" style="font-size:46px;">${esc(data.raceTime)}</span></h1>
        ${titleLine}
        ${metaLine}
        <div class="card" style="margin-top:16px;">${tipRows}</div>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "social-fast-results": {
      const placings =
        (data.placings as { position: number; horse: string; sp: string; silks?: RunnerSilks }[]) ?? [];
      const wSilks = data.winnerSilks as RunnerSilks | undefined;
      const winSilk = raceSilkBadgeHtml(wSilks, 168);
      const winLine =
        winSilk !== ""
          ? `<p style="margin:12px 0;font-size:32px;font-weight:700;display:flex;align-items:center;flex-wrap:wrap;gap:28px;">Winner: ${winSilk}<span class="odds">${esc(data.winner)}</span> <span class="muted">SP</span> ${esc(data.sp)}</p>`
          : `<p style="margin:12px 0;font-size:32px;font-weight:700;">Winner: <span class="odds">${esc(data.winner)}</span> <span class="muted">SP</span> ${esc(data.sp)}</p>`;
      const silkH = 28;
      const rows = placings
        .map((p) => {
          const silk = raceSilkBadgeHtml(p.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-weight:800;flex-shrink:0;">${p.position}.</span>${silk}<span style="min-width:0;">${esc(p.horse)}</span></span>`
              : `<span>${p.position}. ${esc(p.horse)}</span>`;
          return `<div class="row">${left}<span class="odds" style="font-size:0.85em;flex-shrink:0;">${esc(p.sp)}</span></div>`;
        })
        .join("");
      return wrap(
        "social-fast-results",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker">Fast results</div>
        <h1 style="font-size:40px;">${esc(data.course)} ${esc(data.raceTime)}</h1>
        ${winLine}
        <div class="card">${rows}</div>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "social-racecard": {
      const runners =
        (data.runners as { horse: string; odds: string; number: number; silks?: RunnerSilks }[]) ?? [];
      const picks = new Set((data.topPicks as string[]) ?? []);
      const layout = data.layout as string | undefined;
      const race = data.race as {
        course: string;
        raceTime: string;
        title: string;
        courseImageUrl?: string;
        raceDate?: string;
      };
      const footerNote = data.footerNote != null ? String(data.footerNote) : "";

      if (layout === "full-board" && runners.length > 0) {
        const hdr = `${esc(race.raceTime)} ${esc(race.course)}`.toUpperCase();
        const sub = `${esc(race.raceTime)} ${esc(race.course)}`;
        const rowPad = runners.length > 14 ? "5px 10px" : "7px 12px";
        const nameSize = runners.length > 18 ? "17px" : runners.length > 12 ? "19px" : "22px";
        const oddsSize = runners.length > 18 ? "17px" : "20px";
        const subLineSize = runners.length > 18 ? "12px" : "13px";
        const silkH = runners.length > 18 ? 44 : runners.length > 12 ? 48 : 52;
        const courseImg =
          typeof race.courseImageUrl === "string" ? race.courseImageUrl.trim() : "";
        const thumb =
          courseImg !== ""
            ? `<div class="rc-classic-thumb-wrap"><img src="${esc(courseImg)}" alt="" /></div>`
            : `<div class="rc-classic-thumb-wrap">${RC_CLASSIC_THUMB_PLACEHOLDER}</div>`;
        const rows = runners
          .map((r) => {
            const pick = picks.has(r.horse) ? " pick" : "";
            const silk = raceSilkBadgeHtml(r.silks, silkH);
            const silkBlock =
              silk !== "" ? `<span class="led-silk-wrap">${silk}</span>` : "";
            const jr = r as { jockey?: string; trainer?: string };
            const jockey = (jr.jockey ?? "").trim();
            const trainer = (jr.trainer ?? "").trim();
            const jockeyLine =
              jockey !== ""
                ? `<div class="rc-classic-jockey" style="font-size:${subLineSize}">${RC_CLASSIC_CAP_ICON}<span>${esc(jockey)}</span></div>`
                : "";
            const trainerLine =
              trainer !== ""
                ? `<div class="rc-classic-trainer" style="font-size:${subLineSize}"><span>${esc(trainer)}</span></div>`
                : "";
            return `<div class="led-row rc-classic-row${pick}" style="padding:${rowPad}">
              <span class="rc-classic-num" style="font-size:${nameSize}">${esc(r.number)}</span>
              ${silkBlock}
              <div class="rc-classic-main">
                <div class="rc-classic-horseline" style="font-size:${nameSize}"><span class="rc-classic-horseline-num">${esc(r.number)}</span>${esc(r.horse)}</div>
                ${jockeyLine}
                ${trainerLine}
              </div>
              <span class="led-odds rc-classic-odds" style="font-size:${oddsSize}">${esc(r.odds)}</span>
            </div>`;
          })
          .join("");
        const raceDateShown = formatRaceDateLine(race.raceDate);
        const board1Facts = `<div class="rc-classic-board1-facts"><span class="rc-classic-board1-race">${esc(race.title)}</span><span class="rc-classic-board1-sep"> — </span><span class="rc-classic-board1-rest">${esc(race.raceTime)} · ${esc(race.course)}${
          raceDateShown ? ` · ${esc(raceDateShown)}` : ""
        }</span></div>`;
        const footBlock = `<div class="rc-classic-footer">${
          footerNote ? `<p class="rc-classic-foot-note">${esc(footerNote)}</p>` : ""
        }<div class="rc-classic-brand">${esc(BRAND_HORSE_RACING_MARK)}</div></div>`;
        const inner = `<div class="led-frame rc-classic-board" style="border-width:0">
            <div class="rc-classic-header">
              ${thumb}
              <div class="rc-classic-hdr-text">
                <div class="rc-classic-hdr-line1">${hdr}</div>
                <div class="rc-classic-hdr-race">${esc(race.title)}</div>
                <div class="rc-classic-hdr-sub">${sub}</div>
              </div>
            </div>
            ${board1Facts}
            <div class="rc-classic-meta"><span></span><span>${runners.length} runners</span></div>
            <div class="led-rows rc-classic-rows">${rows}</div>
            ${footBlock}
          </div>`;
        return wrapLedBoard(inner, w, h, "social-racecard", data);
      }

      const silkH = 60;
      const rows = runners
        .map((r) => {
          const silk = raceSilkBadgeHtml(r.silks, silkH);
          const left =
            silk !== ""
              ? `<span style="display:flex;align-items:center;gap:8px;min-width:0;font-size:22px;"><span style="font-weight:800;flex-shrink:0;">${r.number}.</span>${silk}<span style="min-width:0;">${esc(r.horse)}</span></span>`
              : `<span style="font-size:22px;">${r.number}. ${esc(r.horse)}</span>`;
          return `<div class="row" style="font-size:22px;padding:10px 0;">${left}<span class="odds" style="font-size:26px;flex-shrink:0;">${esc(r.odds)}</span></div>`;
        })
        .join("");
      return wrap(
        "social-racecard",
        `<div class="fast-scene-shell">
        <div class="fast-intro-panel">
        <div class="kicker">Racecard snapshot</div>
        <h1 style="font-size:36px;">${esc(race.course)} ${esc(race.raceTime)}</h1>
        <p class="muted" style="margin:8px 0 12px;">${esc(race.title)}</p>
        <div class="card">${rows}</div>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    case "social-market-mover": {
      const r = data.runner as {
        horse: string;
        odds: string;
        movementText?: string;
        movement?: string;
        silks?: RunnerSilks;
      };
      const race = data.race as { course: string; raceTime: string };
      const mov = r.movement ?? "steady";
      const cls = mov === "drift" ? "drift" : mov === "backed" ? "backed" : "";
      const silk = raceSilkBadgeHtml(r.silks, 40);
      const h1 =
        silk !== ""
          ? `<h1 style="font-size:42px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">${silk}<span>${esc(r.horse)}</span></h1>`
          : `<h1 style="font-size:42px;">${esc(r.horse)}</h1>`;
      return wrap(
        "social-market-mover",
        `<div class="fast-scene-shell">
        <div class="rc-slide-bg-wrap">
        <div class="kicker">Market mover</div>
        ${h1}
        <p class="odds">${esc(r.odds)}</p>
        <p class="${cls}" style="margin-top:16px;font-size:26px;">${esc(r.movementText ?? "")}</p>
        <p class="muted" style="margin-top:20px;">${esc(race.course)} ${esc(race.raceTime)}</p>
        </div>
        </div>`,
        w,
        h,
        data,
      );
    }
    default:
      return wrap("fallback", `<div class="kicker">${BRAND_MARK}</div><h1>${esc(templateId)}</h1>`, w, h, data);
  }
}
