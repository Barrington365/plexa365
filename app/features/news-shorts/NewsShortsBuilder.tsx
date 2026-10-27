"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Panel } from "@/app/components/Panel";
import { VoiceoverControls } from "@/app/features/editor/voiceover/VoiceoverControls";
import { VoiceSettingsPanel } from "@/app/features/editor/voiceover/VoiceSettingsPanel";
import { AiPromptPanel } from "@/app/features/editor/voiceover/AiPromptPanel";
import { firstRunwayTaskOutputUrl } from "@/app/lib/runway-task-output";
import type { RunwayBackgroundPromptResult } from "@/app/lib/runway-background-prompt-types";
import {
  DEFAULT_I2V_RUNWAY_MOTION_FALLBACK,
  DEFAULT_RUNWAY_I2V_MOTION_MASTER_PROMPT,
  MODERATION_SAFE_I2V_MOTION_PROMPT,
} from "@/app/lib/prompts-catalog";
import {
  computeSyncFromScript,
  DEFAULT_VOICEOVER_WPM,
  estimateVoiceoverDurationSec,
  recalculateDurationsFromCaptionLines,
  highlightWordsForCaption,
  sceneSubtitleLineForBurn,
  splitScriptIntoSceneCaptions,
} from "@/app/lib/script-scene-captions";
import {
  type BackingMusicConfig,
  NEWS_SHORT_DEFAULT_STYLE,
  type NewsShortAnimationStyle,
  type NewsShortBackgroundAnimation,
  type NewsShortParseRequest,
  type NewsShortSlide,
  type NewsShortTemplateData,
  type VideoRecordCirclePosition,
  type VideoRecordLayout,
  type VideoRecordOrientation,
} from "@/app/features/news-shorts/types";
import { NEWS_SHORT_HEADLINE_FONT_OPTIONS, resolveNewsShortFontBundle } from "@/app/lib/news-short-fonts";
import type {
  DeliveryStyle,
  ElevenlabsVoiceOption,
  ToneStyle,
  VoicePreset,
  VoiceStyle,
} from "@/app/features/editor/voiceover/types";
import type { VoiceGender } from "@/types";
import {
  motionBackdropRelLooksLikeCameraRecording,
  resolveMotionBackdropRel,
  resolveOutputAudioSource,
} from "@/app/lib/news-shorts-build-sources";
import {
  NEWS_SHORT_MOTION_LETTER_SPACING,
  clampMotionBackdropDimStrength,
  clampMotionBackdropOpaqueOpacity,
  newsShortMotionDimOverlayStyle,
  newsShortMotionOpaqueOverlayStyle,
  newsShortMotionPanelBorder,
  newsShortMotionPanelGradient,
  newsShortMotionTightLineHeight,
} from "@/app/lib/news-short-motion-layout";
import { inferredBackdropPosterRelFromVideo } from "@/app/lib/backdrop-poster-rel";
import {
  generateSocialVideoSeo,
  type SocialVideoSeoInput,
  type SocialVideoSeoTemplate,
  type SocialVideoTone,
} from "@/app/lib/social-video-seo";
import { decodeHtmlEntities } from "@/app/lib/html-entities";
import { buildNewsShortSceneSubtitlePack } from "@/app/lib/news-short-subtitle-pipeline";
import {
  ELEVENLABS_MUSIC_PRESET_OPTIONS,
  MUSIC_ENERGY_OPTIONS,
  MUSIC_MOOD_OPTIONS,
  MUSIC_TEMPO_OPTIONS,
} from "@/app/lib/elevenlabs-music-prompt";
import type { ShortFormEngineExport } from "@/app/features/news-shorts/short-form-engine";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_NEWS_SHORT_BRAND_ID,
  NEWS_SHORTS_BRAND_TEMPLATES,
  getNewsShortBrandTemplateDefinition,
  mergeNewsShortStyleForBrand,
  mergeParsedTemplateWithBrandStyle,
  runwayMotionBrandForNewsShortSourceUrl,
} from "@/app/features/news-shorts/news-shorts-brand-templates";
import type { CreativeVideoFormatId } from "@/app/features/news-shorts/types";
import {
  coerceLayoutPresetForFormat,
  defaultLayoutPresetForFormat,
  layoutPresetsForFormat,
  mergeStyleDefaultsForCreativeFormat,
  normalizeCreativeVideoFormat,
  videoDimensionsForCreativeFormat,
} from "@/app/features/news-shorts/creative-video-format";
import { studioApiPath, withAppPathPrefix } from "@/app/lib/app-base-path";
import { parseApiJson, pollVideoBuildJob } from "@/app/lib/parse-api-json";
import { resolvedPanelTextColorForNewsShort } from "@/app/lib/news-shorts-slide-render-data";

function VideoRecordPreview(props: {
  src: string;
  layout: VideoRecordLayout;
  orientation?: VideoRecordOrientation;
  controls?: boolean;
}) {
  const { src, layout, orientation = "portrait", controls = true } = props;
  const aspectShell =
    orientation === "landscape"
      ? "aspect-video max-h-56"
      : "aspect-[9/16] max-h-64";
  const shell = `mt-1 w-full rounded-lg border border-slate-700 bg-black overflow-hidden ${aspectShell}`;
  if (layout === "full") {
    return (
      <div className={shell}>
        <video controls={controls} playsInline className="h-full w-full object-cover" src={src} />
      </div>
    );
  }
  if (layout === "half") {
    return (
      <div className={`${shell} relative`}>
        <video
          controls={controls}
          playsInline
          className="absolute left-0 top-0 h-1/2 w-full object-cover"
          src={src}
        />
        <div className="pointer-events-none absolute bottom-0 left-0 h-1/2 w-full bg-black" aria-hidden />
      </div>
    );
  }
  return (
    <div className={`${shell} relative bg-black`}>
      <video
        controls={controls}
        playsInline
        className="absolute right-5 top-1/2 z-10 h-28 w-28 -translate-y-1/2 rounded-full object-cover border-2 border-white shadow-md"
        src={src}
      />
    </div>
  );
}

type ParseResponse = {
  ok: true;
  template: NewsShortTemplateData;
  ffmpegPlan: unknown;
  importedLibraryImageRel?: string;
};

type RenderBuildResponse = {
  ok: true;
  contentId: string;
  images: Array<{ sceneId: string; path: string }>;
  audioPath?: string;
  videoPath: string;
  videoRel: string;
  srtPath: string;
  /** Styled ASS burned into video when “replace slide text” is on. */
  assPath?: string;
  concatPath: string;
  /** Confirmed by server from request priority rules */
  audioSource?: "voiceRecording" | "tts" | "videoAudio";
  motionBackdropSource?: "camera" | "backgroundVideo" | "none";
  seo?: SocialVideoSeoTemplate;
  /** Vertical short-form engine export (layers, scenes, audio) — same as sidecar JSON on disk */
  engine?: ShortFormEngineExport;
  engineRel?: string;
};

type RenderOnlyResponse = {
  ok: true;
  contentId: string;
  images: Array<{ sceneId: string; path: string; rel?: string }>;
  /** True when PNGs were rendered with headline/subline hidden for ASS burn (last Render / Build). */
  usedAssOverlay?: boolean;
};

type RenderScenesApiResponse = {
  /** Canonical id (matches news-shorts build / disk paths). */
  contentId?: string;
  images: Array<{ sceneId: string; path: string; rel?: string; underlayPath?: string; underlayRel?: string }>;
};

type TaskJson = {
  status?: string;
  failure?: string;
  progress?: number;
  error?: string;
  output?: unknown;
};

/** Runway returns PENDING / THROTTLED while a task waits in queue (especially at concurrency limits). */
function RunwayTaskQueueHint(props: { status?: string; modality: "video" | "image" }) {
  const { status, modality } = props;
  if (status === "THROTTLED") {
    return (
      <p className="mt-2 text-[10px] leading-relaxed text-amber-200/90">
        <strong className="text-amber-100">Throttled</strong>
        {" — "}
        {modality === "video"
          ? "Runway stored this job but has not started it yet because your organization is at its concurrent video limit (image→video shares that pool with text→video and similar). It should advance automatically in submission order — you do not need to resubmit."
          : "Runway stored this job but has not started it yet because your organization is at its concurrent image limit. It should advance automatically — you do not need to resubmit."}{" "}
        This page polls every 5s. See{" "}
        <a
          href="https://docs.dev.runwayml.com/usage/tiers/"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[#86efac] underline"
        >
          API usage tiers and limits
        </a>
        .
      </p>
    );
  }
  if (status === "PENDING") {
    return (
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        <strong className="text-slate-400">Pending</strong> — queued and waiting to start. Status updates every 5 seconds.
      </p>
    );
  }
  return null;
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

function parseHeroApiFileRel(hero: string): string | null {
  if (!hero.includes("api/file") || typeof window === "undefined") return null;
  try {
    const u = new URL(hero, window.location.origin);
    const rel = u.searchParams.get("rel");
    return rel?.trim() || null;
  } catch {
    return null;
  }
}

const lime = "#b7ff1a";
const uiInput = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";
const uiLabel = "block text-[11px] font-semibold uppercase tracking-wide text-slate-400";
const PREVIEW_FRAME = "mx-auto aspect-[9/16] w-full max-w-sm max-h-[min(70vh,720px)]";
const ARTICLE_REWRITE_DEFAULT_PROMPT = `Rewrite this article for a sports news short.
Constraints:
- Use British English.
- Keep facts, names, numbers, clubs, and timelines consistent with the original input.
- Do not invent new details or new sources.
- Pick a body paragraph count that fits the story: fewer beats for a punchy reel, more for a fuller explainer (each paragraph becomes one template slide between intro and outro). You can say e.g. "5 beats" in your instructions to target length.

Rewrite what we use in the template: headline/title, strapline (deck line), and a tighter set of body paragraphs.
Return a JSON response with: title, strapline, bodyParagraphs, keyQuotes.`;

/** ElevenLabs premade *George* (Warm, Captivating Storyteller) — default News Shorts TTS. */
const DEFAULT_NEWS_SHORTS_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Legacy auto-labels like "BEAT 3" — omit kicker line on content slides. */
function newsShortContentKicker(raw: unknown): string {
  const t = String(raw ?? "").trim();
  return /^beat\s+\d+$/i.test(t) ? "" : t;
}

function withHighlights(
  text: string,
  highlights: string[],
  color: string,
  highlightFontWeight = 900,
  baseFontWeight = 900,
  baseTextColor = "#ffffff",
): ReactNode[] {
  const set = new Set(highlights.map((h) => h.trim().toLowerCase()));
  const words = splitWords(text);
  return words.map((w, i) => {
    const norm = w.replace(/[^\w-]/g, "").toLowerCase();
    const active = set.has(norm);
    return (
      <span
        key={`${w}-${i}`}
        style={
          active
            ? { color, fontWeight: highlightFontWeight }
            : { color: baseTextColor, fontWeight: baseFontWeight }
        }
      >
        {w}
        {i < words.length - 1 ? " " : ""}
      </span>
    );
  });
}

/** Render / Build complete panels — copy matches Scene subtitles when ASS burn + replace are on. */
function AssBurnModeOutputNotice(props: { tone: "sky" | "emerald" }) {
  const shell =
    props.tone === "sky"
      ? "border-sky-400/35 bg-sky-950/50 text-slate-200"
      : "border-emerald-400/35 bg-emerald-950/40 text-slate-200";
  const heading = props.tone === "sky" ? "text-sky-100" : "text-emerald-100";
  return (
    <div className={`mt-2 rounded border ${shell} p-2 text-[11px] leading-snug`}>
      <p className={`font-semibold ${heading}`}>Burn subtitles into video (FFmpeg)</p>
      <p className={`mt-1 font-semibold ${heading}`}>Replace slide headline/subline with styled subtitles (ASS)</p>
      <p className="mt-1 font-normal text-slate-300">
        Hides text on PNG slides and burns ASS that follows your Style panel (font size, panel and highlight
        colours), at about double slide font size for legibility on video. Render scenes again after toggling.
      </p>
    </div>
  );
}

function CreativeStudioSafeZoneOverlay(props: { format: CreativeVideoFormatId }) {
  const { format } = props;
  if (format === "shorts_vertical") {
    return (
      <div className="pointer-events-none absolute inset-0 z-[20]" aria-hidden>
        <div className="absolute inset-x-[5%] top-[11%] bottom-[17%] rounded-lg border border-dashed border-emerald-400/35" />
      </div>
    );
  }
  if (format === "portrait_video") {
    return (
      <div className="pointer-events-none absolute inset-0 z-[20]" aria-hidden>
        <div className="absolute inset-x-[4%] top-[8%] bottom-[24%] rounded-md border border-dashed border-sky-400/35" />
        <div className="absolute inset-x-[8%] bottom-[14%] h-[18%] rounded border border-dashed border-amber-300/30" />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[20]" aria-hidden>
      <div className="absolute inset-x-[4%] top-[9%] bottom-[20%] rounded-lg border border-dashed border-violet-400/35" />
    </div>
  );
}

function PreviewSlide({
  slide,
  style,
  brandTemplateId,
  imageUrl,
  backdropVideoSrc,
  hideLabel,
  hideSubline,
  motionDimStrength = 1,
  motionOpaqueOpacity = 0.3,
  creativeVideoFormat = "shorts_vertical",
}: {
  slide: NewsShortSlide;
  style: NewsShortTemplateData["style"];
  brandTemplateId?: string;
  imageUrl: string;
  /** Motion backdrop (same rel as render/build) — shown behind hero still when set. */
  backdropVideoSrc?: string;
  hideLabel?: boolean;
  hideSubline?: boolean;
  /** Scales dim + panel gradients (`template.style.motionBackdropDimStrength`). */
  motionDimStrength?: number;
  /** Uniform black wash over motion (`template.style.motionBackdropOpaqueOpacity`). */
  motionOpaqueOpacity?: number;
  creativeVideoFormat?: CreativeVideoFormatId;
}) {
  const bgAnimStyle: React.CSSProperties =
    slide.backgroundAnimation === "none"
      ? {}
      : slide.backgroundAnimation === "pan-left"
        ? { animation: "ns-preview-pan-left 10s ease-in-out infinite alternate" }
        : slide.backgroundAnimation === "pan-right"
          ? { animation: "ns-preview-pan-right 10s ease-in-out infinite alternate" }
          : slide.backgroundAnimation === "float"
            ? { animation: "ns-preview-float 6s ease-in-out infinite alternate" }
            : { animation: "ns-preview-zoom 8s ease-in-out infinite alternate" };

  const fgAnimStyle: React.CSSProperties =
    slide.animationStyle === "none"
      ? {}
      : slide.animationStyle === "slide-up"
        ? { animation: "ns-preview-slide-up 600ms ease-out both" }
        : slide.animationStyle === "soft-pop"
          ? { animation: "ns-preview-soft-pop 550ms ease-out both" }
          : { animation: "ns-preview-fade-up 500ms ease-out both" };

  const fontBundle = resolveNewsShortFontBundle(style.headlineFont);
  const headlineFontWeight = style.headlineFont === "bebas-neue" ? 400 : 900;
  const highlightFontWeight = style.headlineFont === "bebas-neue" ? 700 : 900;
  const panelTextPx = Math.max(22, style.fontSize / 2.7);
  const motionBackdrop = Boolean(backdropVideoSrc);
  const tightLh = newsShortMotionTightLineHeight(style.lineHeight);
  const dimK = clampMotionBackdropDimStrength(motionDimStrength);
  const opaqueK = clampMotionBackdropOpaqueOpacity(motionOpaqueOpacity);
  const panelText = resolvedPanelTextColorForNewsShort({ style, brandTemplateId }) ?? "#ffffff";
  const topFrom = style.topAccentFrom ?? "#7dd300";
  const topTo = style.topAccentTo ?? "#d0ff3a";

  const aspectClass = creativeVideoFormat === "landscape_video" ? "aspect-video" : "aspect-[9/16]";
  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 ${aspectClass}`}>
      <style>{`
        @keyframes ns-preview-zoom { from { transform: scale(${Math.max(1, slide.backgroundZoom - 0.03).toFixed(3)}); } to { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}); } }
        @keyframes ns-preview-pan-left { from { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateX(1.5%); } to { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateX(-1.5%); } }
        @keyframes ns-preview-pan-right { from { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateX(-1.5%); } to { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateX(1.5%); } }
        @keyframes ns-preview-float { from { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateY(1.5%); } to { transform: scale(${Math.max(1, slide.backgroundZoom).toFixed(3)}) translateY(-1.5%); } }
        @keyframes ns-preview-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ns-preview-slide-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ns-preview-soft-pop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      {backdropVideoSrc ? (
        <video
          src={backdropVideoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : null}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: `scale(${slide.backgroundZoom})`,
            ...bgAnimStyle,
          }}
        />
      ) : !backdropVideoSrc ? (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-950" />
      ) : null}
      {motionBackdrop ? (
        <>
          <div className="absolute inset-0 z-[1]" style={newsShortMotionOpaqueOverlayStyle(opaqueK)} />
          <div className="absolute inset-0 z-[2]" style={newsShortMotionDimOverlayStyle(dimK)} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${style.overlayOpacity})` }} />
      )}
      <div
        className="absolute left-0 right-0 top-0 z-[3] h-2"
        style={{ background: `linear-gradient(to right, ${topFrom}, ${topTo})` }}
      />
      {motionBackdrop ? (
        <div
          className="pointer-events-none absolute left-1/2 z-[4] text-white/40"
          style={{ top: "9%", transform: "translateX(-50%)", fontSize: `${Math.round(panelTextPx * 1.35)}px`, fontWeight: 900, lineHeight: 1, fontFamily: fontBundle.cssFontFamily }}
        >
          “
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-[5] flex flex-col">
        <div
          className="w-full rounded-t-xl p-4"
          style={{
            background: motionBackdrop ? newsShortMotionPanelGradient(dimK) : style.panelColor,
            lineHeight: motionBackdrop ? tightLh : style.lineHeight,
            border: motionBackdrop ? newsShortMotionPanelBorder() : undefined,
            ...fgAnimStyle,
          }}
        >
          <div
            style={{
              maxWidth: `${style.textBoxWidthPct}%`,
              margin: "0 auto",
              textAlign: motionBackdrop ? "center" : undefined,
            }}
          >
            {!hideLabel ? (() => {
              const kicker =
                slide.type === "intro"
                  ? style.introLabel
                  : slide.type === "outro"
                    ? style.outroLabel
                    : newsShortContentKicker(slide.label);
              const kickerTrim = String(kicker ?? "").trim();
              return kickerTrim ? (
                <p
                  className="mb-2 font-black tracking-[0.18em]"
                  style={{
                    fontSize: `${panelTextPx}px`,
                    lineHeight: style.lineHeight,
                    fontFamily: fontBundle.cssFontFamily,
                    color: panelText,
                  }}
                >
                  {decodeHtmlEntities(kickerTrim)}
                </p>
              ) : null;
            })() : null}
            <p
              className="uppercase"
              style={{
                fontSize: `${panelTextPx}px`,
                lineHeight: motionBackdrop ? tightLh : style.lineHeight,
                letterSpacing: motionBackdrop ? NEWS_SHORT_MOTION_LETTER_SPACING : undefined,
                fontFamily: fontBundle.cssFontFamily,
                fontWeight: headlineFontWeight,
                color: panelText,
              }}
            >
              {withHighlights(
                decodeHtmlEntities(slide.headline).toUpperCase(),
                slide.highlightWords,
                style.highlightColor || lime,
                highlightFontWeight,
                headlineFontWeight,
                panelText,
              )}
            </p>
            {!hideSubline && slide.subline ? (
              <p
                className="mt-2 uppercase"
                style={{
                  fontSize: `${panelTextPx}px`,
                  lineHeight: motionBackdrop ? tightLh : style.lineHeight,
                  letterSpacing: motionBackdrop ? NEWS_SHORT_MOTION_LETTER_SPACING : undefined,
                  fontFamily: fontBundle.cssFontFamily,
                  fontWeight: headlineFontWeight,
                  color: panelText,
                }}
              >
                {withHighlights(
                  decodeHtmlEntities(slide.subline).toUpperCase(),
                  slide.highlightWords,
                  style.highlightColor || lime,
                  highlightFontWeight,
                  headlineFontWeight,
                  panelText,
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function csvToWords(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordsToCsv(values: string[]): string {
  return values.join(", ");
}

function defaultBackingMusic(): BackingMusicConfig {
  return {
    enabled: false,
    sourceType: "uploaded",
    assetRel: "",
    volume: 0.18,
    ducking: true,
    duckStrength: 0.55,
    duckAttackMs: 80,
    duckReleaseMs: 350,
    duckUnderNarration: true,
    duckUnderClipAudio: true,
    loop: true,
    fadeInMs: 300,
    fadeOutMs: 800,
    trimStartMs: 0,
    trimEndMs: undefined,
    offsetMs: 0,
  };
}

function defaultSeoInputFromTemplate(template: NewsShortTemplateData, manualKeywords: string): SocialVideoSeoInput {
  const tagPool = [...(template.tags ?? []), ...csvToWords(manualKeywords)];
  return {
    headline: template.title || "",
    article_url: template.sourceUrl || "",
    article_text: (template.articleBody ?? []).join(" "),
    main_topic: tagPool[0] || "F1 news",
    entities: tagPool.slice(0, 6),
    event: tagPool[1] || template.title || "latest update",
    publish_date: template.publishDate || "",
    tone: "analysis",
  };
}

function relFromRenderedPath(pathValue?: string): string | undefined {
  if (!pathValue) return undefined;
  const normalized = pathValue.replace(/\\/g, "/");
  const marker = "/output/";
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) return normalized.slice(idx + marker.length);
  return undefined;
}

function deriveRunwaySceneHintFromTemplate(template: NewsShortTemplateData): string {
  const firstHeadline = template.slides.find((slide) => slide.headline.trim())?.headline.trim();
  if (firstHeadline) return firstHeadline.slice(0, 120);
  return (template.title || "social short").slice(0, 120);
}

const INITIAL_BRAND_ENTRY = getNewsShortBrandTemplateDefinition(DEFAULT_NEWS_SHORT_BRAND_ID)!;
const INITIAL_NEWS_SHORT_TEMPLATE = INITIAL_BRAND_ENTRY.buildTemplate();
const INITIAL_BRAND_BACKDROP_REL = INITIAL_BRAND_ENTRY.defaultBackgroundVideoRel ?? "";

export function NewsShortsBuilder() {
  const [sourceType, setSourceType] = useState<"url" | "rss">("url");
  const [selectedBrandTemplateId, setSelectedBrandTemplateId] = useState(DEFAULT_NEWS_SHORT_BRAND_ID);
  const [articleUrl, setArticleUrl] = useState(INITIAL_NEWS_SHORT_TEMPLATE.sourceUrl);
  const [feedUrl, setFeedUrl] = useState(INITIAL_BRAND_ENTRY.rssFeedPlaceholder);
  const [rssItemUrl, setRssItemUrl] = useState("");
  const [rssTitleHint, setRssTitleHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [parseDone, setParseDone] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState<NewsShortTemplateData>(INITIAL_NEWS_SHORT_TEMPLATE);
  const [ffmpegPlan, setFfmpegPlan] = useState<unknown>(null);
  const [articleRewriteBusy, setArticleRewriteBusy] = useState(false);
  const [articleRewriteError, setArticleRewriteError] = useState<string | null>(null);
  const [articleRewritePromptOpen, setArticleRewritePromptOpen] = useState(false);
  const [articleRewritePrompt, setArticleRewritePrompt] = useState(ARTICLE_REWRITE_DEFAULT_PROMPT);
  const [articleRewritePromptSaved, setArticleRewritePromptSaved] = useState(ARTICLE_REWRITE_DEFAULT_PROMPT);
  const [articleRewriteVersions, setArticleRewriteVersions] = useState<{
    versionA?: NewsShortTemplateData;
    versionB?: NewsShortTemplateData;
    versionC?: NewsShortTemplateData;
    ffmpegPlanA?: unknown;
    ffmpegPlanB?: unknown;
    ffmpegPlanC?: unknown;
  }>({});
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildPhase, setBuildPhase] = useState<string | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [buildResult, setBuildResult] = useState<RenderBuildResponse | null>(null);
  const [renderResult, setRenderResult] = useState<RenderOnlyResponse | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [voiceoverOpen, setVoiceoverOpen] = useState(false);
  const [backgroundVideoOpen, setBackgroundVideoOpen] = useState(false);
  const [backgroundBeforeOpen, setBackgroundBeforeOpen] = useState(false);
  const [backdropLibraryKind, setBackdropLibraryKind] = useState<null | "image" | "video">(null);
  const [backdropLibraryData, setBackdropLibraryData] = useState<{ videos: string[]; images: string[] } | null>(null);
  const [backdropLibraryBusy, setBackdropLibraryBusy] = useState(false);
  const [libraryBrowseQuery, setLibraryBrowseQuery] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  /** Master toggle for slide editor, voice, Runway, style, draft, JSON, etc. */
  const [otherTemplatesOpen, setOtherTemplatesOpen] = useState(true);
  const [previewSlideId, setPreviewSlideId] = useState(INITIAL_NEWS_SHORT_TEMPLATE.slides[0]?.id ?? "slide-1");
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  /** When true with burn on, PNGs omit headline/subline; FFmpeg burns ASS styled like slides. */
  const [burnSubtitlesReplaceSlideText, setBurnSubtitlesReplaceSlideText] = useState(true);
  const [subtitlesSyncMsg, setSubtitlesSyncMsg] = useState("");
  const [contentId, setContentId] = useState(`news-${Date.now()}`);
  const [voiceoverScript, setVoiceoverScript] = useState("");
  const [manualKeywords, setManualKeywords] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [seoInput, setSeoInput] = useState<SocialVideoSeoInput>(() =>
    defaultSeoInputFromTemplate(INITIAL_NEWS_SHORT_TEMPLATE, ""),
  );
  const [seoTemplate, setSeoTemplate] = useState<SocialVideoSeoTemplate>(() =>
    generateSocialVideoSeo(defaultSeoInputFromTemplate(INITIAL_NEWS_SHORT_TEMPLATE, "")),
  );
  const [seoTone, setSeoTone] = useState<SocialVideoTone>("analysis");
  const [seoCopyMsg, setSeoCopyMsg] = useState("");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("Journalist");
  const [deliveryStyle, setDeliveryStyle] = useState<DeliveryStyle>("Balanced");
  const [tone, setTone] = useState<ToneStyle>("Neutral");
  const [optimiseForVoiceover, setOptimiseForVoiceover] = useState(true);
  const [addEmphasis, setAddEmphasis] = useState(true);
  const [voicePreset, setVoicePreset] = useState<VoicePreset>("Male - Broadcast");
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("male");
  const [voiceSpeed, setVoiceSpeed] = useState(1.3);
  const [voiceSettingsMsg, setVoiceSettingsMsg] = useState("");
  const [voiceSettingsSavedAt, setVoiceSettingsSavedAt] = useState<number | null>(null);
  const [voiceRecordOpen, setVoiceRecordOpen] = useState(false);
  const [voiceRecordAuthorName, setVoiceRecordAuthorName] = useState("");
  /** Server path under output, e.g. `audio/{contentId}-voice-record.webm` — build uses this instead of ElevenLabs TTS. */
  const [voiceRecordingRel, setVoiceRecordingRel] = useState<string | null>(null);
  const [voiceRecordBusy, setVoiceRecordBusy] = useState(false);
  const [voiceRecordError, setVoiceRecordError] = useState<string | null>(null);
  const [voiceRecordSavedAt, setVoiceRecordSavedAt] = useState<number | null>(null);
  /** Saved camera clip rel (`uploads/.../camera-record.*`) — backdrop uses this file. */
  const [videoRecordingRel, setVideoRecordingRel] = useState<string | null>(null);
  const [videoRecordAuthorName, setVideoRecordAuthorName] = useState("");
  const [videoRecordSavedAt, setVideoRecordSavedAt] = useState<number | null>(null);
  /** Orientation of the clip on disk (set when saved); used for preview if UI toggle changes later. */
  const [videoRecordCaptureOrientation, setVideoRecordCaptureOrientation] = useState<VideoRecordOrientation | null>(
    null,
  );
  const [videoRecordLayout, setVideoRecordLayout] = useState<VideoRecordLayout>("full");
  const [videoRecordCirclePosition, setVideoRecordCirclePosition] =
    useState<VideoRecordCirclePosition>("middle-right");
  const [videoRecordOrientation, setVideoRecordOrientation] = useState<VideoRecordOrientation>("portrait");
  /** When set, final MP4 uses the backdrop clip’s audio instead of TTS / voice recording. */
  const [useVideoAudio, setUseVideoAudio] = useState(false);
  const [backingMusicOpen, setBackingMusicOpen] = useState(false);
  const [backingMusic, setBackingMusic] = useState<BackingMusicConfig>(() => defaultBackingMusic());
  const [musicLibraryBusy, setMusicLibraryBusy] = useState(false);
  const [musicLibrary, setMusicLibrary] = useState<string[]>([]);
  const [musicUploadBusy, setMusicUploadBusy] = useState(false);
  const [musicMsg, setMusicMsg] = useState("");
  const [musicGenPreset, setMusicGenPreset] = useState("breaking-news");
  const [musicGenMood, setMusicGenMood] = useState("neutral");
  const [musicGenEnergy, setMusicGenEnergy] = useState("medium");
  const [musicGenTempo, setMusicGenTempo] = useState("moderate");
  const [musicGenGenre, setMusicGenGenre] = useState("");
  const [musicGenExtra, setMusicGenExtra] = useState("");
  const [musicGenLengthSec, setMusicGenLengthSec] = useState(30);
  const [musicGenInstrumental, setMusicGenInstrumental] = useState(true);
  const [musicGenSaveLibrary, setMusicGenSaveLibrary] = useState(false);
  const [musicGenerateBusy, setMusicGenerateBusy] = useState(false);
  const [voiceRecStatus, setVoiceRecStatus] = useState<"idle" | "recording" | "stopped">("idle");
  const [voiceLocalBlob, setVoiceLocalBlob] = useState<Blob | null>(null);
  const [localVoicePreviewUrl, setLocalVoicePreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const [videoRecordOpen, setVideoRecordOpen] = useState(false);
  const [videoRecordBusy, setVideoRecordBusy] = useState(false);
  const [videoRecordError, setVideoRecordError] = useState<string | null>(null);
  const [videoRecStatus, setVideoRecStatus] = useState<"idle" | "recording" | "stopped">("idle");
  const [videoLocalBlob, setVideoLocalBlob] = useState<Blob | null>(null);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string | null>(null);
  const videoMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRecordChunksRef = useRef<Blob[]>([]);
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<ElevenlabsVoiceOption[]>([]);
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState(DEFAULT_NEWS_SHORTS_ELEVENLABS_VOICE_ID);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<{
    totalDefaults: number;
    labelledDefaults: number;
    unlabelledDefaults: number;
    unlabelledVoiceNames: string[];
    myVoicesCount?: number;
  } | null>(null);
  const [voiceProviderStatus, setVoiceProviderStatus] = useState<string | null>(null);
  const [improveBusy, setImproveBusy] = useState(false);
  const [voiceVersions, setVoiceVersions] = useState<{ versionA?: string; versionB?: string; versionC?: string }>({});
  const [previousScript, setPreviousScript] = useState("");
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [backgroundImageRel, setBackgroundImageRel] = useState("");
  const [backgroundVideoRel, setBackgroundVideoRel] = useState(INITIAL_BRAND_BACKDROP_REL);
  const [backgroundVideoFrameRel, setBackgroundVideoFrameRel] = useState(() =>
    INITIAL_BRAND_BACKDROP_REL
      ? inferredBackdropPosterRelFromVideo(INITIAL_BRAND_BACKDROP_REL)
      : "",
  );
  const [runwayScene, setRunwayScene] = useState("");
  const [runwayMood, setRunwayMood] = useState("energetic");
  const [runwayDurationSec, setRunwayDurationSec] = useState(8);
  const [runwayPromptText, setRunwayPromptText] = useState("");
  const [runwayAiPackage, setRunwayAiPackage] = useState<RunwayBackgroundPromptResult | null>(null);
  const [runwayAiBusy, setRunwayAiBusy] = useState(false);
  const [runwayAiError, setRunwayAiError] = useState<string | null>(null);
  const [runwayTaskId, setRunwayTaskId] = useState<string | null>(null);
  const [runwayTaskJson, setRunwayTaskJson] = useState<TaskJson | null>(null);
  const [runwayBusy, setRunwayBusy] = useState(false);
  const [runwayError, setRunwayError] = useState<string | null>(null);
  const [runwayImportBusy, setRunwayImportBusy] = useState(false);
  const [pendingBackdropSave, setPendingBackdropSave] = useState(false);
  const [saveBackdropBusy, setSaveBackdropBusy] = useState(false);
  const [previewVideoError, setPreviewVideoError] = useState(false);
  /** Runway Gen-4.5 image → video (separate task from text-to-video background). */
  const [i2vOpen, setI2vOpen] = useState(false);
  const [i2vImageUrl, setI2vImageUrl] = useState("");
  const [i2vImageDataUri, setI2vImageDataUri] = useState<string | null>(null);
  const [i2vPromptText, setI2vPromptText] = useState("");
  const [i2vDurationSec, setI2vDurationSec] = useState(8);
  const [i2vTaskId, setI2vTaskId] = useState<string | null>(null);
  const [i2vTaskJson, setI2vTaskJson] = useState<TaskJson | null>(null);
  const [i2vBusy, setI2vBusy] = useState(false);
  const [i2vError, setI2vError] = useState<string | null>(null);
  const [i2vImportBusy, setI2vImportBusy] = useState(false);
  const [i2vPreviewVideoError, setI2vPreviewVideoError] = useState(false);
  const [i2vAiBusy, setI2vAiBusy] = useState(false);
  const [i2vAiError, setI2vAiError] = useState<string | null>(null);
  /** When the I2V still uses the on-disk library file from parse (refetch on draft load). */
  const [i2vParseImageRel, setI2vParseImageRel] = useState<string | null>(null);
  /** Long-form brief for OpenAI when using “Build AI motion prompt” (shaped into the Runway motion line). */
  const [i2vMotionBuilderPrompt, setI2vMotionBuilderPrompt] = useState(DEFAULT_RUNWAY_I2V_MOTION_MASTER_PROMPT);
  const i2vMotionMasterCatalogRef = useRef(DEFAULT_RUNWAY_I2V_MOTION_MASTER_PROMPT);
  const i2vModerationSafeResolvedRef = useRef(MODERATION_SAFE_I2V_MOTION_PROMPT);
  /** Runway `/v1/text_to_image` (Gen-4 Image / Turbo). */
  const [t2iOpen, setT2iOpen] = useState(false);
  const [t2iPromptText, setT2iPromptText] = useState("");
  const [t2iModel, setT2iModel] = useState<"gen4_image_turbo" | "gen4_image">("gen4_image_turbo");
  const [t2iRatio, setT2iRatio] = useState<"1080:1920" | "720:1280" | "1920:1080" | "1280:720">("1080:1920");
  const [t2iTaskId, setT2iTaskId] = useState<string | null>(null);
  const [t2iTaskJson, setT2iTaskJson] = useState<TaskJson | null>(null);
  const [t2iBusy, setT2iBusy] = useState(false);
  const [t2iError, setT2iError] = useState<string | null>(null);
  const [t2iImportBusy, setT2iImportBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");

  const applyGlobalBackdropImageRel = useCallback((rel: string) => {
    setBackgroundImageRel(rel);
    // Background (before render) allows one source only.
    setBackgroundVideoRel("");
    setBackgroundVideoFrameRel("");
  }, []);

  const applyGlobalBackdropVideoRel = useCallback((videoRel: string, frameRel?: string) => {
    setBackgroundVideoRel(videoRel);
    setBackgroundVideoFrameRel(frameRel || inferredBackdropPosterRelFromVideo(videoRel));
    // Background (before render) allows one source only.
    setBackgroundImageRel("");
  }, []);

  const searchParams = useSearchParams() ?? new URLSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const v = searchParams.get("backdropVideo")?.trim();
    const img = searchParams.get("backdropImage")?.trim();
    if (!v && !img) return;

    if (v) {
      applyGlobalBackdropVideoRel(v, inferredBackdropPosterRelFromVideo(v));
      setVideoRecordingRel(null);
      setVideoRecordCaptureOrientation(null);
      setBackgroundVideoOpen(true);
      setBackgroundBeforeOpen(true);
    }
    if (img) {
      applyGlobalBackdropImageRel(img);
      setBackgroundBeforeOpen(true);
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("backdropVideo");
    next.delete("backdropImage");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, applyGlobalBackdropImageRel, applyGlobalBackdropVideoRel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prompts");
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const rows = (data.builtin ?? []) as Array<{ id: string; body?: string; catalogBody?: string }>;
        const master = rows.find((r) => r.id === "builtin-news-shorts-i2v-motion-master");
        const mod = rows.find((r) => r.id === "builtin-news-shorts-i2v-moderation-safe-motion");
        if (typeof master?.catalogBody === "string" && master.catalogBody.trim()) {
          i2vMotionMasterCatalogRef.current = master.catalogBody;
        }
        if (typeof master?.body === "string" && master.body.trim()) {
          setI2vMotionBuilderPrompt((prev) =>
            prev === DEFAULT_RUNWAY_I2V_MOTION_MASTER_PROMPT ? master.body! : prev,
          );
        }
        if (typeof mod?.body === "string" && mod.body.trim()) {
          i2vModerationSafeResolvedRef.current = mod.body;
        } else if (typeof mod?.catalogBody === "string" && mod.catalogBody.trim()) {
          i2vModerationSafeResolvedRef.current = mod.catalogBody;
        }
      } catch {
        /* keep catalog defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const libraryImagesFiltered = useMemo(() => {
    const imgs = backdropLibraryData?.images ?? [];
    const q = libraryBrowseQuery.trim().toLowerCase();
    if (!q) return imgs;
    return imgs.filter((rel) => rel.toLowerCase().includes(q));
  }, [backdropLibraryData?.images, libraryBrowseQuery]);

  const libraryVideosFiltered = useMemo(() => {
    const vids = backdropLibraryData?.videos ?? [];
    const q = libraryBrowseQuery.trim().toLowerCase();
    if (!q) return vids;
    return vids.filter((rel) => rel.toLowerCase().includes(q));
  }, [backdropLibraryData?.videos, libraryBrowseQuery]);

  const totalDuration = useMemo(
    () => template.slides.reduce((sum, s) => sum + Number(s.durationSec || 0), 0),
    [template.slides],
  );
  const scriptEstimateSec = useMemo(() => {
    const scriptText = template.slides
      .map((s) => [s.headline, s.subline].filter(Boolean).join(" "))
      .join(" ")
      .trim();
    return estimateVoiceoverDurationSec(scriptText, { voiceSpeed });
  }, [template.slides, voiceSpeed]);
  const previewSlide =
    template.slides.find((s) => s.id === previewSlideId) ?? template.slides[0] ?? INITIAL_NEWS_SHORT_TEMPLATE.slides[0];
  const runwayBrand = useMemo(
    () => runwayMotionBrandForNewsShortSourceUrl(template.sourceUrl),
    [template.sourceUrl],
  );
  const selectedBrandDefinition = useMemo(
    () =>
      getNewsShortBrandTemplateDefinition(selectedBrandTemplateId) ??
      getNewsShortBrandTemplateDefinition(DEFAULT_NEWS_SHORT_BRAND_ID)!,
    [selectedBrandTemplateId],
  );
  const runwayPreviewUrl = useMemo(() => {
    if (!runwayTaskJson || runwayTaskJson.status !== "SUCCEEDED") return null;
    return firstRunwayTaskOutputUrl(runwayTaskJson as Record<string, unknown>);
  }, [runwayTaskJson]);
  const i2vPreviewUrl = useMemo(() => {
    if (!i2vTaskJson || i2vTaskJson.status !== "SUCCEEDED") return null;
    return firstRunwayTaskOutputUrl(i2vTaskJson as Record<string, unknown>);
  }, [i2vTaskJson]);

  const i2vModerationBlocked = useMemo(
    () => Boolean(i2vError && /moderation/i.test(i2vError)),
    [i2vError],
  );
  const t2iPreviewUrl = useMemo(() => {
    if (!t2iTaskJson || t2iTaskJson.status !== "SUCCEEDED") return null;
    return firstRunwayTaskOutputUrl(t2iTaskJson as Record<string, unknown>);
  }, [t2iTaskJson]);
  const canPreviewVoice = useMemo(() => (voiceoverScript || template.slides.map((s) => s.headline).join(" ")).trim().length > 0, [voiceoverScript, template.slides]);

  /** Suggested save name for `<a download>`; server also sends Content-Disposition from manifest SEO slug. */
  const seoFriendlyMp4Filename = useMemo(() => {
    const raw = seoTemplate.file_name?.trim();
    if (!raw) return undefined;
    return /\.mp4$/i.test(raw) ? raw : `${raw}.mp4`;
  }, [seoTemplate.file_name]);

  /** Same rules as the build API (`resolveMotionBackdropRel`) — trims paths so whitespace-only rels don’t enable the UI. */
  const motionBackdrop = useMemo(
    () => resolveMotionBackdropRel({ videoRecordingRel, backgroundVideoRel }),
    [videoRecordingRel, backgroundVideoRel],
  );
  const hasMotionBackdrop = Boolean(motionBackdrop.rel);

  /** Same `/api/file` URL FFmpeg uses for the under-slide motion layer (Content preview + Video panel). */
  const motionBackdropPreviewUrl = useMemo(
    () =>
      hasMotionBackdrop && motionBackdrop.rel
        ? `/api/file?rel=${encodeURIComponent(motionBackdrop.rel)}`
        : undefined,
    [hasMotionBackdrop, motionBackdrop.rel],
  );

  const motionDimStrength = clampMotionBackdropDimStrength(template.style.motionBackdropDimStrength ?? 0.45);
  const motionOpaqueOpacity = clampMotionBackdropOpaqueOpacity(template.style.motionBackdropOpaqueOpacity ?? 0.3);

  const creativeFmtResolved = useMemo(
    () => normalizeCreativeVideoFormat(template.creativeVideoFormat),
    [template.creativeVideoFormat],
  );
  const creativeCanvasDims = useMemo(
    () => videoDimensionsForCreativeFormat(creativeFmtResolved),
    [creativeFmtResolved],
  );
  const creativeLayoutPresetResolved = useMemo(
    () => coerceLayoutPresetForFormat(creativeFmtResolved, template.creativeLayoutPreset),
    [creativeFmtResolved, template.creativeLayoutPreset],
  );
  const previewAspectShell = useMemo(
    () =>
      creativeFmtResolved === "landscape_video"
        ? "mx-auto aspect-video w-full max-w-3xl max-h-[min(70vh,560px)]"
        : PREVIEW_FRAME,
    [creativeFmtResolved],
  );

  /** Saved camera + separate Runway/upload clip → build uses background video as full-frame rear layer + camera PiP. */
  const dualBackdropCamera = useMemo(() => {
    const camRel = (videoRecordingRel || "").trim();
    const bgvRel = (backgroundVideoRel || "").trim();
    return Boolean(
      camRel &&
        bgvRel &&
        motionBackdropRelLooksLikeCameraRecording(camRel) &&
        !motionBackdropRelLooksLikeCameraRecording(bgvRel) &&
        camRel !== bgvRel,
    );
  }, [videoRecordingRel, backgroundVideoRel]);

  const buildPreviewSources = useMemo(() => {
    return {
      audio: resolveOutputAudioSource({
        useVideoAudio,
        hasMotionBackdrop,
        voiceRecordingRel,
      }),
      motion: motionBackdrop,
    };
  }, [motionBackdrop, hasMotionBackdrop, useVideoAudio, voiceRecordingRel]);

  useEffect(() => {
    if (!hasMotionBackdrop) setUseVideoAudio(false);
  }, [hasMotionBackdrop]);

  useEffect(() => {
    // Backdrop changes alter PNG transparency rules; force re-render so stale opaque images are never reused.
    setRenderResult(null);
    setBuildResult(null);
  }, [
    backgroundVideoRel,
    videoRecordingRel,
    motionDimStrength,
    motionOpaqueOpacity,
    template.creativeVideoFormat,
    template.creativeLayoutPreset,
  ]);

  useEffect(() => {
    setSeoInput((prev) => ({
      ...prev,
      headline: template.title || "",
      article_url: template.sourceUrl || "",
      article_text: (template.articleBody ?? []).join(" "),
      publish_date: template.publishDate || "",
    }));
  }, [template.title, template.sourceUrl, template.articleBody, template.publishDate]);

  const runwayAutoImportedTaskIdRef = useRef<string | null>(null);
  const i2vAutoImportedTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runwayTaskId) runwayAutoImportedTaskIdRef.current = null;
  }, [runwayTaskId]);
  useEffect(() => {
    if (!i2vTaskId) i2vAutoImportedTaskIdRef.current = null;
  }, [i2vTaskId]);

  const applyImportedRunwayVideo = useCallback(
    (data: { backgroundVideoRel: string; backgroundVideoFrameRel: string }) => {
      applyGlobalBackdropVideoRel(data.backgroundVideoRel, data.backgroundVideoFrameRel);
      setVideoRecordingRel(null);
      setVideoRecordCaptureOrientation(null);
      setPendingBackdropSave(true);
    },
    [applyGlobalBackdropVideoRel],
  );

  const importRunwayTaskToBackdrop = useCallback(
    async (taskId: string) => {
      const res = await fetch("/api/runway/import-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, taskId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        backgroundVideoRel?: string;
        backgroundVideoFrameRel?: string;
        error?: string;
      };
      if (!res.ok || !data.backgroundVideoRel || !data.backgroundVideoFrameRel) {
        throw new Error(data.error || "Import failed");
      }
      applyImportedRunwayVideo({
        backgroundVideoRel: data.backgroundVideoRel,
        backgroundVideoFrameRel: data.backgroundVideoFrameRel,
      });
    },
    [contentId, applyImportedRunwayVideo],
  );

  useEffect(() => {
    const loadVoices = async () => {
      setVoicesLoading(true);
      try {
        const res = await fetch("/api/voice-options/elevenlabs", { cache: "no-store" });
        const data = (await res.json()) as {
          voices?: Array<{
            voice_id: string;
            name: string;
            description?: string;
            category?: string;
            groupLabel?: string;
            labels?: Record<string, string>;
          }>;
          diagnostics?: {
            totalDefaults: number;
            labelledDefaults: number;
            unlabelledDefaults: number;
            unlabelledVoiceNames: string[];
            myVoicesCount?: number;
          };
          status?: string;
        };
        const voices: ElevenlabsVoiceOption[] = (data.voices ?? []).map((v) => ({
          voiceId: v.voice_id,
          name: v.name,
          description: v.description,
          category: v.category,
          groupLabel: v.groupLabel,
          labels: v.labels,
        }));
        setElevenlabsVoices(voices);
        setVoiceDiagnostics(data.diagnostics ?? null);
        setVoiceProviderStatus(data.status ?? null);
        setElevenlabsVoiceId((cur) => {
          if (cur && voices.some((v) => v.voiceId === cur)) return cur;
          const george =
            voices.find((v) => v.voiceId === DEFAULT_NEWS_SHORTS_ELEVENLABS_VOICE_ID) ||
            voices.find((v) => /^george\b/i.test(v.name.trim())) ||
            voices.find((v) => String(v.labels?.gender ?? "").toLowerCase() === "male") ||
            voices[0];
          return george?.voiceId ?? cur;
        });
      } catch {
        setVoiceProviderStatus("network_error");
      } finally {
        setVoicesLoading(false);
      }
    };
    void loadVoices();
  }, []);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPreviewVideoError(false);
  }, [runwayPreviewUrl]);

  useEffect(() => {
    setI2vPreviewVideoError(false);
  }, [i2vPreviewUrl]);

  useEffect(() => {
    setRunwayScene((value) => (value.trim() ? value : deriveRunwaySceneHintFromTemplate(template)));
  }, [template]);

  const loadI2vImageFromLibraryRel = useCallback(async (rel: string) => {
    const trimmed = rel.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/file?rel=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      const dataUri = await blobToDataUri(await res.blob());
      setI2vImageDataUri(dataUri);
      setI2vImageUrl("");
      setI2vParseImageRel(trimmed);
      setI2vError(null);
    } catch {
      setI2vParseImageRel(null);
    }
  }, []);

  /** Keeps latest `applyBrandTemplate` for URL `?brand=` handling without re-subscribing the effect every render. */
  const applyBrandTemplateRef = useRef<(brandId: string) => void>(() => {});

  const applyParsedHeroToImageToVideo = useCallback(async (
    t: NewsShortTemplateData,
    importedLibraryImageRel?: string,
  ) => {
    setI2vError(null);
    setI2vAiError(null);
    const hero = t.heroImage?.trim() ?? "";
    if (/^https:\/\//i.test(hero)) {
      setI2vImageUrl(hero);
      setI2vImageDataUri(null);
      setI2vParseImageRel(null);
      return;
    }
    const relFromImport = importedLibraryImageRel?.trim();
    const relFromHero = parseHeroApiFileRel(hero);
    const rel = relFromImport || relFromHero;
    if (rel) {
      await loadI2vImageFromLibraryRel(rel);
      return;
    }
    if (/^https?:\/\//i.test(hero)) {
      try {
        const res = await fetch(hero);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) throw new Error("not image");
        const dataUri = await blobToDataUri(blob);
        setI2vImageDataUri(dataUri);
        setI2vImageUrl("");
        setI2vParseImageRel(null);
      } catch {
        setI2vImageUrl(hero);
        setI2vImageDataUri(null);
        setI2vParseImageRel(null);
      }
    }
  }, [loadI2vImageFromLibraryRel]);

  const applyBrandTemplate = useCallback(
    (brandId: string) => {
      const def = getNewsShortBrandTemplateDefinition(brandId);
      if (!def) return;
      const next = def.buildTemplate();
      setSelectedBrandTemplateId(brandId);
      setTemplate(next);
      setArticleUrl(next.sourceUrl);
      setFeedUrl(def.rssFeedPlaceholder);
      setRssItemUrl("");
      setRssTitleHint("");
      setParseDone(false);
      setRenderResult(null);
      setBuildResult(null);
      setFfmpegPlan(null);
      setPreviewSlideId(next.slides[0]?.id ?? "slide-1");
      setRunwayScene(deriveRunwaySceneHintFromTemplate(next));
      setSeoInput(defaultSeoInputFromTemplate(next, manualKeywords));
      setSeoTemplate(generateSocialVideoSeo(defaultSeoInputFromTemplate(next, manualKeywords)));
      setError("");
      setBackgroundImageRel("");
      setVideoRecordingRel(null);
      setVideoRecordCaptureOrientation(null);
      void applyParsedHeroToImageToVideo(next);
      if (def.defaultBackgroundVideoRel) {
        applyGlobalBackdropVideoRel(
          def.defaultBackgroundVideoRel,
          inferredBackdropPosterRelFromVideo(def.defaultBackgroundVideoRel),
        );
      } else {
        setBackgroundVideoRel("");
        setBackgroundVideoFrameRel("");
      }
    },
    [manualKeywords, applyGlobalBackdropVideoRel, applyParsedHeroToImageToVideo],
  );

  applyBrandTemplateRef.current = applyBrandTemplate;

  useEffect(() => {
    const brand = searchParams.get("brand")?.trim().toLowerCase();
    if (!brand) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("brand");
    const q = next.toString();
    if (getNewsShortBrandTemplateDefinition(brand)) {
      applyBrandTemplateRef.current(brand);
    }
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const parseSource = async () => {
    setLoading(true);
    setParseDone(false);
    setError("");
    // Parsing a new article should reset rendered/built outputs so the preview reflects fresh data.
    setRenderResult(null);
    setBuildResult(null);
    setRenderBusy(false);
    setBuildBusy(false);
    const body: NewsShortParseRequest =
      sourceType === "url"
        ? { sourceType: "url", url: articleUrl.trim(), contentId }
        : {
            sourceType: "rss",
            feedUrl: feedUrl.trim(),
            itemUrl: rssItemUrl.trim() || undefined,
            itemTitle: rssTitleHint.trim() || undefined,
            contentId,
          };

    try {
      const res = await fetch("/api/news-shorts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ParseResponse | { error?: string };
      if (!res.ok || !("ok" in json)) {
        const message = "error" in json && json.error ? json.error : "Could not parse the source.";
        throw new Error(message);
      }
      setTemplate(mergeParsedTemplateWithBrandStyle(json.template, selectedBrandTemplateId));
      setFfmpegPlan(json.ffmpegPlan);
      if (json.importedLibraryImageRel) applyGlobalBackdropImageRel(json.importedLibraryImageRel);
      setPreviewSlideId(json.template.slides[0]?.id ?? "slide-1");
      setRunwayScene(deriveRunwaySceneHintFromTemplate(json.template));
      void applyParsedHeroToImageToVideo(json.template, json.importedLibraryImageRel);
      setParseDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected parsing failure.");
    } finally {
      setLoading(false);
    }
  };

  const applyRewrittenTemplate = (nextTemplate: NewsShortTemplateData, nextPlan: unknown) => {
    const brandStyle =
      getNewsShortBrandTemplateDefinition(selectedBrandTemplateId)?.buildTemplate().style ??
      NEWS_SHORT_DEFAULT_STYLE;
    setTemplate({
      ...nextTemplate,
      brandTemplateId: selectedBrandTemplateId,
      style: { ...NEWS_SHORT_DEFAULT_STYLE, ...nextTemplate.style, ...brandStyle },
    });
    setFfmpegPlan(nextPlan);
    setPreviewSlideId(nextTemplate.slides[0]?.id ?? "slide-1");
    // Rewriting the article should invalidate the current render/build outputs.
    setRenderResult(null);
    setBuildResult(null);
  };

  const rewriteArticleWithAI = async (generateThreeVersions: boolean) => {
    setArticleRewriteBusy(true);
    setArticleRewriteError(null);
    setArticleRewriteVersions({});
    setError("");

    try {
      const res = await fetch("/api/news-shorts/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: template.sourceType,
          sourceUrl: template.sourceUrl,
          author: template.author,
          publishDate: template.publishDate,
          heroImage: template.heroImage,
          articleImages: template.articleImages,
          tags: template.tags,

          title: template.title,
          strapline: template.strapline,
          articleBody: template.articleBody,
          keyQuotes: template.keyQuotes,

          slides: template.slides,
          style: template.style,

          generateThreeVersions,
          customPrompt: articleRewritePromptSaved,
        }),
      });

      const json = (await res.json()) as
        | { ok: true; template: NewsShortTemplateData; ffmpegPlan: unknown }
        | {
            ok: true;
            versions: {
              versionA: { template: NewsShortTemplateData; ffmpegPlan: unknown };
              versionB: { template: NewsShortTemplateData; ffmpegPlan: unknown };
              versionC: { template: NewsShortTemplateData; ffmpegPlan: unknown };
            };
          }
        | { error?: string };

      if (!res.ok || !("ok" in json) || !json.ok) {
        throw new Error("Failed to rewrite article.");
      }

      if (!generateThreeVersions) {
        if (!("template" in json)) throw new Error("Rewrite response missing template.");
        applyRewrittenTemplate(json.template, json.ffmpegPlan);
        setArticleRewritePromptOpen(false);
        setArticleRewriteVersions({});
      } else {
        if (!("versions" in json)) throw new Error("Rewrite response missing versions.");
        setArticleRewriteVersions({
          versionA: json.versions.versionA.template,
          versionB: json.versions.versionB.template,
          versionC: json.versions.versionC.template,
          ffmpegPlanA: json.versions.versionA.ffmpegPlan,
          ffmpegPlanB: json.versions.versionB.ffmpegPlan,
          ffmpegPlanC: json.versions.versionC.ffmpegPlan,
        });
      }
    } catch (e) {
      setArticleRewriteError(e instanceof Error ? e.message : "AI rewrite failed.");
    } finally {
      setArticleRewriteBusy(false);
    }
  };

  const renderOnly = async () => {
    setRenderBusy(true);
    setError("");
    setBuildResult(null);
    try {
      const scenes = buildScenesPayload();
      const res = await fetch("/api/render-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          scenes,
          backgroundImageRel: hasMotionBackdrop ? undefined : backgroundImageRel || undefined,
          backgroundVideoFrameRel: hasMotionBackdrop ? undefined : backgroundVideoFrameRel || undefined,
          backgroundVideoRel: dualBackdropCamera
            ? (backgroundVideoRel || "").trim() || undefined
            : motionBackdrop.rel || undefined,
          editorSubtitleOverlayOnly: Boolean(burnSubtitles && burnSubtitlesReplaceSlideText),
        }),
      });
      const json = (await res.json()) as RenderScenesApiResponse | { error?: string };
      if (!res.ok || !("images" in json)) {
        const message = "error" in json && json.error ? json.error : "Failed to render slides.";
        throw new Error(message);
      }
      const canonicalId = json.contentId?.trim() || contentId;
      if (json.contentId?.trim()) {
        setContentId(json.contentId.trim());
      }
      const usedAssOverlay = Boolean(burnSubtitles && burnSubtitlesReplaceSlideText);
      const rendered: RenderOnlyResponse = {
        ok: true,
        contentId: canonicalId,
        images: json.images.map((img) => ({ sceneId: img.sceneId, path: img.path, rel: img.rel })),
        usedAssOverlay,
      };
      setRenderResult(rendered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed.");
    } finally {
      setRenderBusy(false);
    }
  };

  const buildMp4 = async () => {
    setBuildBusy(true);
    setBuildPhase("starting");
    setError("");
    setBuildResult(null);
    const body = {
      template,
      contentId,
      images: renderResult?.images,
      voiceoverScript: voiceoverScript.trim() || undefined,
      additionalKeywords: csvToWords(manualKeywords),
      voiceGender,
      voiceSpeed,
      elevenlabsVoiceId: elevenlabsVoiceId || undefined,
      voiceRecordingRel: voiceRecordingRel || undefined,
      seoInput: { ...seoInput, tone: seoTone },
      seoTemplate,
      videoRecordingRel: dualBackdropCamera
        ? (videoRecordingRel || "").trim() || undefined
        : motionBackdrop.source === "camera"
          ? motionBackdrop.rel || undefined
          : undefined,
      backgroundVideoRel: dualBackdropCamera
        ? (backgroundVideoRel || "").trim() || undefined
        : motionBackdrop.source === "backgroundVideo"
          ? motionBackdrop.rel || undefined
          : undefined,
      backgroundImageRel:
        motionBackdrop.rel?.trim() && !motionBackdropRelLooksLikeCameraRecording(motionBackdrop.rel)
          ? undefined
          : backgroundImageRel || undefined,
      videoRecordLayout,
      videoRecordCirclePosition,
      useVideoAudio: Boolean(useVideoAudio && hasMotionBackdrop),
      burnSubtitles,
      burnSubtitlesReplaceSlideText: Boolean(burnSubtitles && burnSubtitlesReplaceSlideText),
      backingMusic:
        backingMusic.enabled && backingMusic.assetRel?.trim()
          ? { ...backingMusic, assetRel: backingMusic.assetRel.trim() }
          : { ...backingMusic, enabled: false },
    };
    try {
      const res = await fetch(studioApiPath("/api/news-shorts/build"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await parseApiJson<
        RenderBuildResponse | { error?: string; async?: boolean; jobId?: string; status?: string }
      >(res);
      if ("error" in json && json.error && res.status !== 202) {
        throw new Error(json.error);
      }
      if (!res.ok && res.status !== 202) {
        throw new Error(("error" in json && json.error) || "Failed to render and build the short.");
      }

      let built: RenderBuildResponse;
      if (res.status === 202 && "async" in json && json.async && json.jobId) {
        const job = await pollVideoBuildJob(
          studioApiPath(`/api/news-shorts/build?jobId=${encodeURIComponent(json.jobId)}`),
          {
            onProgress: (update) => {
              if (update.status === "failed") return;
              setBuildPhase(update.phase || (update.status === "pending" ? "starting" : "encoding"));
            },
          },
        );
        if (job.status === "failed" || job.error) {
          throw new Error(job.error || "Video build failed.");
        }
        const result = (job as { result?: RenderBuildResponse }).result;
        if (!result?.ok || !result.videoRel) {
          throw new Error("Video build finished without a playable MP4.");
        }
        built = result;
      } else if ("ok" in json && json.ok) {
        built = json;
      } else {
        throw new Error(("error" in json && json.error) || "Failed to render and build the short.");
      }

      setBuildResult(built);
      if (built.seo) setSeoTemplate(built.seo);
      setContentId(built.contentId);
      setRenderResult({
        ok: true,
        contentId: built.contentId,
        images: built.images,
        usedAssOverlay: Boolean(burnSubtitles && burnSubtitlesReplaceSlideText),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed.");
    } finally {
      setBuildBusy(false);
      setBuildPhase(null);
    }
  };

  const previewLabelForSlide = (slide: NewsShortSlide, index: number): string => {
    if (slide.type === "intro") return "intro";
    if (slide.type === "outro") return "outro";
    return `slide-${index + 1}`;
  };

  /** Dub / timing readout: script chunk first when burn+ASS or when script exists; else slide headline + subline. */
  const captionLineForTimingRow = (slide: NewsShortSlide, index: number): string => {
    const n = template.slides.length;
    const chunks = splitScriptIntoSceneCaptions(voiceoverScript, n);
    const chunk = chunks[index] ?? "";
    if (burnSubtitles && burnSubtitlesReplaceSlideText) {
      if (!voiceoverScript.trim()) {
        return [slide.headline, slide.subline].filter(Boolean).join(". ").trim() || "—";
      }
      return sceneSubtitleLineForBurn(chunk, slide.headline, slide.subline).trim() || "—";
    }
    if (voiceoverScript.trim()) {
      const t = sceneSubtitleLineForBurn(chunk, slide.headline, slide.subline).trim();
      if (t) return t;
    }
    const t = [slide.headline, slide.subline].filter(Boolean).join(". ").trim();
    return t || "—";
  };

  const updateSlide = (index: number, patch: Partial<NewsShortSlide>) => {
    const next = [...template.slides];
    next[index] = { ...next[index], ...patch };
    setTemplate({ ...template, slides: next });
  };

  const addSlide = () => {
    const nextIndex = template.slides.length + 1;
    const newSlide: NewsShortSlide = {
      id: `slide-${Date.now()}-${nextIndex}`,
      type: "content",
      label: "KEY POINT",
      headline: `NEW SLIDE ${nextIndex}`,
      subline: "",
      imageUrl: template.heroImage || "",
      highlightWords: [],
      durationSec: 5,
      animationStyle: "fade-up",
      backgroundAnimation: "zoom-in",
      backgroundZoom: 1.06,
    };
    setTemplate({ ...template, slides: [...template.slides, newSlide] });
    setPreviewSlideId(newSlide.id);
  };

  const deleteSlide = (index: number) => {
    if (template.slides.length <= 1) return;
    const currentId = template.slides[index]?.id;
    const nextSlides = template.slides.filter((_, i) => i !== index);
    setTemplate({ ...template, slides: nextSlides });
    if (previewSlideId === currentId) {
      setPreviewSlideId(nextSlides[Math.max(0, index - 1)]?.id ?? nextSlides[0]!.id);
    }
  };

  const buildScenesPayload = () => {
    const panelTextForRender = resolvedPanelTextColorForNewsShort(template);
    const fmt = normalizeCreativeVideoFormat(template.creativeVideoFormat);
    const dims = videoDimensionsForCreativeFormat(fmt);
    const layoutPreset = coerceLayoutPresetForFormat(fmt, template.creativeLayoutPreset);
    return template.slides.map((slide, i) => {
      const hideMeta = i === 0 || i === 2; // Intro (Slide 1) and Slide 3
      const heroImageForScene = hasMotionBackdrop ? "" : slide.imageUrl || template.heroImage;
      return {
      id: slide.id || `slide-${i + 1}`,
      templateId: slide.type === "intro" ? "news-short-intro" : slide.type === "outro" ? "news-short-outro" : "news-short-content",
      durationSec: Math.max(3, Math.min(8, Number(slide.durationSec || 5))),
      caption: slide.headline || slide.subline || `Slide ${i + 1}`,
      data: {
        width: dims.width,
        height: dims.height,
        creativeVideoFormat: fmt,
        creativeLayoutPreset: layoutPreset,
        headline: slide.headline,
        subline: hideMeta ? "" : slide.subline,
        // Match renderer expectations: intro/outro labels come from Global style controls.
        label:
          slide.type === "intro"
            ? template.style.introLabel
            : slide.type === "outro"
              ? template.style.outroLabel
              : newsShortContentKicker(slide.label),
        highlightWords: slide.highlightWords,
        heroImage: heroImageForScene,
        sourceName: (() => {
          try {
            return new URL(template.sourceUrl || "").hostname.replace(/^www\./, "");
          } catch {
            try {
              return new URL(selectedBrandDefinition.articleUrlPlaceholder).hostname.replace(/^www\./, "");
            } catch {
              return "planetsport.com";
            }
          }
        })(),
        category: (template.tags && template.tags[0]) || selectedBrandDefinition.category,
        panelColor: template.style.panelColor,
        highlightColor: template.style.highlightColor,
        ...(panelTextForRender ? { panelTextColor: panelTextForRender } : {}),
        ...(template.style.panelFooterBg ? { panelFooterBg: template.style.panelFooterBg } : {}),
        ...(template.style.panelFooterTextColor ? { panelFooterTextColor: template.style.panelFooterTextColor } : {}),
        ...(template.style.topAccentFrom ? { topAccentFrom: template.style.topAccentFrom } : {}),
        ...(template.style.topAccentTo ? { topAccentTo: template.style.topAccentTo } : {}),
        overlayOpacity: template.style.overlayOpacity,
        fontSize: template.style.fontSize,
        lineHeight: template.style.lineHeight,
        animationStyle: slide.animationStyle,
        textBoxWidthPct: template.style.textBoxWidthPct,
        headlineFont: template.style.headlineFont ?? "roboto-condensed",
        backgroundAnimation: slide.backgroundAnimation,
        backgroundZoom: slide.backgroundZoom,
        hideLabel: hideMeta,
        motionBackdropDimStrength: motionDimStrength,
        motionBackdropOpaqueOpacity: motionOpaqueOpacity,
      },
      };
    });
  };

  const regenerateSeoTemplate = useCallback(
    (nextInput?: SocialVideoSeoInput) => {
      const seed = nextInput ?? {
        ...seoInput,
        tone: seoTone,
      };
      const generated = generateSocialVideoSeo(seed);
      setSeoInput(seed);
      setSeoTemplate(generated);
    },
    [seoInput, seoTone],
  );

  const copySeoText = useCallback(async (label: string, value: string) => {
    try {
      if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard not available");
      }
      await navigator.clipboard.writeText(value);
      setSeoCopyMsg(`${label} copied.`);
    } catch {
      setSeoCopyMsg(`Could not copy ${label.toLowerCase()}.`);
    }
    window.setTimeout(() => setSeoCopyMsg(""), 1800);
  }, []);

  const patchBackingMusic = useCallback((patch: Partial<BackingMusicConfig>) => {
    setBackingMusic((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadMusicLibrary = useCallback(async () => {
    setMusicLibraryBusy(true);
    try {
      const res = await fetch("/api/news-shorts/music-library", { cache: "no-store" });
      const json = (await res.json()) as { music?: string[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load music library");
      setMusicLibrary(Array.isArray(json.music) ? json.music : []);
    } catch (e) {
      setMusicMsg(e instanceof Error ? e.message : "Could not load music library");
      setTimeout(() => setMusicMsg(""), 2500);
    } finally {
      setMusicLibraryBusy(false);
    }
  }, []);

  const uploadBackingMusic = useCallback(
    async (file: File, saveToGlobal: boolean) => {
      setMusicUploadBusy(true);
      try {
        const form = new FormData();
        form.set("contentId", contentId);
        form.set("saveToGlobal", saveToGlobal ? "1" : "0");
        form.set("music", file);
        const res = await fetch("/api/news-shorts/music-upload", { method: "POST", body: form });
        const json = (await res.json()) as { musicRel?: string; libraryRel?: string; error?: string };
        if (!res.ok || !json.musicRel) throw new Error(json.error || "Music upload failed");
        patchBackingMusic({
          enabled: true,
          sourceType: saveToGlobal ? "library" : "uploaded",
          assetRel: json.musicRel,
        });
        setMusicMsg("Backing track uploaded.");
        setTimeout(() => setMusicMsg(""), 2200);
        void loadMusicLibrary();
      } catch (e) {
        setMusicMsg(e instanceof Error ? e.message : "Music upload failed");
        setTimeout(() => setMusicMsg(""), 2500);
      } finally {
        setMusicUploadBusy(false);
      }
    },
    [contentId, loadMusicLibrary, patchBackingMusic],
  );

  const generateBackingMusic = useCallback(async () => {
    setMusicGenerateBusy(true);
    try {
      const res = await fetch("/api/news-shorts/music-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          presetId: musicGenPreset,
          mood: musicGenMood,
          energy: musicGenEnergy,
          tempo: musicGenTempo,
          genre: musicGenGenre.trim() || undefined,
          extraPrompt: musicGenExtra.trim() || undefined,
          musicLengthSec: musicGenLengthSec,
          forceInstrumental: musicGenInstrumental,
          saveToLibrary: musicGenSaveLibrary,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        musicRel?: string;
        libraryRel?: string;
        error?: string;
      };
      if (!res.ok || !json.musicRel) throw new Error(json.error || "Music generation failed");
      patchBackingMusic({
        enabled: true,
        sourceType: "generated",
        assetRel: json.musicRel,
      });
      setMusicMsg(
        musicGenSaveLibrary && json.libraryRel
          ? `Generated backing track. Also saved to library.`
          : "Generated backing track.",
      );
      setTimeout(() => setMusicMsg(""), 3200);
      void loadMusicLibrary();
    } catch (e) {
      setMusicMsg(e instanceof Error ? e.message : "Music generation failed");
      setTimeout(() => setMusicMsg(""), 4200);
    } finally {
      setMusicGenerateBusy(false);
    }
  }, [
    contentId,
    loadMusicLibrary,
    musicGenEnergy,
    musicGenExtra,
    musicGenGenre,
    musicGenInstrumental,
    musicGenLengthSec,
    musicGenMood,
    musicGenPreset,
    musicGenSaveLibrary,
    musicGenTempo,
    patchBackingMusic,
  ]);

  useEffect(() => {
    if (!backingMusicOpen) return;
    void loadMusicLibrary();
  }, [backingMusicOpen, loadMusicLibrary]);

  const saveTemplateDraft = () => {
    const payload = {
      brandTemplateId: selectedBrandTemplateId,
      contentId,
      template,
      voiceoverScript,
      manualKeywords,
      voiceRecordAuthorName,
      videoRecordAuthorName,
      seoInput,
      seoTemplate,
      seoTone,
      burnSubtitles,
      burnSubtitlesReplaceSlideText,
      backgroundImageRel,
      backgroundVideoRel,
      backgroundVideoFrameRel,
      voiceRecordingRel,
      voiceRecordSavedAt,
      videoRecordingRel,
      videoRecordSavedAt,
      videoRecordCaptureOrientation,
      videoRecordLayout,
      videoRecordCirclePosition,
      videoRecordOrientation,
      useVideoAudio,
      backingMusic,
      i2vImageUrl,
      i2vParseImageRel,
      i2vMotionBuilderPrompt,
    };
    localStorage.setItem("news-shorts-template-draft", JSON.stringify(payload));
    setDraftMsg("Template draft saved.");
    setTimeout(() => setDraftMsg(""), 3000);
  };

  const loadTemplateDraft = () => {
    const raw = localStorage.getItem("news-shorts-template-draft");
    if (!raw) {
      setDraftMsg("No saved draft found.");
      setTimeout(() => setDraftMsg(""), 3000);
      return;
    }
    try {
      const draft = JSON.parse(raw) as {
        brandTemplateId?: string;
        contentId?: string;
        template?: NewsShortTemplateData;
        voiceoverScript?: string;
        manualKeywords?: string;
        voiceRecordAuthorName?: string;
        videoRecordAuthorName?: string;
        seoInput?: SocialVideoSeoInput;
        seoTemplate?: SocialVideoSeoTemplate;
        seoTone?: SocialVideoTone;
        burnSubtitles?: boolean;
        burnSubtitlesReplaceSlideText?: boolean;
        backgroundImageRel?: string;
        backgroundVideoRel?: string;
        backgroundVideoFrameRel?: string;
        voiceRecordingRel?: string | null;
        voiceRecordSavedAt?: number | null;
        videoRecordingRel?: string | null;
        videoRecordSavedAt?: number | null;
        videoRecordCaptureOrientation?: VideoRecordOrientation | null;
        videoRecordLayout?: VideoRecordLayout;
        videoRecordCirclePosition?: VideoRecordCirclePosition;
        videoRecordOrientation?: VideoRecordOrientation;
        useVideoAudio?: boolean;
        backingMusic?: BackingMusicConfig;
        i2vImageUrl?: string;
        i2vParseImageRel?: string | null;
        i2vMotionBuilderPrompt?: string;
      };
      const draftBrandId =
        (draft.brandTemplateId || draft.template?.brandTemplateId || DEFAULT_NEWS_SHORT_BRAND_ID).trim() ||
        DEFAULT_NEWS_SHORT_BRAND_ID;
      setSelectedBrandTemplateId(draftBrandId);
      const brandBase =
        getNewsShortBrandTemplateDefinition(draftBrandId)?.buildTemplate() ?? INITIAL_NEWS_SHORT_TEMPLATE;
      if (draft.template) {
        // Backfill new required fields when loading older drafts.
        setTemplate({
          ...brandBase,
          ...draft.template,
          brandTemplateId: draftBrandId,
          strapline: draft.template.strapline ?? draft.template.title ?? brandBase.strapline,
          articleImages: draft.template.articleImages ?? [],
          style: mergeNewsShortStyleForBrand(draftBrandId, draft.template.style),
          slides: (draft.template.slides ?? []).map((s) => ({
            ...s,
            label: s.type === "content" ? newsShortContentKicker(s.label) : s.label,
          })),
        });
        setArticleUrl((draft.template.sourceUrl || "").trim());
        const fd = getNewsShortBrandTemplateDefinition(draftBrandId);
        if (fd) setFeedUrl(fd.rssFeedPlaceholder);
      }
      if (draft.contentId) setContentId(draft.contentId);
      setVoiceoverScript(draft.voiceoverScript || "");
      setManualKeywords(draft.manualKeywords || "");
      setVoiceRecordAuthorName((draft.voiceRecordAuthorName ?? "").trim());
      setVideoRecordAuthorName((draft.videoRecordAuthorName ?? "").trim());
      if (draft.seoInput) setSeoInput(draft.seoInput);
      if (draft.seoTemplate) setSeoTemplate(draft.seoTemplate);
      if (draft.seoTone === "breaking" || draft.seoTone === "analysis" || draft.seoTone === "reaction" || draft.seoTone === "result") {
        setSeoTone(draft.seoTone);
      } else {
        setSeoTone("analysis");
      }
      setBurnSubtitles(Boolean(draft.burnSubtitles));
      setBurnSubtitlesReplaceSlideText(Boolean(draft.burnSubtitlesReplaceSlideText));
      const draftBgImageRel = (draft.backgroundImageRel || "").trim();
      const draftBgVideoRel = (draft.backgroundVideoRel || "").trim();
      const draftBgFrameRel = (draft.backgroundVideoFrameRel || "").trim();
      if (draftBgVideoRel) {
        applyGlobalBackdropVideoRel(draftBgVideoRel, draftBgFrameRel || undefined);
      } else if (draftBgImageRel) {
        applyGlobalBackdropImageRel(draftBgImageRel);
      } else {
        setBackgroundImageRel("");
        setBackgroundVideoRel("");
        setBackgroundVideoFrameRel("");
      }
      if (draft.voiceRecordingRel !== undefined) setVoiceRecordingRel(draft.voiceRecordingRel);
      if (draft.voiceRecordSavedAt != null) setVoiceRecordSavedAt(draft.voiceRecordSavedAt);
      if (draft.videoRecordingRel !== undefined) {
        setVideoRecordingRel(draft.videoRecordingRel);
      } else if ((draft.backgroundVideoRel ?? "").includes("camera-record")) {
        setVideoRecordingRel(draft.backgroundVideoRel ?? null);
      } else {
        setVideoRecordingRel(null);
      }
      if (draft.videoRecordSavedAt != null) setVideoRecordSavedAt(draft.videoRecordSavedAt);
      if (draft.videoRecordCaptureOrientation === "landscape" || draft.videoRecordCaptureOrientation === "portrait") {
        setVideoRecordCaptureOrientation(draft.videoRecordCaptureOrientation);
      } else if (draft.videoRecordingRel || (draft.backgroundVideoRel ?? "").includes("camera-record")) {
        setVideoRecordCaptureOrientation(
          draft.videoRecordOrientation === "landscape" || draft.videoRecordOrientation === "portrait"
            ? draft.videoRecordOrientation
            : "portrait",
        );
      } else {
        setVideoRecordCaptureOrientation(null);
      }
      if (draft.videoRecordLayout === "half" || draft.videoRecordLayout === "circle" || draft.videoRecordLayout === "full") {
        setVideoRecordLayout(draft.videoRecordLayout);
      } else {
        setVideoRecordLayout("full");
      }
      if (
        draft.videoRecordCirclePosition === "middle-right" ||
        draft.videoRecordCirclePosition === "top-right" ||
        draft.videoRecordCirclePosition === "bottom-right" ||
        draft.videoRecordCirclePosition === "top-left"
      ) {
        setVideoRecordCirclePosition(draft.videoRecordCirclePosition);
      } else {
        setVideoRecordCirclePosition("middle-right");
      }
      if (draft.videoRecordOrientation === "landscape" || draft.videoRecordOrientation === "portrait") {
        setVideoRecordOrientation(draft.videoRecordOrientation);
      } else {
        setVideoRecordOrientation("portrait");
      }
      if (typeof draft.useVideoAudio === "boolean") {
        setUseVideoAudio(draft.useVideoAudio);
      } else {
        setUseVideoAudio(false);
      }
      if (draft.backingMusic && typeof draft.backingMusic === "object") {
        setBackingMusic({ ...defaultBackingMusic(), ...draft.backingMusic });
      } else {
        setBackingMusic(defaultBackingMusic());
      }
      const draftI2vRel = (draft.i2vParseImageRel ?? "").trim();
      if (draftI2vRel) {
        setI2vParseImageRel(draftI2vRel);
        void loadI2vImageFromLibraryRel(draftI2vRel);
      } else {
        setI2vParseImageRel(null);
        setI2vImageUrl((draft.i2vImageUrl ?? "").trim());
        setI2vImageDataUri(null);
      }
      setI2vMotionBuilderPrompt(
        typeof draft.i2vMotionBuilderPrompt === "string"
          ? draft.i2vMotionBuilderPrompt
          : i2vMotionMasterCatalogRef.current,
      );
      setDraftMsg("Template draft loaded.");
    } catch {
      setDraftMsg("Draft is invalid.");
    }
    setTimeout(() => setDraftMsg(""), 3000);
  };

  const clearTemplateDraft = () => {
    localStorage.removeItem("news-shorts-template-draft");
    setDraftMsg("Template draft cleared.");
    setTimeout(() => setDraftMsg(""), 3000);
  };

  const uploadBackgroundAsset = async (file: File, kind: "image" | "video", sceneId?: string) => {
    setUploadBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("contentId", contentId);
      if (sceneId) form.set("sceneId", sceneId);
      if (kind === "image") form.set("backgroundImage", file);
      else form.set("backgroundVideo", file);
      const res = await fetch("/api/editor-upload", { method: "POST", body: form });
      const json = (await res.json()) as {
        error?: string;
        backgroundImageRel?: string;
        backgroundImageRelBySceneId?: Record<string, string>;
        backgroundVideoRel?: string;
        backgroundVideoFrameRel?: string;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (sceneId && json.backgroundImageRelBySceneId?.[sceneId]) {
        const rel = json.backgroundImageRelBySceneId[sceneId];
        const slideIndex = template.slides.findIndex((slide) => slide.id === sceneId);
        if (slideIndex >= 0) {
          updateSlide(slideIndex, { imageUrl: `/api/file?rel=${encodeURIComponent(rel)}` });
        }
      } else if (json.backgroundImageRel) {
        applyGlobalBackdropImageRel(json.backgroundImageRel);
      }
      if (json.backgroundVideoRel) {
        applyGlobalBackdropVideoRel(json.backgroundVideoRel, json.backgroundVideoFrameRel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  };

  const closeBackdropLibraryPicker = useCallback(() => {
    setBackdropLibraryKind(null);
    setBackdropLibraryData(null);
    setLibraryBrowseQuery("");
  }, []);

  useEffect(() => {
    if (!backdropLibraryKind) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBackdropLibraryPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [backdropLibraryKind, closeBackdropLibraryPicker]);

  const openBackdropLibraryPicker = async (kind: "image" | "video") => {
    setBackdropLibraryKind(kind);
    setLibraryBrowseQuery("");
    setBackdropLibraryBusy(true);
    setError("");
    try {
      const res = await fetch(studioApiPath("/api/library/backdrop-assets"), { cache: "no-store" });
      const json = (await res.json()) as {
        backdropVideos?: string[];
        libraryBackgroundImages?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to load library");
      setBackdropLibraryData({
        videos: json.backdropVideos ?? [],
        images: json.libraryBackgroundImages ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Library load failed");
      closeBackdropLibraryPicker();
    } finally {
      setBackdropLibraryBusy(false);
    }
  };

  const pickBackdropLibraryImage = (rel: string) => {
    applyGlobalBackdropImageRel(rel);
    closeBackdropLibraryPicker();
  };

  const pickBackdropLibraryVideo = (rel: string) => {
    applyGlobalBackdropVideoRel(rel, inferredBackdropPosterRelFromVideo(rel));
    setVideoRecordingRel(null);
    setVideoRecordCaptureOrientation(null);
    closeBackdropLibraryPicker();
  };

  const syncCaptionsFromScript = () => {
    const script =
      voiceoverScript.trim().replace(/\s+/g, " ") ||
      template.slides
        .map((s) => [s.headline, s.subline].filter(Boolean).join(" "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    if (!script || template.slides.length === 0) {
      setError("Add a voiceover script first, then sync.");
      return;
    }
    setError("");
    const { captions, durationSec, estimatedScriptSec } = computeSyncFromScript(
      script,
      template.slides.length,
      voiceSpeed,
    );
    const nextSlides = template.slides.map((slide, idx) => {
      const nextDur = durationSec[idx] ?? 0.2;
      return {
        ...slide,
        subline: captions[idx] ?? "",
        durationSec: Number.isFinite(nextDur) ? nextDur : 0.2,
      };
    });
    setTemplate({ ...template, slides: nextSlides });
    const picSum = durationSec.reduce((a, d) => a + d, 0);
    setSubtitlesSyncMsg(
      `Synced ${template.slides.length} frame${template.slides.length === 1 ? "" : "s"}. Captions + durations from script (~${estimatedScriptSec.toFixed(1)}s voice est., picture sum ${picSum.toFixed(1)}s).`,
    );
    setTimeout(() => setSubtitlesSyncMsg(""), 6000);
  };

  const runVoiceImprove = async (generateThreeVersions: boolean) => {
    const baseScript =
      voiceoverScript.trim() ||
      template.slides.map((s) => [s.headline, s.subline].filter(Boolean).join(". ")).join(". ");
    if (!baseScript.trim()) {
      setError("Add a voiceover script first.");
      return;
    }
    setImproveBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/improve-racing-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "teamtalk-news",
          customPrompt: "",
          voiceStyle,
          deliveryStyle,
          tone,
          optimiseForVoiceover,
          addEmphasis,
          generateThreeVersions,
          fields: {
            voiceover_script: baseScript,
            caption: template.title,
            detail_paragraph: template.articleBody?.join(" "),
          },
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        voiceover_script?: string;
        version_a?: string;
        version_b?: string;
        version_c?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to improve voiceover.");
      setPreviousScript(baseScript);
      if (json.voiceover_script) setVoiceoverScript(json.voiceover_script);
      setVoiceVersions({
        versionA: json.version_a,
        versionB: json.version_b,
        versionC: json.version_c,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voiceover improve failed.");
    } finally {
      setImproveBusy(false);
    }
  };

  const previewVoice = async () => {
    const script =
      voiceoverScript.trim() ||
      template.slides.map((s) => [s.headline, s.subline].filter(Boolean).join(". ")).join(". ");
    if (!script.trim()) return;
    setVoicePreviewBusy(true);
    setError("");
    try {
      const res = await fetch("/api/preview-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          voiceGender,
          voiceSpeed,
          elevenlabsVoiceId: elevenlabsVoiceId || undefined,
          contentId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Preview failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setVoicePreviewPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
      });
      setVoicePreviewPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setVoicePreviewBusy(false);
    }
  };

  const stopPreviewVoice = () => {
    if (!previewAudioRef.current) return;
    previewAudioRef.current.pause();
    previewAudioRef.current.currentTime = 0;
    setVoicePreviewPlaying(false);
  };

  const saveVoiceSettings = () => {
    setVoiceSettingsSavedAt(Date.now());
    setVoiceSettingsMsg("Voice settings saved for this draft.");
    setTimeout(() => setVoiceSettingsMsg(""), 3000);
  };

  useEffect(() => {
    if (!voiceLocalBlob) {
      setLocalVoicePreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(voiceLocalBlob);
    setLocalVoicePreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [voiceLocalBlob]);

  useEffect(() => {
    if (!videoLocalBlob) {
      setLocalVideoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(videoLocalBlob);
    setLocalVideoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [videoLocalBlob]);

  const startVoiceRecording = async () => {
    setVoiceRecordError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceRecordError("Recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunksRef.current = [];
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size) recordChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || "audio/webm" });
        setVoiceLocalBlob(blob);
        setVoiceRecStatus("stopped");
        mediaRecorderRef.current = null;
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setVoiceRecStatus("recording");
      setVoiceLocalBlob(null);
    } catch (e) {
      setVoiceRecordError(e instanceof Error ? e.message : "Could not access microphone.");
    }
  };

  const stopVoiceRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop();
    }
  };

  const clearLocalVoiceRecording = () => {
    setVoiceLocalBlob(null);
    setVoiceRecStatus("idle");
    recordChunksRef.current = [];
  };

  const saveVoiceRecordingToServer = async () => {
    if (!voiceLocalBlob) return;
    setVoiceRecordBusy(true);
    setVoiceRecordError(null);
    try {
      const form = new FormData();
      form.set("contentId", contentId);
      if (voiceRecordAuthorName.trim()) form.set("authorName", voiceRecordAuthorName.trim());
      const file = new File([voiceLocalBlob], `${contentId}-voice-record.webm`, {
        type: voiceLocalBlob.type || "audio/webm",
      });
      form.set("audio", file);
      const res = await fetch("/api/news-shorts/voice-record", { method: "POST", body: form });
      const json = (await res.json()) as { voiceRecordingRel?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed");
      if (json.voiceRecordingRel) {
        setVoiceRecordingRel(json.voiceRecordingRel);
        setVoiceRecordSavedAt(Date.now());
      }
    } catch (e) {
      setVoiceRecordError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setVoiceRecordBusy(false);
    }
  };

  const removeSavedVoiceRecording = async () => {
    setVoiceRecordError(null);
    try {
      await fetch(`/api/news-shorts/voice-record?contentId=${encodeURIComponent(contentId)}`, {
        method: "DELETE",
      });
    } catch {
      /* ignore */
    }
    setVoiceRecordingRel(null);
    setVoiceRecordSavedAt(null);
  };

  const startVideoRecording = async () => {
    setVideoRecordError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVideoRecordError("Camera recording is not supported in this browser.");
      return;
    }
    try {
      const portrait = videoRecordOrientation === "portrait";
      const stream = await navigator.mediaDevices.getUserMedia({
        video: portrait
          ? {
              facingMode: "user",
              width: { ideal: 1080 },
              height: { ideal: 1920 },
              aspectRatio: { ideal: 9 / 16 },
            }
          : {
              facingMode: "user",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              aspectRatio: { ideal: 16 / 9 },
            },
        audio: true,
      });
      videoRecordChunksRef.current = [];
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size) videoRecordChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(videoRecordChunksRef.current, { type: mr.mimeType || "video/webm" });
        setVideoLocalBlob(blob);
        setVideoRecStatus("stopped");
        videoMediaRecorderRef.current = null;
      };
      mr.start(250);
      videoMediaRecorderRef.current = mr;
      setVideoRecStatus("recording");
      setVideoLocalBlob(null);
    } catch (e) {
      setVideoRecordError(e instanceof Error ? e.message : "Could not access camera or microphone.");
    }
  };

  const stopVideoRecording = () => {
    const mr = videoMediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop();
    }
  };

  const clearLocalVideoRecording = () => {
    setVideoLocalBlob(null);
    setVideoRecStatus("idle");
    videoRecordChunksRef.current = [];
  };

  const saveVideoRecordingToServer = async () => {
    if (!videoLocalBlob) return;
    setVideoRecordBusy(true);
    setVideoRecordError(null);
    try {
      const form = new FormData();
      form.set("contentId", contentId);
      if (videoRecordAuthorName.trim()) form.set("authorName", videoRecordAuthorName.trim());
      const ext = videoLocalBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([videoLocalBlob], `${contentId}-camera-record.${ext}`, {
        type: videoLocalBlob.type || "video/webm",
      });
      form.set("video", file);
      const res = await fetch("/api/news-shorts/video-record", { method: "POST", body: form });
      const json = (await res.json()) as {
        backgroundVideoRel?: string;
        backgroundVideoFrameRel?: string;
        videoRecordingRel?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Save failed");
      if (json.backgroundVideoRel && json.backgroundVideoFrameRel) {
        applyGlobalBackdropVideoRel(json.backgroundVideoRel, json.backgroundVideoFrameRel);
        setVideoRecordingRel(json.videoRecordingRel || json.backgroundVideoRel);
        setVideoRecordSavedAt(Date.now());
        setVideoRecordCaptureOrientation(videoRecordOrientation);
        setPendingBackdropSave(true);
      }
    } catch (e) {
      setVideoRecordError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setVideoRecordBusy(false);
    }
  };

  const removeSavedVideoRecording = async () => {
    setVideoRecordError(null);
    try {
      await fetch(`/api/news-shorts/video-record?contentId=${encodeURIComponent(contentId)}`, {
        method: "DELETE",
      });
    } catch {
      /* ignore */
    }
    setVideoRecordingRel(null);
    setVideoRecordSavedAt(null);
    setVideoRecordCaptureOrientation(null);
    if (backgroundVideoRel && backgroundVideoRel.includes("camera-record")) {
      setBackgroundVideoRel("");
      setBackgroundVideoFrameRel("");
    }
  };

  const fillRunwaySceneFromTemplate = () => {
    setRunwayScene(deriveRunwaySceneHintFromTemplate(template));
  };

  const buildRunwayAiPrompt = async () => {
    setRunwayAiBusy(true);
    setRunwayAiError(null);
    setRunwayAiPackage(null);
    try {
      const res = await fetch("/api/ai/runway-background-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: runwayBrand,
          scene: runwayScene.trim() || deriveRunwaySceneHintFromTemplate(template),
          mood: runwayMood.trim() || "energetic",
        }),
      });
      const data = (await res.json()) as RunwayBackgroundPromptResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Prompt build failed");
      setRunwayAiPackage(data);
      setRunwayPromptText(data.runway_prompt);
      const d = Math.round(data.settings.duration);
      if (d >= 2 && d <= 10) setRunwayDurationSec(d);
    } catch (e) {
      setRunwayAiError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunwayAiBusy(false);
    }
  };

  const startRunwayVideo = async () => {
    const pt = runwayPromptText.trim();
    if (!pt) {
      setRunwayError("Add a prompt or run Build AI prompt first.");
      return;
    }
    setRunwayBusy(true);
    setRunwayError(null);
    setRunwayTaskId(null);
    setRunwayTaskJson(null);
    setPreviewVideoError(false);
    try {
      const res = await fetch("/api/runway/text-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText: pt,
          duration: runwayDurationSec,
          model: "gen4.5",
        }),
      });
      const data = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Runway rejected the request");
      if (!data.taskId) throw new Error("No task id");
      setRunwayTaskId(data.taskId);
    } catch (e) {
      setRunwayError(e instanceof Error ? e.message : "Runway start failed");
    } finally {
      setRunwayBusy(false);
    }
  };

  useEffect(() => {
    if (!runwayTaskId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runway/tasks/${encodeURIComponent(runwayTaskId)}`);
        const data = (await res.json()) as TaskJson & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setRunwayTaskJson({ status: "FAILED", failure: data.error || `HTTP ${res.status}` });
          window.clearInterval(timer);
          return;
        }
        setRunwayTaskJson(data);
        const s = data.status;
        if (s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED") {
          window.clearInterval(timer);
        }
      } catch {
        if (!cancelled) {
          setRunwayTaskJson({ status: "FAILED", failure: "Poll failed" });
          window.clearInterval(timer);
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000) as number;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runwayTaskId]);

  /** When Runway text-to-video finishes, save the clip as the motion backdrop (same as “Import to backdrop”). Skipped if a saved camera recording is active. */
  useEffect(() => {
    if (runwayTaskJson?.status !== "SUCCEEDED" || !runwayTaskId) return;
    if (videoRecordingRel?.trim()) return;
    if (runwayAutoImportedTaskIdRef.current === runwayTaskId) return;
    runwayAutoImportedTaskIdRef.current = runwayTaskId;
    let cancelled = false;
    void (async () => {
      try {
        await importRunwayTaskToBackdrop(runwayTaskId);
        if (cancelled) runwayAutoImportedTaskIdRef.current = null;
      } catch (e) {
        runwayAutoImportedTaskIdRef.current = null;
        if (!cancelled) {
          setRunwayError(e instanceof Error ? e.message : "Could not save Runway clip as backdrop");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runwayTaskJson?.status, runwayTaskId, videoRecordingRel, importRunwayTaskToBackdrop]);

  useEffect(() => {
    if (!i2vTaskId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runway/tasks/${encodeURIComponent(i2vTaskId)}`);
        const data = (await res.json()) as TaskJson & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setI2vTaskJson({ status: "FAILED", failure: data.error || `HTTP ${res.status}` });
          window.clearInterval(timer);
          return;
        }
        setI2vTaskJson(data);
        const s = data.status;
        if (s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED") {
          window.clearInterval(timer);
        }
      } catch {
        if (!cancelled) {
          setI2vTaskJson({ status: "FAILED", failure: "Poll failed" });
          window.clearInterval(timer);
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000) as number;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [i2vTaskId]);

  /** When Runway image-to-video finishes, save the clip as the motion backdrop. Skipped if a saved camera recording is active. */
  useEffect(() => {
    if (i2vTaskJson?.status !== "SUCCEEDED" || !i2vTaskId) return;
    if (videoRecordingRel?.trim()) return;
    if (i2vAutoImportedTaskIdRef.current === i2vTaskId) return;
    i2vAutoImportedTaskIdRef.current = i2vTaskId;
    let cancelled = false;
    void (async () => {
      try {
        await importRunwayTaskToBackdrop(i2vTaskId);
        if (cancelled) i2vAutoImportedTaskIdRef.current = null;
      } catch (e) {
        i2vAutoImportedTaskIdRef.current = null;
        if (!cancelled) {
          setI2vError(e instanceof Error ? e.message : "Could not save Runway clip as backdrop");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i2vTaskJson?.status, i2vTaskId, videoRecordingRel, importRunwayTaskToBackdrop]);

  useEffect(() => {
    if (!t2iTaskId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runway/tasks/${encodeURIComponent(t2iTaskId)}`);
        const data = (await res.json()) as TaskJson & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setT2iTaskJson({ status: "FAILED", failure: data.error || `HTTP ${res.status}` });
          window.clearInterval(timer);
          return;
        }
        setT2iTaskJson(data);
        const s = data.status;
        if (s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED") {
          window.clearInterval(timer);
        }
      } catch {
        if (!cancelled) {
          setT2iTaskJson({ status: "FAILED", failure: "Poll failed" });
          window.clearInterval(timer);
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000) as number;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [t2iTaskId]);

  const importRunwayBackdrop = async () => {
    if (!runwayTaskId || runwayTaskJson?.status !== "SUCCEEDED") return;
    setRunwayImportBusy(true);
    setRunwayError(null);
    try {
      await importRunwayTaskToBackdrop(runwayTaskId);
    } catch (e) {
      setRunwayError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setRunwayImportBusy(false);
    }
  };

  const onI2vImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setI2vError("Choose an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setI2vError("Image must be 12MB or smaller.");
      return;
    }
    setI2vError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") {
        setI2vImageDataUri(r);
        setI2vImageUrl("");
        setI2vParseImageRel(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const buildI2vAiPrompt = async () => {
    if (!template.slides.length) {
      setI2vAiError("Add slides to the template first.");
      return;
    }
    setI2vAiBusy(true);
    setI2vAiError(null);
    try {
      const articleBodySample =
        template.articleBody?.length
          ? template.articleBody.slice(0, 5).join(" ").replace(/\s+/g, " ").trim().slice(0, 1200)
          : undefined;
      const res = await fetch("/api/ai/runway-image-to-video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: runwayBrand,
          title: template.title,
          strapline: template.strapline,
          sourceUrl: template.sourceUrl,
          tags: template.tags,
          slides: template.slides.map((s) => ({
            id: s.id,
            type: s.type,
            label: s.label,
            headline: s.headline,
            subline: s.subline,
          })),
          articleBodySample,
          ...(i2vMotionBuilderPrompt.trim()
            ? { motionPromptBuilderInstruction: i2vMotionBuilderPrompt.trim() }
            : {}),
        }),
      });
      const data = (await res.json()) as { motion_prompt?: string; duration?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Prompt build failed");
      if (data.motion_prompt) setI2vPromptText(data.motion_prompt);
      const d = Math.round(Number(data.duration));
      if (Number.isFinite(d) && d >= 2 && d <= 10) setI2vDurationSec(d);
    } catch (e) {
      setI2vAiError(e instanceof Error ? e.message : "Failed to build motion prompt");
    } finally {
      setI2vAiBusy(false);
    }
  };

  const startI2vVideo = async () => {
    const promptImage = (i2vImageDataUri || i2vImageUrl.trim()).trim();
    if (!promptImage) {
      setI2vError("Add a public image URL (https) or upload an image.");
      return;
    }
    const pt = i2vPromptText.trim() || DEFAULT_I2V_RUNWAY_MOTION_FALLBACK;
    setI2vBusy(true);
    setI2vError(null);
    setI2vAiError(null);
    setI2vTaskId(null);
    setI2vTaskJson(null);
    setI2vPreviewVideoError(false);
    try {
      const res = await fetch("/api/runway/image-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptImage,
          promptText: pt,
          duration: i2vDurationSec,
          model: "gen4.5",
        }),
      });
      const data = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Runway rejected the request");
      if (!data.taskId) throw new Error("No task id");
      setI2vTaskId(data.taskId);
    } catch (e) {
      setI2vError(e instanceof Error ? e.message : "Image-to-video start failed");
    } finally {
      setI2vBusy(false);
    }
  };

  const importI2vBackdrop = async () => {
    if (!i2vTaskId || i2vTaskJson?.status !== "SUCCEEDED") return;
    setI2vImportBusy(true);
    setI2vError(null);
    try {
      await importRunwayTaskToBackdrop(i2vTaskId);
    } catch (e) {
      setI2vError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setI2vImportBusy(false);
    }
  };

  const startTextToImage = async () => {
    const pt = t2iPromptText.trim();
    if (!pt) {
      setT2iError("Enter a text prompt for the image.");
      return;
    }
    setT2iBusy(true);
    setT2iError(null);
    setT2iTaskId(null);
    setT2iTaskJson(null);
    try {
      const res = await fetch("/api/runway/text-to-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText: pt,
          model: t2iModel,
          ratio: t2iRatio,
        }),
      });
      const data = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Runway rejected the request");
      if (!data.taskId) throw new Error("No task id");
      setT2iTaskId(data.taskId);
    } catch (e) {
      setT2iError(e instanceof Error ? e.message : "Text-to-image start failed");
    } finally {
      setT2iBusy(false);
    }
  };

  const importT2iBackdrop = async () => {
    if (!t2iTaskId || t2iTaskJson?.status !== "SUCCEEDED") return;
    setT2iImportBusy(true);
    setT2iError(null);
    try {
      const res = await fetch("/api/runway/import-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, taskId: t2iTaskId, assetKind: "image" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        backgroundImageRel?: string;
        error?: string;
      };
      if (!res.ok || !data.backgroundImageRel) {
        throw new Error(data.error || "Import failed");
      }
      applyGlobalBackdropImageRel(data.backgroundImageRel);
      setPendingBackdropSave(true);
    } catch (e) {
      setT2iError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setT2iImportBusy(false);
    }
  };

  const adjustTimingsFromCaptionLines = () => {
    if (!template.slides.length) return;
    const script =
      voiceoverScript.trim().replace(/\s+/g, " ") ||
      template.slides
        .map((s) => [s.headline, s.subline].filter(Boolean).join(" "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    const chunks = splitScriptIntoSceneCaptions(voiceoverScript, template.slides.length);
    const lines = template.slides.map((s, i) => {
      if (burnSubtitles && burnSubtitlesReplaceSlideText && voiceoverScript.trim()) {
        return sceneSubtitleLineForBurn(chunks[i] ?? "", s.headline, s.subline);
      }
      if (voiceoverScript.trim()) {
        return sceneSubtitleLineForBurn(chunks[i] ?? "", s.headline, s.subline) || s.subline || "";
      }
      return s.subline || "";
    });
    if (!script && !lines.some((l) => l.trim())) {
      setError("Add caption text or a voiceover script, then adjust timings.");
      return;
    }
    setError("");
    const { durationSec, targetTotalSec } = recalculateDurationsFromCaptionLines(lines, script, voiceSpeed);
    const picSum = durationSec.reduce((a, d) => a + d, 0);
    const next = template.slides.map((slide, i) => ({
      ...slide,
      durationSec: durationSec[i] ?? 0.2,
    }));
    setTemplate({ ...template, slides: next });
    setSubtitlesSyncMsg(
      `Adjusted all frame timings from current lines (~${targetTotalSec.toFixed(1)}s voice target, picture sum ${picSum.toFixed(1)}s).`,
    );
    setTimeout(() => setSubtitlesSyncMsg(""), 6000);
  };

  return (
    <>
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
        <h1 className="text-3xl font-black text-white">News Shorts — {selectedBrandDefinition.label}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          {selectedBrandDefinition.category}. Same Fetch + Parse, SEO, voiceover, I2V, background, global style, scene
          subtitles, and ASS burn workflow as every Planet Sport brand — engine and timing unchanged.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">Template (brand)</h2>
        <p className="mt-1 max-w-4xl text-xs text-slate-400">
          Pick a site for colours, sign-off line, and URL hints. Each brand is its own template — nothing is merged
          across sites. Parse only articles from that site’s domain.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {NEWS_SHORTS_BRAND_TEMPLATES.map((b) => {
            const active = b.id === selectedBrandTemplateId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => applyBrandTemplate(b.id)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-[#b7ff1a]/70 bg-[#b7ff1a]/10 ring-1 ring-[#b7ff1a]/25"
                    : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
                }`}
              >
                <p className="text-sm font-bold text-white">{b.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{b.category}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6 lg:col-start-1">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className={uiLabel}>Source type</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  sourceType === "url" ? "border-[#b7ff1a] bg-[#b7ff1a]/10 text-[#d3ff5b]" : "border-slate-700 text-slate-300"
                }`}
                onClick={() => setSourceType("url")}
              >
                Article URL
              </button>
              <button
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  sourceType === "rss" ? "border-[#b7ff1a] bg-[#b7ff1a]/10 text-[#d3ff5b]" : "border-slate-700 text-slate-300"
                }`}
                onClick={() => setSourceType("rss")}
              >
                RSS item
              </button>
            </div>

            {sourceType === "url" ? (
              <label className={`${uiLabel} mt-4`}>
                Article URL
                <input
                  className={`${uiInput} mt-1`}
                  value={articleUrl}
                  onChange={(e) => setArticleUrl(e.target.value)}
                  placeholder={`${selectedBrandDefinition.articleUrlPlaceholder}…`}
                />
              </label>
            ) : (
              <div className="mt-4 space-y-3">
                <label className={uiLabel}>
                  RSS feed URL
                  <input
                    className={`${uiInput} mt-1`}
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    placeholder={selectedBrandDefinition.rssFeedPlaceholder}
                  />
                </label>
                <label className={uiLabel}>
                  Item URL (optional exact match)
                  <input
                    className={`${uiInput} mt-1`}
                    value={rssItemUrl}
                    onChange={(e) => setRssItemUrl(e.target.value)}
                  />
                </label>
                <label className={uiLabel}>
                  Item title hint (optional)
                  <input
                    className={`${uiInput} mt-1`}
                    value={rssTitleHint}
                    onChange={(e) => setRssTitleHint(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="mt-4">
              <Panel title="Actions">
              <div className="flex flex-col gap-4" role="group" aria-label="Build actions">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[11px] font-bold text-[#38bdf8]"
                    >
                      1
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#38bdf8]/90">Step 1</p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Pull article/RSS data and create template JSON from a fresh fetch.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[#38bdf8]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#38bdf8] transition hover:border-[#38bdf8]/60 hover:bg-[#141c18] disabled:opacity-40"
                    onClick={parseSource}
                    disabled={loading}
                  >
                    {loading ? "Parsing..." : parseDone ? "Done" : "Fetch + Parse"}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#eab308]/40 bg-[#eab308]/10 text-[11px] font-bold text-[#eab308]"
                    >
                      2
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#eab308]/90">Step 2</p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Creates PNGs for each scene (1080x1920) from your current template and data.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[#eab308]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#eab308] transition hover:border-[#eab308]/60 hover:bg-[#141c18] disabled:opacity-40"
                    onClick={renderOnly}
                    disabled={renderBusy}
                  >
                    {renderBusy ? "Rendering..." : "Render scenes"}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 text-[11px] font-bold text-[#22c55e]"
                    >
                      3
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#22c55e]/90">Step 3</p>
                      <p className="text-[10px] leading-snug text-slate-500">Happy with the output? Now create your video.</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-600/70 bg-slate-950/55 p-2.5 text-[10px] leading-relaxed text-slate-400">
                    <p className="font-semibold text-slate-300">Build will use</p>
                    <p className="mt-1">
                      <span className="text-slate-500">Audio · </span>
                      {buildPreviewSources.audio === "videoAudio" ? (
                        <span className="text-[#22c55e]">Backdrop clip (camera / video file)</span>
                      ) : buildPreviewSources.audio === "voiceRecording" ? (
                        <span className="text-[#22c55e]">Saved voice recording</span>
                      ) : (
                        <span className="text-slate-200">ElevenLabs / TTS (from script)</span>
                      )}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-slate-500">Motion · </span>
                      {buildPreviewSources.motion.source === "camera" ? (
                        <span className="text-[#22c55e]">Camera recording (priority over other backdrops)</span>
                      ) : buildPreviewSources.motion.source === "backgroundVideo" ? (
                        <span className="text-slate-200">Background video (Runway / upload)</span>
                      ) : (
                        <span>Static slides (no motion backdrop)</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[#22c55e]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#22c55e] transition hover:border-[#22c55e]/60 hover:bg-[#141c18] disabled:opacity-40"
                    onClick={buildMp4}
                    disabled={buildBusy}
                  >
                    {buildBusy ? (buildPhase ? `Building · ${buildPhase}` : "Building...") : "Build video"}
                  </button>
                </div>
              </div>
              </Panel>
            </div>
            {parseDone ? (
              <div className="mt-3 space-y-3">
                <Panel title="Parsed article">
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Headline</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {decodeHtmlEntities(template.title || "") || "—"}
                      </p>
                      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Strapline</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {decodeHtmlEntities(template.strapline || "") || "—"}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Body</p>
                      <div className="mt-2 space-y-2 max-h-48 overflow-auto pr-1">
                        {template.articleBody.map((p, idx) => (
                          <p key={`${idx}-${p.slice(0, 20)}`} className="text-[13px] leading-relaxed text-slate-200">
                            {decodeHtmlEntities(p)}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Main image</p>
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-700 bg-black/30">
                        {template.heroImage ? (
                          <a href={template.heroImage} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={template.heroImage} alt="Main article image" className="h-44 w-full object-cover" />
                          </a>
                        ) : (
                          <div className="p-3 text-[11px] text-slate-400">No hero image found.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel title="Rewrite article (AI)">
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300">
                      Use OpenAI to rewrite the headline, strapline, and body paragraphs, then regenerate your slides.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                        onClick={() => void rewriteArticleWithAI(false)}
                        disabled={articleRewriteBusy}
                      >
                        {articleRewriteBusy ? "Rewriting..." : "Rewrite with AI"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                        onClick={() => void rewriteArticleWithAI(true)}
                        disabled={articleRewriteBusy}
                      >
                        {articleRewriteBusy ? "Building..." : "Generate 3 versions"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 bg-transparent px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                        onClick={() => void rewriteArticleWithAI(false)}
                        disabled={articleRewriteBusy}
                        title="Same prompt, new result"
                      >
                        Regenerate
                      </button>
                    </div>

                    <AiPromptPanel
                      open={articleRewritePromptOpen}
                      prompt={articleRewritePrompt}
                      busy={articleRewriteBusy}
                      onToggle={() => setArticleRewritePromptOpen((v) => !v)}
                      onPromptChange={(v) => setArticleRewritePrompt(v)}
                      onSave={() => {
                        setArticleRewritePromptSaved(articleRewritePrompt);
                      }}
                      onReset={() => setArticleRewritePrompt(articleRewritePromptSaved)}
                    />

                    {articleRewriteError ? <p className="text-xs text-red-300">{articleRewriteError}</p> : null}

                    {articleRewriteVersions.versionA ? (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Rewrite versions
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { key: "A", v: articleRewriteVersions.versionA, plan: articleRewriteVersions.ffmpegPlanA },
                            { key: "B", v: articleRewriteVersions.versionB, plan: articleRewriteVersions.ffmpegPlanB },
                            { key: "C", v: articleRewriteVersions.versionC, plan: articleRewriteVersions.ffmpegPlanC },
                          ]
                            .filter((x) => x.v && x.plan)
                            .map((x) => (
                              <button
                                key={x.key}
                                type="button"
                                className="w-full rounded border border-slate-700 px-2 py-2 text-left hover:border-slate-500"
                                onClick={() => applyRewrittenTemplate(x.v!, x.plan!)}
                              >
                                <div className="text-xs font-semibold text-slate-200">Version {x.key}</div>
                                <div className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                                  {decodeHtmlEntities(x.v!.title)}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Panel>
              </div>
            ) : null}
            {renderResult ? (
              <div className="mt-3 rounded border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-100">
                <p className="font-semibold">Render complete</p>
                {renderResult.usedAssOverlay ? <AssBurnModeOutputNotice tone="sky" /> : null}
                <p className="mt-1">Frames: {renderResult.images.length}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded border border-slate-700/60 bg-slate-950/60 p-2 text-[11px] text-slate-200">
                    <p className="font-bold uppercase tracking-[0.1em] text-slate-400">Global style</p>
                    <p className="mt-1">
                      Font: {NEWS_SHORT_HEADLINE_FONT_OPTIONS.find((o) => o.id === (template.style.headlineFont ?? "roboto-condensed"))?.label ?? "Roboto Condensed"} · {template.style.fontSize}px / {template.style.lineHeight.toFixed(2)}
                    </p>
                    <p>Box: {template.style.textBoxWidthPct}%</p>
                    <p>Overlay: {template.style.overlayOpacity.toFixed(2)}</p>
                    <p>Panel: {template.style.panelColor}</p>
                    <p>Highlight: {template.style.highlightColor}</p>
                  </div>
                  <div className="rounded border border-slate-700/60 bg-slate-950/60 p-2 text-[11px] text-slate-200">
                    <p className="font-bold uppercase tracking-[0.1em] text-slate-400">Slide editor</p>
                    <p className="mt-1">Slide: {previewSlide.id} ({previewSlide.type})</p>
                    <p className="line-clamp-2">
                      Headline: {decodeHtmlEntities(previewSlide.headline || "") || "—"}
                    </p>
                    <p className="line-clamp-1">
                      Subline: {decodeHtmlEntities(previewSlide.subline || "") || "—"}
                    </p>
                    <p>Duration: {previewSlide.durationSec}s</p>
                    <p>Background animate: {previewSlide.backgroundAnimation}</p>
                    <p>Zoom: {previewSlide.backgroundZoom.toFixed(2)}x</p>
                  </div>
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
            {buildResult ? (
              <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                <p className="font-semibold">Build complete</p>
                {buildResult.assPath ? <AssBurnModeOutputNotice tone="emerald" /> : null}
                {buildResult.audioSource != null || buildResult.motionBackdropSource != null ? (
                  <p className="mt-1 text-[11px] text-emerald-200/90">
                    {buildResult.audioSource === "videoAudio" ? "Audio: backdrop / video clip. " : null}
                    {buildResult.audioSource === "voiceRecording" ? "Audio: voice recording. " : null}
                    {buildResult.audioSource === "tts" ? "Audio: TTS. " : null}
                    {buildResult.motionBackdropSource === "camera" ? "Motion: camera recording." : null}
                    {buildResult.motionBackdropSource === "backgroundVideo" ? "Motion: background video." : null}
                    {buildResult.motionBackdropSource === "none" ? "Motion: none (static)." : null}
                  </p>
                ) : null}
                <p className="mt-1 break-all">Video: <code>{buildResult.videoPath}</code></p>
                <p className="mt-1 break-all">SRT (plain): <code>{buildResult.srtPath}</code></p>
                {buildResult.assPath ? (
                  <p className="mt-1 break-all">
                    ASS (burned): <code>{buildResult.assPath}</code>
                  </p>
                ) : null}
                {buildResult.engineRel ? (
                  <p className="mt-1 break-all">
                    Engine JSON: <code>{buildResult.engineRel}</code>
                    {buildResult.engine ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="text-emerald-300 underline"
                          onClick={() =>
                            void copySeoText("Engine JSON", JSON.stringify(buildResult.engine, null, 2))
                          }
                        >
                          Copy
                        </button>
                        {" · "}
                        <a
                          className="text-emerald-300 underline"
                          href={withAppPathPrefix(`/api/file?rel=${encodeURIComponent(buildResult.engineRel)}&download=1`)}
                        >
                          Download
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <section
            className="rounded-xl border border-slate-600 bg-slate-900/50 p-4"
            aria-label="Other templates"
          >
            <button
              type="button"
              onClick={() => setOtherTemplatesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">Other Templates</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {otherTemplatesOpen ? "−" : "+"}
              </span>
            </button>
            {otherTemplatesOpen ? (
              <div className="mt-4 space-y-6">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setSlidesOpen((v) => !v)}
              className="mb-3 flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-white">Slide editor</h2>
              <div className="flex items-center gap-3">
                <p className="text-xs text-slate-400">Total duration: {totalDuration}s</p>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                  style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
                >
                  {slidesOpen ? "−" : "+"}
                </span>
              </div>
            </button>
            {slidesOpen ? <div className="grid gap-3">
              <button
                type="button"
                className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#22c55e]"
                onClick={addSlide}
              >
                Add new slide
              </button>
              {template.slides.map((slide, i) => (
                <div key={slide.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#b7ff1a]">
                      Slide {i + 1} · {slide.type}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-400">
                        Duration
                        <input
                          className="ml-2 w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                          type="number"
                          min={3}
                          max={8}
                          value={slide.durationSec}
                          onChange={(e) => updateSlide(i, { durationSec: Number(e.target.value) || 5 })}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded border border-red-500/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-300 disabled:opacity-40"
                        onClick={() => deleteSlide(i)}
                        disabled={template.slides.length <= 1}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className={uiLabel}>
                      Label
                      <input
                        className={`${uiInput} mt-1`}
                        value={slide.label}
                        onChange={(e) => updateSlide(i, { label: e.target.value })}
                      />
                    </label>
                    <label className={uiLabel}>
                      Animation
                      <select
                        className={`${uiInput} mt-1`}
                        value={slide.animationStyle}
                        onChange={(e) => updateSlide(i, { animationStyle: e.target.value as NewsShortAnimationStyle })}
                      >
                        <option value="none">none</option>
                        <option value="fade-up">fade-up</option>
                        <option value="slide-up">slide-up</option>
                        <option value="soft-pop">soft-pop</option>
                      </select>
                    </label>
                    <label className={uiLabel}>
                      Background animate
                      <select
                        className={`${uiInput} mt-1`}
                        value={slide.backgroundAnimation}
                        onChange={(e) =>
                          updateSlide(i, { backgroundAnimation: e.target.value as NewsShortBackgroundAnimation })
                        }
                      >
                        <option value="none">none</option>
                        <option value="zoom-in">zoom-in</option>
                        <option value="pan-left">pan-left</option>
                        <option value="pan-right">pan-right</option>
                        <option value="float">float</option>
                      </select>
                    </label>
                  </div>
                  <label className={`${uiLabel} mt-2`}>
                    Headline
                    <textarea
                      className={`${uiInput} mt-1 min-h-[62px]`}
                      value={slide.headline}
                      onChange={(e) => updateSlide(i, { headline: e.target.value })}
                    />
                  </label>
                  <label className={`${uiLabel} mt-2`}>
                    Subline
                    <input
                      className={`${uiInput} mt-1`}
                      value={slide.subline}
                      onChange={(e) => updateSlide(i, { subline: e.target.value })}
                    />
                  </label>
                  <label className={`${uiLabel} mt-2`}>
                    Slide image URL
                    <input
                      className={`${uiInput} mt-1`}
                      value={slide.imageUrl || ""}
                      onChange={(e) => updateSlide(i, { imageUrl: e.target.value })}
                      placeholder={template.heroImage || "https://..."}
                    />
                  </label>
                  {slide.imageUrl || template.heroImage ? (
                    <div className="mt-2">
                      <p className={uiLabel}>Image preview</p>
                      <div className="mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slide.imageUrl || template.heroImage}
                          alt={`Preview for slide ${i + 1}`}
                          className="h-28 w-full object-cover"
                        />
                      </div>
                    </div>
                  ) : null}
                  <label className={`${uiLabel} mt-2`}>
                    Upload slide image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadBackgroundAsset(file, "image", slide.id);
                      }}
                      disabled={uploadBusy}
                    />
                  </label>
                  <label className={`${uiLabel} mt-2`}>
                    Highlight words (comma separated)
                    <input
                      className={`${uiInput} mt-1`}
                      value={slide.highlightWords.join(", ")}
                      onChange={(e) => updateSlide(i, { highlightWords: csvToWords(e.target.value) })}
                    />
                  </label>
                  <label className={`${uiLabel} mt-2`}>
                    Background zoom ({slide.backgroundZoom.toFixed(2)}x)
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={1}
                      max={1.2}
                      step={0.01}
                      value={slide.backgroundZoom}
                      onChange={(e) => updateSlide(i, { backgroundZoom: Number(e.target.value) })}
                    />
                  </label>
                </div>
              ))}
            </div> : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setBackingMusicOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Backing Music</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {backingMusicOpen ? "−" : "+"}
              </span>
            </button>
            {backingMusicOpen ? (
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Add a secondary music bed under narration / clip audio. Upload files, pick from the scanned library, or
                  generate an instrumental track with ElevenLabs (requires <code className="text-slate-400">ELEVENLABS_API_KEY</code>
                  ).
                </p>
                <label className="flex items-center gap-2 text-[11px] text-slate-200">
                  <input
                    type="checkbox"
                    checked={backingMusic.enabled}
                    onChange={(e) => patchBackingMusic({ enabled: e.target.checked })}
                  />
                  Enable backing music
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className={uiLabel}>
                    Upload track (mp3/wav/m4a/aac)
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
                      className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void uploadBackingMusic(file, false);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-40"
                      onClick={() => void loadMusicLibrary()}
                      disabled={musicLibraryBusy}
                    >
                      {musicLibraryBusy ? "Loading library..." : "Refresh music library"}
                    </button>
                  </label>
                  <label className={uiLabel}>
                    Track path (manual or library)
                    <input
                      className={`${uiInput} mt-1`}
                      value={backingMusic.assetRel || ""}
                      onChange={(e) => patchBackingMusic({ assetRel: e.target.value })}
                      placeholder="uploads/{contentId}/music/custom-track.mp3"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">
                      e.g. <code>generated/abc123/music-bed-01.mp3</code>,{" "}
                      <code>uploads/{`{contentId}`}/music/custom-track.mp3</code>,{" "}
                      <code>library/music/asset.mp3</code>
                    </p>
                  </label>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Generate with ElevenLabs
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    <label className={uiLabel}>
                      Preset
                      <select
                        className={`${uiInput} mt-1`}
                        value={musicGenPreset}
                        onChange={(e) => setMusicGenPreset(e.target.value)}
                      >
                        {ELEVENLABS_MUSIC_PRESET_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={uiLabel}>
                      Mood
                      <select
                        className={`${uiInput} mt-1`}
                        value={musicGenMood}
                        onChange={(e) => setMusicGenMood(e.target.value)}
                      >
                        {MUSIC_MOOD_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={uiLabel}>
                      Energy
                      <select
                        className={`${uiInput} mt-1`}
                        value={musicGenEnergy}
                        onChange={(e) => setMusicGenEnergy(e.target.value)}
                      >
                        {MUSIC_ENERGY_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={uiLabel}>
                      Tempo
                      <select
                        className={`${uiInput} mt-1`}
                        value={musicGenTempo}
                        onChange={(e) => setMusicGenTempo(e.target.value)}
                      >
                        {MUSIC_TEMPO_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className={uiLabel}>
                      Genre / instrumentation hint (optional)
                      <input
                        className={`${uiInput} mt-1`}
                        value={musicGenGenre}
                        onChange={(e) => setMusicGenGenre(e.target.value)}
                        placeholder="e.g. subtle strings, lo-fi drums"
                      />
                    </label>
                    <label className={uiLabel}>
                      Length (seconds, 3–600)
                      <input
                        type="number"
                        className={`${uiInput} mt-1`}
                        min={3}
                        max={600}
                        step={1}
                        value={musicGenLengthSec}
                        onChange={(e) =>
                          setMusicGenLengthSec(Math.min(600, Math.max(3, Number(e.target.value) || 30)))
                        }
                      />
                    </label>
                  </div>
                  <label className={`${uiLabel} mt-2 block`}>
                    Extra prompt (optional)
                    <textarea
                      className={`${uiInput} mt-1 min-h-[52px] resize-y`}
                      value={musicGenExtra}
                      onChange={(e) => setMusicGenExtra(e.target.value)}
                      placeholder="Any extra direction for this bed..."
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[11px] text-slate-200">
                      <input
                        type="checkbox"
                        checked={musicGenInstrumental}
                        onChange={(e) => setMusicGenInstrumental(e.target.checked)}
                      />
                      Instrumental only
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-200">
                      <input
                        type="checkbox"
                        checked={musicGenSaveLibrary}
                        onChange={(e) => setMusicGenSaveLibrary(e.target.checked)}
                      />
                      Also copy to global music library
                    </label>
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-md border border-[#eab308]/40 bg-[#1a2318] px-3 py-2 text-[11px] font-semibold text-slate-100 hover:border-[#eab308]/70 disabled:opacity-40"
                    onClick={() => void generateBackingMusic()}
                    disabled={musicGenerateBusy}
                  >
                    {musicGenerateBusy ? "Generating…" : "Generate backing track"}
                  </button>
                </div>

                {musicLibrary.length ? (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Music library</p>
                    <div className="max-h-36 space-y-1 overflow-auto pr-1">
                      {musicLibrary.slice(0, 60).map((rel) => (
                        <button
                          key={rel}
                          type="button"
                          className="block w-full truncate rounded border border-slate-800 px-2 py-1 text-left text-[11px] text-slate-300 hover:border-slate-600"
                          onClick={() => patchBackingMusic({ enabled: true, sourceType: rel.startsWith("library/") ? "library" : "uploaded", assetRel: rel })}
                          title={rel}
                        >
                          {rel}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {backingMusic.assetRel?.trim() ? (
                  <audio controls className="w-full" src={`/api/file?rel=${encodeURIComponent(backingMusic.assetRel.trim())}`} />
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <label className={uiLabel}>
                    Volume ({backingMusic.volume.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      className="mt-1 w-full"
                      value={backingMusic.volume}
                      onChange={(e) => patchBackingMusic({ volume: Number(e.target.value) })}
                    />
                  </label>
                  <label className={uiLabel}>
                    Duck strength ({backingMusic.duckStrength.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      className="mt-1 w-full"
                      value={backingMusic.duckStrength}
                      onChange={(e) => patchBackingMusic({ duckStrength: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className={uiLabel}>
                    Trim start (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.trimStartMs}
                      min={0}
                      step={50}
                      onChange={(e) => patchBackingMusic({ trimStartMs: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className={uiLabel}>
                    Trim end (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.trimEndMs ?? ""}
                      min={0}
                      step={50}
                      onChange={(e) => patchBackingMusic({ trimEndMs: e.target.value ? Math.max(0, Number(e.target.value) || 0) : undefined })}
                      placeholder="optional"
                    />
                  </label>
                  <label className={uiLabel}>
                    Offset (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.offsetMs}
                      min={0}
                      step={50}
                      onChange={(e) => patchBackingMusic({ offsetMs: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className={uiLabel}>
                    Fade in (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.fadeInMs}
                      min={0}
                      step={50}
                      onChange={(e) => patchBackingMusic({ fadeInMs: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className={uiLabel}>
                    Fade out (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.fadeOutMs}
                      min={0}
                      step={50}
                      onChange={(e) => patchBackingMusic({ fadeOutMs: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={backingMusic.loop}
                      onChange={(e) => patchBackingMusic({ loop: e.target.checked })}
                    />
                    Loop to fit video
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={backingMusic.ducking}
                      onChange={(e) => patchBackingMusic({ ducking: e.target.checked })}
                    />
                    Ducking enabled
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={backingMusic.duckUnderNarration}
                      onChange={(e) => patchBackingMusic({ duckUnderNarration: e.target.checked })}
                    />
                    Duck under narration
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={backingMusic.duckUnderClipAudio}
                      onChange={(e) => patchBackingMusic({ duckUnderClipAudio: e.target.checked })}
                    />
                    Duck under clip audio
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className={uiLabel}>
                    Duck attack (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.duckAttackMs}
                      min={10}
                      step={10}
                      onChange={(e) => patchBackingMusic({ duckAttackMs: Math.max(10, Number(e.target.value) || 10) })}
                    />
                  </label>
                  <label className={uiLabel}>
                    Duck release (ms)
                    <input
                      type="number"
                      className={`${uiInput} mt-1`}
                      value={backingMusic.duckReleaseMs}
                      min={40}
                      step={10}
                      onChange={(e) => patchBackingMusic({ duckReleaseMs: Math.max(40, Number(e.target.value) || 40) })}
                    />
                  </label>
                </div>

                {musicMsg ? <p className="text-[11px] text-slate-400">{musicMsg}</p> : null}
                {musicUploadBusy ? <p className="text-[11px] text-slate-500">Uploading music...</p> : null}
                {musicGenerateBusy ? <p className="text-[11px] text-slate-500">Generating music with ElevenLabs...</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setSeoOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">SEO</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {seoOpen ? "−" : "+"}
              </span>
            </button>
            {seoOpen ? (
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <p className="text-[10px] text-slate-500">
                  Generate and edit short-form SEO metadata (title, tags, hashtags, YouTube copy). Build uses this template.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={uiLabel}>
                    Main topic
                    <input
                      className={`${uiInput} mt-1`}
                      value={seoInput.main_topic}
                      onChange={(e) => setSeoInput((p) => ({ ...p, main_topic: e.target.value }))}
                      placeholder="e.g. F1 2026 rules"
                    />
                  </label>
                  <label className={uiLabel}>
                    Event
                    <input
                      className={`${uiInput} mt-1`}
                      value={seoInput.event}
                      onChange={(e) => setSeoInput((p) => ({ ...p, event: e.target.value }))}
                      placeholder="e.g. Japanese Grand Prix"
                    />
                  </label>
                  <label className={uiLabel}>
                    Entities (comma separated)
                    <input
                      className={`${uiInput} mt-1`}
                      value={wordsToCsv(seoInput.entities)}
                      onChange={(e) => setSeoInput((p) => ({ ...p, entities: csvToWords(e.target.value) }))}
                      placeholder="e.g. Verstappen, Red Bull, FIA"
                    />
                  </label>
                  <label className={uiLabel}>
                    Tone
                    <select
                      className={`${uiInput} mt-1`}
                      value={seoTone}
                      onChange={(e) => setSeoTone(e.target.value as SocialVideoTone)}
                    >
                      <option value="breaking">breaking</option>
                      <option value="analysis">analysis</option>
                      <option value="reaction">reaction</option>
                      <option value="result">result</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e]"
                  onClick={() =>
                    regenerateSeoTemplate({
                      ...seoInput,
                      headline: template.title || seoInput.headline,
                      article_url: template.sourceUrl || seoInput.article_url,
                      article_text: (template.articleBody ?? []).join(" ") || seoInput.article_text,
                      publish_date: template.publishDate || seoInput.publish_date,
                      tone: seoTone,
                    })
                  }
                >
                  Generate SEO metadata
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={() => void copySeoText("SEO JSON", JSON.stringify(seoTemplate, null, 2))}
                  >
                    Copy SEO JSON
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={() =>
                      void copySeoText(
                        "YouTube metadata",
                        [
                          `Title: ${seoTemplate.youtube_title}`,
                          "",
                          "Description:",
                          seoTemplate.youtube_description,
                          "",
                          `Tags: ${seoTemplate.youtube_tags.join(", ")}`,
                        ].join("\n"),
                      )
                    }
                  >
                    Copy YouTube metadata
                  </button>
                </div>
                {seoCopyMsg ? <p className="text-[10px] text-[#22c55e]">{seoCopyMsg}</p> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={uiLabel}>
                    File name
                    <input
                      className={`${uiInput} mt-1`}
                      value={seoTemplate.file_name}
                      onChange={(e) => setSeoTemplate((p) => ({ ...p, file_name: e.target.value }))}
                    />
                  </label>
                  <label className={uiLabel}>
                    Thumbnail text
                    <input
                      className={`${uiInput} mt-1`}
                      value={seoTemplate.thumbnail_text}
                      onChange={(e) => setSeoTemplate((p) => ({ ...p, thumbnail_text: e.target.value.toUpperCase() }))}
                    />
                  </label>
                </div>
                <label className={uiLabel}>
                  Title
                  <input
                    className={`${uiInput} mt-1`}
                    value={seoTemplate.title}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, title: e.target.value }))}
                  />
                </label>
                <label className={uiLabel}>
                  Description
                  <textarea
                    className={`${uiInput} mt-1 min-h-[90px]`}
                    value={seoTemplate.description}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, description: e.target.value }))}
                  />
                </label>
                <label className={uiLabel}>
                  Tags (comma separated)
                  <input
                    className={`${uiInput} mt-1`}
                    value={wordsToCsv(seoTemplate.tags)}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, tags: csvToWords(e.target.value) }))}
                  />
                </label>
                <label className={uiLabel}>
                  Hashtags (comma separated)
                  <input
                    className={`${uiInput} mt-1`}
                    value={wordsToCsv(seoTemplate.hashtags)}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, hashtags: csvToWords(e.target.value) }))}
                  />
                </label>
                <label className={uiLabel}>
                  YouTube title
                  <input
                    className={`${uiInput} mt-1`}
                    value={seoTemplate.youtube_title}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, youtube_title: e.target.value }))}
                  />
                </label>
                <label className={uiLabel}>
                  YouTube description
                  <textarea
                    className={`${uiInput} mt-1 min-h-[110px]`}
                    value={seoTemplate.youtube_description}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, youtube_description: e.target.value }))}
                  />
                </label>
                <label className={uiLabel}>
                  YouTube tags (comma separated)
                  <input
                    className={`${uiInput} mt-1`}
                    value={wordsToCsv(seoTemplate.youtube_tags)}
                    onChange={(e) => setSeoTemplate((p) => ({ ...p, youtube_tags: csvToWords(e.target.value) }))}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setVoiceoverOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Voiceover script</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {voiceoverOpen ? "−" : "+"}
              </span>
            </button>
            {voiceoverOpen ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-slate-500">Optional override used for TTS when building MP4.</p>
                <textarea
                  className={`${uiInput} min-h-[120px]`}
                  value={voiceoverScript}
                  onChange={(e) => setVoiceoverScript(e.target.value)}
                  placeholder="Add custom voiceover script. Leave blank to use slide headlines/sub-lines."
                />
                <label className={uiLabel}>
                  Search keywords (comma separated)
                  <input
                    className={`${uiInput} mt-1`}
                    value={manualKeywords}
                    onChange={(e) => setManualKeywords(e.target.value)}
                    placeholder="e.g. Verstappen, Red Bull, Japanese GP"
                  />
                </label>
                <VoiceoverControls
                  voiceStyle={voiceStyle}
                  deliveryStyle={deliveryStyle}
                  tone={tone}
                  optimiseForVoiceover={optimiseForVoiceover}
                  addEmphasis={addEmphasis}
                  loading={improveBusy}
                  onVoiceStyleChange={setVoiceStyle}
                  onDeliveryStyleChange={setDeliveryStyle}
                  onToneChange={setTone}
                  onOptimiseChange={setOptimiseForVoiceover}
                  onAddEmphasisChange={setAddEmphasis}
                  onImprove={() => void runVoiceImprove(false)}
                  onGenerateVersions={() => void runVoiceImprove(true)}
                  onRegenerate={() => void runVoiceImprove(false)}
                />
                {(voiceVersions.versionA || voiceVersions.versionB || voiceVersions.versionC) && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300 space-y-2">
                    <p className="font-semibold uppercase tracking-wide text-slate-400">Generated versions</p>
                    {[voiceVersions.versionA, voiceVersions.versionB, voiceVersions.versionC].filter(Boolean).map((v, idx) => (
                      <button
                        key={`${idx}-${v}`}
                        type="button"
                        className="w-full rounded border border-slate-700 px-2 py-2 text-left hover:border-slate-500"
                        onClick={() => setVoiceoverScript(v || "")}
                      >
                        Use version {idx + 1}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                  onClick={() => previousScript && setVoiceoverScript(previousScript)}
                  disabled={!previousScript}
                >
                  Restore previous script/caption
                </button>
                <VoiceSettingsPanel
                  voicePreset={voicePreset}
                  voiceGender={voiceGender}
                  voiceSpeed={voiceSpeed}
                  previewBusy={voicePreviewBusy}
                  canPreview={canPreviewVoice}
                  elevenlabsVoices={elevenlabsVoices}
                  elevenlabsVoiceId={elevenlabsVoiceId}
                  voicesLoading={voicesLoading}
                  voiceDiagnostics={voiceDiagnostics}
                  voiceProviderStatus={voiceProviderStatus}
                  saveMessage={voiceSettingsMsg}
                  onPresetChange={setVoicePreset}
                  onVoiceGenderChange={setVoiceGender}
                  onVoiceSpeedChange={setVoiceSpeed}
                  onElevenlabsVoiceChange={setElevenlabsVoiceId}
                  onPreview={() => void previewVoice()}
                  onStopPreview={stopPreviewVoice}
                  canStopPreview={voicePreviewBusy || voicePreviewPlaying}
                  onSave={saveVoiceSettings}
                />
                {voiceSettingsSavedAt ? (
                  <p className="text-xs text-slate-400">
                    Last saved voice settings:{" "}
                    {new Date(voiceSettingsSavedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setVoiceRecordOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Voice Record</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {voiceRecordOpen ? "−" : "+"}
              </span>
            </button>
            {voiceRecordOpen ? (
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <p className="text-[10px] leading-relaxed text-slate-500">
                  <strong className="text-slate-400">ElevenLabs API</strong> powers text-to-speech and preview in the
                  Voiceover script section when <strong className="text-slate-300">ELEVENLABS_API_KEY</strong> is set.
                  Record your own voice here and <strong className="text-slate-300">Save</strong> — the final MP4 will use
                  this file instead of generated speech (subtitles still follow slide timing).
                </p>
                <label className={uiLabel}>
                  Voice author name (manual)
                  <input
                    className={`${uiInput} mt-1`}
                    value={voiceRecordAuthorName}
                    onChange={(e) => setVoiceRecordAuthorName(e.target.value)}
                    placeholder="e.g. Barrie Jarrett"
                  />
                </label>
                {voiceRecordingRel ? (
                  <p className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 px-2 py-2 text-[11px] text-[#86efac]">
                    Using saved recording for build. Remove it below to use ElevenLabs TTS again.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">No saved recording — build uses ElevenLabs / TTS from your script.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-3 py-2 text-xs font-semibold text-[#38bdf8] disabled:opacity-40"
                    onClick={() => void startVoiceRecording()}
                    disabled={voiceRecStatus === "recording" || voiceRecordBusy}
                  >
                    {voiceRecStatus === "recording" ? "Recording…" : "Start recording"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    onClick={stopVoiceRecording}
                    disabled={voiceRecStatus !== "recording"}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    onClick={clearLocalVoiceRecording}
                    disabled={!voiceLocalBlob}
                  >
                    Discard take
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void saveVoiceRecordingToServer()}
                    disabled={!voiceLocalBlob || voiceRecordBusy}
                  >
                    {voiceRecordBusy ? "Saving…" : "Save recording"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-40"
                    onClick={() => void removeSavedVoiceRecording()}
                    disabled={!voiceRecordingRel || voiceRecordBusy}
                  >
                    Remove saved
                  </button>
                </div>
                {localVoicePreviewUrl ? (
                  <div>
                    <p className={uiLabel}>Preview (not saved yet)</p>
                    <audio controls className="mt-1 w-full" src={localVoicePreviewUrl} />
                  </div>
                ) : null}
                {voiceRecordingRel ? (
                  <div>
                    <p className={uiLabel}>Saved on server</p>
                    <p className="mt-1 font-mono text-[10px] text-[#22c55e]">{voiceRecordingRel}</p>
                    <audio
                      controls
                      className="mt-2 w-full"
                      src={`/api/file?rel=${encodeURIComponent(voiceRecordingRel)}`}
                    />
                  </div>
                ) : null}
                {voiceRecordSavedAt ? (
                  <p className="text-[10px] text-slate-500">
                    Last saved recording:{" "}
                    {new Date(voiceRecordSavedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </p>
                ) : null}
                {voiceRecordError ? <p className="text-xs text-red-400">{voiceRecordError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setVideoRecordOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Video Record</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {videoRecordOpen ? "−" : "+"}
              </span>
            </button>
            {videoRecordOpen ? (
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Record from your <strong className="text-slate-400">camera and microphone</strong> and{" "}
                  <strong className="text-slate-300">Save</strong> — the clip is stored as your{" "}
                  <strong className="text-slate-300">motion backdrop</strong> (same slots as Runway imports:{" "}
                  <code className="text-slate-500">uploads/{`{contentId}`}/camera-record.webm</code>). A poster frame is
                  extracted for previews. Saved clips appear under{" "}
                  <strong className="text-slate-400">Asset library → Background video → Direct videos</strong>. Requires
                  HTTPS or localhost for camera access.
                </p>
                <label className={uiLabel}>
                  Video author name (person on camera)
                  <input
                    className={`${uiInput} mt-1`}
                    value={videoRecordAuthorName}
                    onChange={(e) => setVideoRecordAuthorName(e.target.value)}
                    placeholder="e.g. Barrie Jarrett"
                  />
                </label>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Frame (YouTube Shorts)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["portrait", "Portrait 9:16 (default)"],
                        ["landscape", "Landscape 16:9"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setVideoRecordOrientation(id)}
                        disabled={videoRecStatus === "recording" || Boolean(videoLocalBlob)}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          videoRecordOrientation === id
                            ? "border-[#eab308] bg-[#eab308]/15 text-[#eab308]"
                            : "border-slate-600 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    <strong className="text-slate-400">Portrait</strong> matches Shorts / Reels (tall frame). Choose{" "}
                    <strong className="text-slate-400">Landscape</strong> only if you need a wide camera capture. Change
                    this before you start recording (discard any preview take first).
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Backdrop layout</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["full", "Full screen"],
                        ["half", "Half screen"],
                        ["circle", "Face in circle overlay"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setVideoRecordLayout(id)}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                          videoRecordLayout === id
                            ? "border-[#eab308] bg-[#eab308]/15 text-[#eab308]"
                            : "border-slate-600 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    Used when you <strong className="text-slate-400">Build video</strong> with a motion backdrop.{" "}
                    {dualBackdropCamera ? (
                      <>
                        You have a <strong className="text-slate-400">background video</strong> (Runway/upload) and a{" "}
                        <strong className="text-slate-400">saved camera clip</strong> — the built MP4 always uses the
                        background clip as the <strong className="text-slate-400">full-frame rear layer</strong>, your
                        face in a <strong className="text-slate-400">round PiP</strong>, then slide graphics on top. The
                        Half / Full / Circle buttons below apply only to <strong className="text-slate-400">camera-only</strong>{" "}
                        builds (no separate background file).
                      </>
                    ) : (
                      <>
                        <strong className="text-slate-400">Full screen</strong>: camera fills 9:16 behind slides; the
                        build adds a dark readability pass, then headlines and data on top (subtitles last).{" "}
                        <strong className="text-slate-400">Half screen</strong>: camera in the{" "}
                        <strong className="text-slate-400">top half</strong>; the bottom half uses your slide graphics. If
                        you set a still under <strong className="text-slate-400">Background (before render)</strong>, it
                        fills the lower panel under that text.{" "}
                        <strong className="text-slate-400">Face in circle</strong>: round face cam over a subtle full-frame
                        still (upload under Background) or camera fill; slides stay readable on top.
                      </>
                    )}
                  </p>
                </div>
                {videoRecordLayout === "circle" || dualBackdropCamera ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Face cam position</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        [
                          ["middle-right", "Middle right"],
                          ["top-right", "Top right"],
                          ["bottom-right", "Bottom right"],
                          ["top-left", "Top left"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setVideoRecordCirclePosition(id)}
                          className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                            videoRecordCirclePosition === id
                              ? "border-[#eab308] bg-[#eab308]/15 text-[#eab308]"
                              : "border-slate-600 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      Applies to <strong className="text-slate-400">Face in circle</strong> and to the round PiP when you
                      pair a Runway/upload clip with a saved camera recording.
                    </p>
                  </div>
                ) : null}
                <label
                  htmlFor="news-shorts-use-video-audio"
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 ${
                    hasMotionBackdrop
                      ? "border-slate-600 bg-slate-950/40 text-slate-300"
                      : "cursor-not-allowed border-slate-800/80 bg-slate-950/20 text-slate-500"
                  }`}
                >
                  <input
                    id="news-shorts-use-video-audio"
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={useVideoAudio}
                    disabled={!hasMotionBackdrop}
                    onChange={(e) => setUseVideoAudio(e.target.checked)}
                  />
                  <span className="text-[11px] leading-relaxed">
                    <strong className="text-slate-200">Use video audio</strong> — when checked, the final MP4 muxes the
                    soundtrack from your <strong className="text-slate-300">motion backdrop</strong> file (Runway/upload
                    layer, or the single camera clip). When unchecked, video sound is ignored and the mix uses{" "}
                    <strong className="text-slate-300">ElevenLabs / TTS</strong> or your{" "}
                    <strong className="text-slate-300">saved voice recording</strong> only. The backdrop clip must
                    include an audio track when this is on (e.g. record with the mic in the browser).
                    {!hasMotionBackdrop ? (
                      <span className="block text-slate-500">Add a camera or background video first.</span>
                    ) : null}
                  </span>
                </label>
                {videoRecordingRel ? (
                  <p className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 px-2 py-2 text-[11px] text-[#86efac]">
                    Using saved camera recording for backdrop video. Remove below to clear or use Runway / upload instead.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    No saved camera clip — use Runway Background video or upload if you prefer.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-3 py-2 text-xs font-semibold text-[#38bdf8] disabled:opacity-40"
                    onClick={() => void startVideoRecording()}
                    disabled={videoRecStatus === "recording" || videoRecordBusy}
                  >
                    {videoRecStatus === "recording" ? "Recording…" : "Start recording"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    onClick={stopVideoRecording}
                    disabled={videoRecStatus !== "recording"}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    onClick={clearLocalVideoRecording}
                    disabled={!videoLocalBlob}
                  >
                    Discard take
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void saveVideoRecordingToServer()}
                    disabled={!videoLocalBlob || videoRecordBusy}
                  >
                    {videoRecordBusy ? "Saving…" : "Save recording"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-40"
                    onClick={() => void removeSavedVideoRecording()}
                    disabled={!videoRecordingRel || videoRecordBusy}
                  >
                    Remove saved
                  </button>
                </div>
                {localVideoPreviewUrl ? (
                  <div>
                    <p className={uiLabel}>Preview (not saved yet)</p>
                    <VideoRecordPreview
                      src={localVideoPreviewUrl}
                      layout={videoRecordLayout}
                      orientation={videoRecordOrientation}
                    />
                  </div>
                ) : null}
                {videoRecordingRel ? (
                  <div>
                    <p className={uiLabel}>Saved on server</p>
                    <p className="mt-1 font-mono text-[10px] text-[#22c55e]">{videoRecordingRel}</p>
                    <VideoRecordPreview
                      src={`/api/file?rel=${encodeURIComponent(videoRecordingRel)}`}
                      layout={videoRecordLayout}
                      orientation={videoRecordCaptureOrientation ?? videoRecordOrientation}
                    />
                  </div>
                ) : null}
                {videoRecordSavedAt ? (
                  <p className="text-[10px] text-slate-500">
                    Last saved recording:{" "}
                    {new Date(videoRecordSavedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </p>
                ) : null}
                {videoRecordError ? <p className="text-xs text-red-400">{videoRecordError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setI2vOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Image to Video</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {i2vOpen ? "−" : "+"}
              </span>
            </button>
            {i2vOpen ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-400">
                  Turn a still into a 9:16 clip with{" "}
                  <strong className="text-slate-300">Runway Gen-4.5</strong> image-to-video (
                  <code className="text-slate-500">/v1/image_to_video</code>). The image sets composition and style; your{" "}
                  <strong className="text-slate-300">motion prompt</strong> should describe{" "}
                  <strong className="text-slate-300">camera and movement</strong> (see Runway&apos;s{" "}
                  <a
                    href="https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#22c55e] underline underline-offset-2"
                  >
                    Image to Video prompting guide
                  </a>
                  ). Provide a <strong className="text-slate-300">public https</strong> image URL, or upload a file (sent as
                  a data URI).
                </p>
                {i2vParseImageRel ? (
                  <p className="text-xs text-slate-500">
                    Using the parsed article image from your library (same file as the backdrop import). Runway receives it as an inline image.
                  </p>
                ) : null}
                <label className={uiLabel}>
                  Image URL (https)
                  <input
                    className={`${uiInput} mt-1`}
                    value={i2vImageUrl}
                    onChange={(e) => {
                      setI2vImageUrl(e.target.value);
                      if (e.target.value.trim()) {
                        setI2vImageDataUri(null);
                        setI2vParseImageRel(null);
                      }
                    }}
                    placeholder="https://example.com/hero.jpg"
                  />
                </label>
                <label className={uiLabel}>
                  Or upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                    onChange={onI2vImageFile}
                  />
                </label>
                {template.heroImage && /^https:\/\//i.test(template.heroImage) ? (
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={() => {
                      setI2vImageUrl(template.heroImage);
                      setI2vImageDataUri(null);
                      setI2vParseImageRel(null);
                      setI2vError(null);
                    }}
                  >
                    Use article hero image URL
                  </button>
                ) : null}
                {(i2vImageDataUri || (/^https?:\/\//i.test(i2vImageUrl.trim()) ? i2vImageUrl.trim() : "")) ? (
                  <div className="overflow-hidden rounded-lg border border-slate-700 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i2vImageDataUri || i2vImageUrl.trim()}
                      alt="Source for image-to-video"
                      className="mx-auto max-h-40 w-full object-contain"
                    />
                  </div>
                ) : null}
                <label className={uiLabel}>
                  AI prompt for motion (OpenAI builder)
                  <textarea
                    className={`${uiInput} mt-1 min-h-[140px] font-mono text-[11px] leading-relaxed`}
                    value={i2vMotionBuilderPrompt}
                    onChange={(e) => setI2vMotionBuilderPrompt(e.target.value)}
                    spellCheck={false}
                    placeholder="Editor brief for OpenAI: tone, camera, motion style. Combined with slides/title to produce a motion-first line for Runway (image = first frame; text = motion)."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-300"
                    onClick={() => setI2vMotionBuilderPrompt(i2vMotionMasterCatalogRef.current)}
                  >
                    Reset motion master prompt
                  </button>
                </div>
                <div className="rounded-lg border border-[#1f2d26] bg-[#0f1512] p-3 space-y-2">
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    <strong className="text-slate-400">OpenAI</strong> can draft motion text from your{" "}
                    <strong className="text-slate-300">motion master prompt</strong>,{" "}
                    <strong className="text-slate-300">template title, strapline, article excerpt</strong>, and{" "}
                    <strong className="text-slate-300">slide editor</strong> (labels, headlines, sublines). Edit the result
                    before starting Runway.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                      onClick={() => void buildI2vAiPrompt()}
                      disabled={i2vAiBusy || template.slides.length === 0}
                    >
                      {i2vAiBusy ? "Building…" : "Build AI motion prompt (OpenAI)"}
                    </button>
                  </div>
                  {i2vAiError ? <p className="text-xs text-red-400">{i2vAiError}</p> : null}
                </div>
                <div
                  className={
                    i2vModerationBlocked
                      ? "space-y-2 rounded-lg border border-amber-500/45 bg-amber-950/25 p-3"
                      : "space-y-2"
                  }
                >
                  {i2vModerationBlocked ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-100">Runway: text prompt did not pass moderation</p>
                      <p className="text-[10px] leading-relaxed text-amber-100/90">
                        Edit the <strong className="text-amber-50">motion prompt</strong> below (camera, light,
                        environment only). Runway often blocks{" "}
                        <strong className="text-amber-50">real names, teams, brands, and model names</strong> even when
                        the still shows them — keep wording generic.
                      </p>
                      <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-slate-400">
                        <li>Prefer “the driver / the car / the vehicle” over personal or trademark names.</li>
                        <li>Avoid ambiguous verbs; use “exits the garage”, “rolls forward”, “slow push-in”.</li>
                        <li>Use a template, then tweak one line at a time and retry.</li>
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-amber-400/50 bg-amber-500/15 px-2 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/25"
                          onClick={() => {
                            setI2vPromptText(i2vModerationSafeResolvedRef.current);
                            setI2vError(null);
                          }}
                        >
                          Use moderation-safe motion text
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-600 px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:border-slate-500"
                          onClick={() => {
                            setI2vPromptText("");
                            setI2vError(null);
                          }}
                        >
                          Clear (use short default on next start)
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-600 px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:border-slate-500"
                          onClick={() => void buildI2vAiPrompt()}
                          disabled={i2vAiBusy || template.slides.length === 0}
                        >
                          Rebuild with OpenAI (uses moderation-aware rules)
                        </button>
                      </div>
                      <p className="text-[10px] text-red-300/95">{i2vError}</p>
                    </div>
                  ) : null}
                  <label className={uiLabel}>
                    Motion prompt (sent to Runway — describe motion and camera, not the whole scene)
                    <textarea
                      className={`${uiInput} mt-1 ${i2vModerationBlocked ? "min-h-[140px]" : "min-h-[80px]"}`}
                      value={i2vPromptText}
                      onChange={(e) => setI2vPromptText(e.target.value)}
                      spellCheck={true}
                      placeholder={
                        i2vModerationBlocked
                          ? "Edit here, then click Start Image to Video again. Avoid names and brands; focus on camera drift, light, and background motion."
                          : 'e.g. The camera slowly pushes in as ambient light shifts; gentle crowd movement in the background — or use "Build AI motion prompt" above'
                      }
                    />
                  </label>
                </div>
                <label className={uiLabel}>
                  Duration (2–10s)
                  <input
                    type="number"
                    min={2}
                    max={10}
                    step={1}
                    className={`${uiInput} mt-1`}
                    value={i2vDurationSec}
                    onChange={(e) => setI2vDurationSec(Math.max(2, Math.min(10, Number(e.target.value) || 8)))}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void startI2vVideo()}
                    disabled={i2vBusy || (!i2vImageDataUri && !i2vImageUrl.trim())}
                  >
                    {i2vBusy ? "Starting…" : "Start Image to Video (Runway)"}
                  </button>
                </div>
                {i2vTaskId ? (
                  <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3 text-xs text-slate-300">
                    <p className="font-mono text-[10px] text-[#eab308]">task {i2vTaskId}</p>
                    <p className="mt-1 text-slate-400">
                      Status: <strong className="text-slate-200">{i2vTaskJson?.status ?? "…"}</strong>
                      {i2vTaskJson?.status === "RUNNING" && typeof i2vTaskJson.progress === "number" ? (
                        <span className="text-slate-500"> ({Math.round(i2vTaskJson.progress * 100)}%)</span>
                      ) : null}
                    </p>
                    <RunwayTaskQueueHint status={i2vTaskJson?.status} modality="video" />
                    {i2vTaskJson?.status === "FAILED" || i2vTaskJson?.status === "CANCELLED" ? (
                      <p className="mt-1 text-red-300">{i2vTaskJson.failure || "Task ended"}</p>
                    ) : null}
                    {i2vTaskJson?.status === "SUCCEEDED" ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#22c55e]">
                            Preview (before import)
                          </p>
                          {i2vPreviewUrl ? (
                            <div className="mt-2">
                              {!i2vPreviewVideoError ? (
                                <video
                                  key={i2vPreviewUrl}
                                  src={i2vPreviewUrl}
                                  className="max-h-64 w-full rounded-lg border border-[#1f2d26] bg-black object-contain"
                                  controls
                                  muted
                                  playsInline
                                  preload="metadata"
                                  onError={() => setI2vPreviewVideoError(true)}
                                />
                              ) : (
                                <p className="text-[10px] text-amber-200/90">
                                  Inline preview blocked.{" "}
                                  <a
                                    href={i2vPreviewUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="text-[#22c55e] underline"
                                  >
                                    Open video in new tab
                                  </a>
                                  .
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-[10px] text-amber-200/80">
                              No output URL in the task payload — you can still import; the server will resolve the file.
                            </p>
                          )}
                        </div>
                        <div className="border-t border-[#1f2d26] pt-3">
                          <button
                            type="button"
                            className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                            onClick={() => void importI2vBackdrop()}
                            disabled={i2vImportBusy}
                          >
                            {i2vImportBusy ? "Importing…" : "Import to backdrop"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {i2vError && !i2vModerationBlocked ? <p className="text-xs text-red-400">{i2vError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setT2iOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Text to Image</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {t2iOpen ? "−" : "+"}
              </span>
            </button>
            {t2iOpen ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-400">
                  Generate a still with Runway <strong className="text-slate-300">Gen-4 Image</strong> (
                  <code className="text-slate-500">/v1/text_to_image</code>). Uses the same{" "}
                  <code className="text-slate-500">RUNWAYML_API_SECRET</code> as other Runway panels.{" "}
                  <strong className="text-slate-300">Turbo</strong> sends a default reference still (Runway requirement);{" "}
                  <strong className="text-slate-300">Gen-4 Image</strong> is text-only. See{" "}
                  <a
                    href="https://docs.dev.runwayml.com/guides/models/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#22c55e] underline underline-offset-2"
                  >
                    API models
                  </a>
                  .
                </p>
                <label className={uiLabel}>
                  Prompt
                  <textarea
                    className={`${uiInput} mt-1 min-h-[100px]`}
                    value={t2iPromptText}
                    onChange={(e) => setT2iPromptText(e.target.value)}
                    placeholder="Describe the scene, lighting, and style (max 1000 characters)."
                    maxLength={1000}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={uiLabel}>
                    Model
                    <select
                      className={`${uiInput} mt-1`}
                      value={t2iModel}
                      onChange={(e) => setT2iModel(e.target.value as "gen4_image_turbo" | "gen4_image")}
                    >
                      <option value="gen4_image_turbo">gen4_image_turbo (default reference)</option>
                      <option value="gen4_image">gen4_image (text-only)</option>
                    </select>
                  </label>
                  <label className={uiLabel}>
                    Aspect ratio
                    <select
                      className={`${uiInput} mt-1`}
                      value={t2iRatio}
                      onChange={(e) =>
                        setT2iRatio(e.target.value as "1080:1920" | "720:1280" | "1920:1080" | "1280:720")
                      }
                    >
                      <option value="1080:1920">9:16 — 1080×1920 (Shorts)</option>
                      <option value="720:1280">9:16 — 720×1280</option>
                      <option value="1920:1080">16:9 — 1920×1080</option>
                      <option value="1280:720">16:9 — 1280×720</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={() => {
                      const line = [template.title, template.strapline].filter(Boolean).join(". ").trim();
                      setT2iPromptText(line.slice(0, 1000));
                    }}
                  >
                    Fill prompt from template
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void startTextToImage()}
                    disabled={t2iBusy || !t2iPromptText.trim()}
                  >
                    {t2iBusy ? "Starting…" : "Start Text to Image (Runway)"}
                  </button>
                </div>
                {t2iTaskId ? (
                  <div className="rounded-lg border border-[#1f2d26] bg-[#0f1512] p-3 space-y-2">
                    <p className="font-mono text-[10px] text-[#eab308]">task {t2iTaskId}</p>
                    <p className="text-xs text-slate-400">
                      Status: <strong className="text-slate-200">{t2iTaskJson?.status ?? "…"}</strong>
                      {t2iTaskJson?.status === "RUNNING" && typeof t2iTaskJson.progress === "number" ? (
                        <span className="text-slate-500"> ({Math.round(t2iTaskJson.progress * 100)}%)</span>
                      ) : null}
                    </p>
                    <RunwayTaskQueueHint status={t2iTaskJson?.status} modality="image" />
                    {t2iTaskJson?.status === "FAILED" || t2iTaskJson?.status === "CANCELLED" ? (
                      <p className="mt-1 text-red-300">{t2iTaskJson.failure || "Task ended"}</p>
                    ) : null}
                    {t2iTaskJson?.status === "SUCCEEDED" ? (
                      <div className="space-y-2 border-t border-[#1f2d26] pt-3">
                        {t2iPreviewUrl ? (
                          <div className="overflow-hidden rounded-lg border border-slate-700 bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t2iPreviewUrl}
                              alt="Generated still"
                              className="mx-auto max-h-64 w-full object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-200/80">No preview URL in task — import still works.</p>
                        )}
                        <button
                          type="button"
                          className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                          onClick={() => void importT2iBackdrop()}
                          disabled={t2iImportBusy}
                        >
                          {t2iImportBusy ? "Importing…" : "Import to backdrop (image)"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {t2iError ? <p className="text-xs text-red-400">{t2iError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setBackgroundVideoOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Background video</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {backgroundVideoOpen ? "−" : "+"}
              </span>
            </button>
            {backgroundVideoOpen ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-400">
                  Build a loopable 9:16 backdrop with <strong className="text-slate-300">Runway Gen-4.5</strong> (text
                  {" "}&rarr; video). Uses your <code className="text-slate-500">RUNWAYML_API_SECRET</code> from{" "}
                  <a
                    href="https://dev.runwayml.com/organization/eb9f601c-2259-4a7a-adc5-ef88f1d7771e/api-keys"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#22c55e] hover:underline"
                  >
                    API keys (this org)
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://dev.runwayml.com/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#22c55e] hover:underline"
                  >
                    dev portal
                  </a>
                  . OpenAI refines the prompt from template + brand; then Runway renders the clip.
                </p>
                <p className="text-[10px] text-slate-600">
                  Brand for this format: <strong className="text-slate-400">{runwayBrand}</strong>. Edit scene / mood if needed.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 sm:col-span-2">
                    Scene (from content or custom)
                    <input
                      className={`${uiInput} mt-1`}
                      value={runwayScene}
                      onChange={(e) => setRunwayScene(e.target.value)}
                      placeholder="e.g. race title, headline"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500">
                    Mood
                    <input className={`${uiInput} mt-1`} value={runwayMood} onChange={(e) => setRunwayMood(e.target.value)} />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase text-slate-500">
                    Duration (Runway gen4.5: 2-10s)
                    <input
                      type="number"
                      min={2}
                      max={10}
                      step={1}
                      className={`${uiInput} mt-1`}
                      value={runwayDurationSec}
                      onChange={(e) => setRunwayDurationSec(Math.max(2, Math.min(10, Number(e.target.value) || 8)))}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={fillRunwaySceneFromTemplate}
                  >
                    Fill scene from template
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void buildRunwayAiPrompt()}
                    disabled={runwayAiBusy}
                  >
                    {runwayAiBusy ? "Building..." : "Build AI prompt (OpenAI)"}
                  </button>
                </div>
                {runwayAiError ? <p className="text-xs text-red-400">{runwayAiError}</p> : null}
                {runwayAiPackage ? (
                  <div className="space-y-2 rounded-lg border border-[#1f2d26] bg-[#0f1512] p-3">
                    <p className="text-[10px] text-[#22c55e]">
                      AI package ready — filename <span className="font-mono">{runwayAiPackage.filename}</span>.
                    </p>
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Scene subtitle timing (JSON)</p>
                    <pre className="max-h-56 overflow-auto rounded border border-[#1f2d26] bg-[#0a0e0c] p-2 text-[10px] text-slate-300">
                      {JSON.stringify(runwayAiPackage.subtitles, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <label className={uiLabel}>
                  Video prompt (sent to Runway)
                  <textarea
                    className={`${uiInput} mt-1 min-h-[120px] font-mono text-[11px]`}
                    value={runwayPromptText}
                    onChange={(e) => setRunwayPromptText(e.target.value)}
                    placeholder="Runway text-to-video prompt; no logos or text in-frame."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                    onClick={() => void startRunwayVideo()}
                    disabled={runwayBusy || !runwayPromptText.trim()}
                  >
                    {runwayBusy ? "Starting..." : "Start Runway video"}
                  </button>
                </div>
                {runwayTaskId ? (
                  <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3 text-xs text-slate-300">
                    <p className="font-mono text-[10px] text-[#eab308]">task {runwayTaskId}</p>
                    <p className="mt-1 text-slate-400">
                      Status: <strong className="text-slate-200">{runwayTaskJson?.status ?? "..."}</strong>
                      {runwayTaskJson?.status === "RUNNING" && typeof runwayTaskJson.progress === "number" ? (
                        <span className="text-slate-500"> ({Math.round(runwayTaskJson.progress * 100)}%)</span>
                      ) : null}
                    </p>
                    <RunwayTaskQueueHint status={runwayTaskJson?.status} modality="video" />
                    {runwayTaskJson?.status === "FAILED" || runwayTaskJson?.status === "CANCELLED" ? (
                      <p className="mt-1 text-red-300">{runwayTaskJson.failure || runwayTaskJson.error || "Task ended"}</p>
                    ) : null}
                    {runwayTaskJson?.status === "SUCCEEDED" ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#22c55e]">Preview (before import)</p>
                          {runwayPreviewUrl ? (
                            <div className="mt-2">
                              {!previewVideoError ? (
                                <video
                                  key={runwayPreviewUrl}
                                  src={runwayPreviewUrl}
                                  className="max-h-64 w-full rounded-lg border border-[#1f2d26] bg-black object-contain"
                                  controls
                                  muted
                                  playsInline
                                  preload="metadata"
                                  onError={() => setPreviewVideoError(true)}
                                />
                              ) : (
                                <p className="text-[10px] text-amber-200/90">
                                  Inline preview blocked.{" "}
                                  <a href={runwayPreviewUrl} target="_blank" rel="noreferrer noopener" className="text-[#22c55e] underline">
                                    Open video in new tab
                                  </a>
                                  .
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-[10px] text-amber-200/80">
                              No output URL in the task payload yet — you can still import; the server will resolve the file.
                            </p>
                          )}
                        </div>
                        <div className="border-t border-[#1f2d26] pt-3">
                          <button
                            type="button"
                            className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                            onClick={() => void importRunwayBackdrop()}
                            disabled={runwayImportBusy}
                          >
                            {runwayImportBusy ? "Importing..." : "Import to backdrop"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {pendingBackdropSave ? (
                  <div className="rounded-lg border border-[#eab308]/35 bg-[#1a1608]/80 p-3">
                    <p className="text-[11px] text-slate-300">
                      Motion backdrop is live for this session. Save your draft so the file path reloads correctly.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-2 text-xs font-semibold text-[#22c55e] disabled:opacity-40"
                        onClick={() => {
                          setSaveBackdropBusy(true);
                          saveTemplateDraft();
                          setPendingBackdropSave(false);
                          setTimeout(() => setSaveBackdropBusy(false), 200);
                        }}
                        disabled={saveBackdropBusy}
                      >
                        {saveBackdropBusy ? "Saving..." : "Save backdrop to template"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {(backgroundVideoRel || backgroundVideoFrameRel) ? (
                  <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Currently active backdrop
                    </p>
                    {backgroundVideoRel ? (
                      <p className="mt-2 text-[11px] text-slate-300">
                        Video: <span className="font-mono text-[#22c55e]">{backgroundVideoRel}</span>
                      </p>
                    ) : null}
                    {backgroundVideoFrameRel ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Fallback frame: <span className="font-mono">{backgroundVideoFrameRel}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {runwayError ? <p className="text-xs text-red-400">{runwayError}</p> : null}
                <label className={uiLabel}>
                  Video file (MP4, WebM, MOV)
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadBackgroundAsset(file, "video");
                    }}
                    disabled={uploadBusy}
                  />
                </label>
                {backgroundVideoRel ? <p className="text-[10px] font-mono text-[#22c55e]">{backgroundVideoRel}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setBackgroundBeforeOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Background (before render)</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {backgroundBeforeOpen ? "−" : "+"}
              </span>
            </button>
            {backgroundBeforeOpen ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-slate-500">
                  Stills and motion clips here are <strong className="text-slate-400">backdrops only</strong> (behind
                  slide text and graphics). <strong className="text-slate-400">Background video</strong> you upload or
                  import (Runway, <span className="font-mono text-slate-400">custom-bg.mp4</span>, etc.) is always scaled
                  to the <strong className="text-slate-400">full 9×16 frame</strong> in the final MP4 — not the top-half
                  split used for camera-only “Half screen” in Record video. When a motion backdrop is active, it{" "}
                  <strong className="text-slate-400">replaces</strong> the still for render and build — except{" "}
                  <strong className="text-slate-400">Face in circle</strong> with a saved{" "}
                  <span className="font-mono text-slate-400">camera-record</span> clip only, where the still can fill the
                  frame behind the circle PiP. You can also pick files from the{" "}
                  <a href={withAppPathPrefix("/library")} className="text-[#86efac] underline hover:text-[#bbf7d0]">
                    asset library
                  </a>
                  .
                </p>
                <label className={uiLabel}>
                  Image file (PNG, JPG, WebP, GIF)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadBackgroundAsset(file, "image");
                    }}
                    disabled={uploadBusy}
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-[#eab308]/50 disabled:opacity-40"
                    disabled={uploadBusy || backdropLibraryBusy}
                    onClick={() => void openBackdropLibraryPicker("image")}
                  >
                    Browse stills in library
                  </button>
                </div>
                {backgroundImageRel ? <p className="text-[10px] font-mono text-[#22c55e]">{backgroundImageRel}</p> : null}
                <label className={uiLabel}>
                  Video file (MP4, WebM, MOV)
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadBackgroundAsset(file, "video");
                    }}
                    disabled={uploadBusy}
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-[#eab308]/50 disabled:opacity-40"
                    disabled={uploadBusy || backdropLibraryBusy}
                    onClick={() => void openBackdropLibraryPicker("video")}
                  >
                    Browse motion in library
                  </button>
                </div>
                {backgroundVideoRel ? (
                  <p className="text-[10px] font-mono text-[#22c55e]">{backgroundVideoRel}</p>
                ) : null}
                {backgroundVideoFrameRel ? <p className="text-[10px] font-mono text-slate-500">Fallback video frame: {backgroundVideoFrameRel}</p> : null}
                {motionBackdropPreviewUrl &&
                motionBackdrop.rel &&
                !motionBackdropRelLooksLikeCameraRecording(motionBackdrop.rel) ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <div className="space-y-2">
                      <p className={uiLabel}>Base darkness (uniform black)</p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Full-screen wash over motion, under the readability gradient. Same as Content preview + server
                        PNGs. <strong className="text-slate-400">Render scenes</strong> after changing.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
                          {Math.round(motionOpaqueOpacity * 100)}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={70}
                          step={5}
                          className="min-w-0 flex-1 accent-[#86efac]"
                          value={Math.round(motionOpaqueOpacity * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            setTemplate({
                              ...template,
                              style: { ...template.style, motionBackdropOpaqueOpacity: pct / 100 },
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <p className={uiLabel}>Gradient strength (readability)</p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Scales the bottom fade and panel ramp only (not the uniform black layer).
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
                          {Math.round(motionDimStrength * 100)}%
                        </span>
                        <input
                          type="range"
                          min={25}
                          max={160}
                          step={5}
                          className="min-w-0 flex-1 accent-[#86efac]"
                          value={Math.round(motionDimStrength * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            setTemplate({
                              ...template,
                              style: { ...template.style, motionBackdropDimStrength: pct / 100 },
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setStyleOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Global style controls</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {styleOpen ? "−" : "+"}
              </span>
            </button>
            {styleOpen ? <div className="mt-3 grid gap-3">
              <label className={uiLabel}>
                Hero image URL
                <input
                  className={`${uiInput} mt-1 font-mono text-xs`}
                  value={template.heroImage}
                  onChange={(e) => setTemplate({ ...template, heroImage: e.target.value })}
                />
              </label>
              <label className={uiLabel}>
                Headline font (slides + burned subtitles)
                <select
                  className={`${uiInput} mt-1`}
                  value={template.style.headlineFont ?? "roboto-condensed"}
                  onChange={(e) =>
                    setTemplate({
                      ...template,
                      style: {
                        ...template.style,
                        headlineFont: e.target.value === "bebas-neue" ? "bebas-neue" : "roboto-condensed",
                      },
                    })
                  }
                >
                  {NEWS_SHORT_HEADLINE_FONT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={uiLabel}>
                Font size ({template.style.fontSize}px)
                <input
                  className="mt-1 w-full"
                  type="range"
                  min={40}
                  max={90}
                  value={template.style.fontSize}
                  onChange={(e) =>
                    setTemplate({ ...template, style: { ...template.style, fontSize: Number(e.target.value) } })
                  }
                />
              </label>
              <label className={uiLabel}>
                Line height ({template.style.lineHeight.toFixed(2)})
                <input
                  className="mt-1 w-full"
                  type="range"
                  min={0.95}
                  max={1.4}
                  step={0.01}
                  value={template.style.lineHeight}
                  onChange={(e) =>
                    setTemplate({ ...template, style: { ...template.style, lineHeight: Number(e.target.value) } })
                  }
                />
              </label>
              <label className={uiLabel}>
                Text box width ({template.style.textBoxWidthPct}%)
                <input
                  className="mt-1 w-full"
                  type="range"
                  min={60}
                  max={94}
                  value={template.style.textBoxWidthPct}
                  onChange={(e) =>
                    setTemplate({ ...template, style: { ...template.style, textBoxWidthPct: Number(e.target.value) } })
                  }
                />
              </label>
              <label className={uiLabel}>
                Overlay opacity ({template.style.overlayOpacity.toFixed(2)})
                <input
                  className="mt-1 w-full"
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.02}
                  value={template.style.overlayOpacity}
                  onChange={(e) =>
                    setTemplate({ ...template, style: { ...template.style, overlayOpacity: Number(e.target.value) } })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={uiLabel}>
                  Highlight colour
                  <input
                    type="color"
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-transparent"
                    value={template.style.highlightColor}
                    onChange={(e) =>
                      setTemplate({ ...template, style: { ...template.style, highlightColor: e.target.value } })
                    }
                  />
                </label>
                <label className={uiLabel}>
                  Panel colour
                  <input
                    type="color"
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-transparent"
                    value={template.style.panelColor}
                    onChange={(e) =>
                      setTemplate({ ...template, style: { ...template.style, panelColor: e.target.value } })
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className={uiLabel}>
                  Intro label
                  <input
                    className={`${uiInput} mt-1`}
                    value={template.style.introLabel}
                    onChange={(e) =>
                      setTemplate({ ...template, style: { ...template.style, introLabel: e.target.value } })
                    }
                  />
                </label>
                <label className={uiLabel}>
                  Outro label
                  <input
                    className={`${uiInput} mt-1`}
                    value={template.style.outroLabel}
                    onChange={(e) =>
                      setTemplate({ ...template, style: { ...template.style, outroLabel: e.target.value } })
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={template.style.animationEnabled}
                  onChange={(e) =>
                    setTemplate({ ...template, style: { ...template.style, animationEnabled: e.target.checked } })
                  }
                />
                Enable animation
              </label>
            </div> : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setSubtitlesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Scene subtitles & timing</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {subtitlesOpen ? "−" : "+"}
              </span>
            </button>
            {subtitlesOpen ? <>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Subtitles and SRT cues follow <strong className="text-slate-300">scene order</strong> (intro, content,
              outro). Edit lines, then use <strong className="text-slate-300">Adjust timings from lines</strong> to
              reset durations after text changes.
            </p>
            <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-500 sm:text-[11px]">
                <p className="leading-snug">
                  <strong className="text-slate-300">Overall picture time</strong> (sum of frame durations):{" "}
                  <span className="font-mono text-[#22c55e] tabular-nums">{totalDuration.toFixed(1)}s</span>
                </p>
                <p className="leading-snug">
                  <strong className="text-slate-300">Overall script</strong> (est. voiceover at {DEFAULT_VOICEOVER_WPM} wpm):{" "}
                  <span className="font-mono text-[#22d3ee] tabular-nums">{scriptEstimateSec.toFixed(1)}s</span>
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="min-w-0 flex-1 sm:min-w-[10rem]">
                  <button
                    type="button"
                    onClick={syncCaptionsFromScript}
                    className="w-full rounded-md border border-emerald-300/30 px-3 py-2 text-sm font-black text-slate-950 transition hover:brightness-105"
                    style={{ backgroundColor: "#4ade80" }}
                  >
                    Sync captions from script
                  </button>
                </div>
                <div className="min-w-0 flex-1 sm:min-w-[10rem]">
                  <button
                    type="button"
                    onClick={adjustTimingsFromCaptionLines}
                    className="w-full rounded-md border border-emerald-300/30 px-3 py-2 text-sm font-black text-slate-950 transition hover:brightness-105"
                    style={{ backgroundColor: "#4ade80" }}
                  >
                    Adjust timings from lines
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-600">
                Sync fills caption lines from the current script. After line edits, use Adjust to rebalance all Dur
                (s) by word share. Min 0.2s per scene.
              </p>
            </div>
            {subtitlesSyncMsg ? <p className="mt-2 text-[10px] text-[#22c55e]">{subtitlesSyncMsg}</p> : null}
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => {
                  const on = e.target.checked;
                  setBurnSubtitles(on);
                  if (!on) setBurnSubtitlesReplaceSlideText(false);
                }}
              />
              Burn subtitles into video (FFmpeg)
            </label>
            <label
              className={`mt-2 flex flex-col gap-1 text-[11px] leading-snug text-slate-400 ${burnSubtitles ? "" : "opacity-40"}`}
            >
              <span className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={burnSubtitlesReplaceSlideText}
                  disabled={!burnSubtitles}
                  onChange={(e) => setBurnSubtitlesReplaceSlideText(e.target.checked)}
                />
                Replace slide headline/subline with styled subtitles (ASS)
              </span>
              {burnSubtitles && burnSubtitlesReplaceSlideText ? (
                <span className="pl-6 text-[10px] text-slate-500">
                  Hides text on PNG slides and burns ASS that follows your Style panel (font size, panel and highlight
                  colours), at about double slide font size for legibility on video. Render scenes again after toggling.
                </span>
              ) : null}
            </label>
            {burnSubtitles && burnSubtitlesReplaceSlideText ? (
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                <strong className="text-slate-300">Duration</strong> sets how long each PNG shows (seconds). Burned
                subtitles follow your <strong className="text-slate-400">voiceover script</strong> (split across
                frames) when that field is set; otherwise headline + subline from the slide editor.
              </p>
            ) : (
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                <strong className="text-slate-300">Duration</strong> sets how long each PNG shows (seconds). Match scene
                lengths to your voiceover script or TTS so audio lines up with each frame. Use the caption field on each
                row for plain SRT text when not using ASS burn.
              </p>
            )}
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
              {template.slides.map((s, i) => (
                <div key={`scene-${s.id}-${i}`} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                  <span className="shrink-0 pt-1 text-[10px] font-mono text-[#eab308]" title={s.id}>
                    {previewLabelForSlide(s, i)}
                  </span>
                  {burnSubtitles && burnSubtitlesReplaceSlideText ? (
                    <p className="min-w-0 flex-1 rounded border border-[#1f2d26]/80 bg-[#0a0e0c]/80 px-2 py-1 text-[11px] leading-snug text-slate-300">
                      {decodeHtmlEntities(captionLineForTimingRow(s, i))}
                    </p>
                  ) : (
                    <input
                      className="min-w-0 flex-1 rounded border border-[#1f2d26] bg-[#0a0e0c] px-2 py-1 text-xs"
                      value={s.subline}
                      onChange={(e) => updateSlide(i, { subline: e.target.value })}
                      placeholder="Caption / subtitle line"
                    />
                  )}
                  <label className="flex shrink-0 items-center gap-1 pt-1 text-[10px] text-slate-500">
                    <span className="whitespace-nowrap">Dur (s)</span>
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      className="w-16 rounded border border-[#1f2d26] bg-[#0a0e0c] px-1 py-1 text-xs text-white"
                      value={s.durationSec}
                      onChange={(e) => updateSlide(i, { durationSec: Math.max(0.2, Number(e.target.value) || 0.2) })}
                    />
                  </label>
                </div>
              ))}
            </div>
            </> : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setDraftOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Template Draft</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {draftOpen ? "−" : "+"}
              </span>
            </button>
            {draftOpen ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-slate-500">Save/load this News Shorts setup locally in your browser.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={saveTemplateDraft}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
                    onClick={loadTemplateDraft}
                  >
                    Load draft
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300"
                    onClick={clearTemplateDraft}
                  >
                    Clear
                  </button>
                </div>
                {draftMsg ? <p className="text-[10px] text-[#22c55e]">{draftMsg}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <button
              type="button"
              onClick={() => setJsonOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-black uppercase tracking-wide text-white">Export-ready JSON</h2>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-sm leading-none text-[#eab308]"
                style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface)" }}
              >
                {jsonOpen ? "−" : "+"}
              </span>
            </button>
            {jsonOpen ? <>
              <p className="mt-1 text-xs text-slate-400">Editable template data + FFmpeg/Remotion-friendly render plan.</p>
              <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] text-slate-200">
                {JSON.stringify(
                  {
                    template,
                    ffmpegPlan,
                    seoInput,
                    seoTemplate,
                    videoRecordLayout,
                    videoRecordCirclePosition,
                    videoRecordOrientation,
                    useVideoAudio,
                  },
                  null,
                  2,
                )}
              </pre>
            </> : null}
          </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-6 lg:col-start-2">
          <Panel title="Creative Studio">
            <p className="text-[11px] leading-snug text-slate-500">
              Choose output format and layout preset. Shorts and Portrait are both 1080×1920 with different layout
              rules; Landscape is 1920×1080. Changing format updates preview, safe guides, and typography defaults — it
              does not delete slide text or images.
            </p>
            <label className={`${uiLabel} mt-2`}>
              Format
              <select
                className={`${uiInput} mt-1`}
                value={creativeFmtResolved}
                onChange={(e) => {
                  const next = e.target.value as CreativeVideoFormatId;
                  setTemplate((prev) => ({
                    ...prev,
                    creativeVideoFormat: next,
                    creativeLayoutPreset: defaultLayoutPresetForFormat(next),
                    style: mergeStyleDefaultsForCreativeFormat(next, prev.style),
                  }));
                  setRenderResult(null);
                  setBuildResult(null);
                }}
              >
                <option value="shorts_vertical">Shorts</option>
                <option value="portrait_video">Portrait</option>
                <option value="landscape_video">Landscape</option>
              </select>
            </label>
            <label className={`${uiLabel} mt-2`}>
              Layout preset
              <select
                className={`${uiInput} mt-1`}
                value={creativeLayoutPresetResolved}
                onChange={(e) => setTemplate({ ...template, creativeLayoutPreset: e.target.value })}
              >
                {layoutPresetsForFormat(creativeFmtResolved).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </Panel>
          <Panel title="Content preview">
            <div className="rounded-lg border border-[#1f2d26] bg-[#091127] p-3">
              <div className={`${previewAspectShell} relative flex items-center justify-center overflow-hidden rounded-md border border-[#1f2d26] bg-black`}>
                {(() => {
                  const rendered = renderResult?.images.find((img) => img.sceneId === previewSlide.id);
                  const rel = rendered?.rel || relFromRenderedPath(rendered?.path);
                  const previewIndex = template.slides.findIndex((s) => s.id === previewSlide.id);
                  const hideMeta = previewIndex === 0 || previewIndex === 2;
                  const showAss =
                    burnSubtitles &&
                    burnSubtitlesReplaceSlideText &&
                    Boolean(voiceoverScript.trim()) &&
                    Boolean(rel);
                  const dubPack = showAss
                    ? buildNewsShortSceneSubtitlePack({
                        burnStyledSubtitles: true,
                        voiceoverScript,
                        sceneIndex: Math.max(0, previewIndex),
                        sceneCount: template.slides.length,
                        slideHeadline: previewSlide.headline,
                        slideSubline: previewSlide.subline,
                        textBoxWidthPct: template.style.textBoxWidthPct,
                        slideFontSize: template.style.fontSize,
                        lineHeight: template.style.lineHeight,
                        busyMotionBackdrop: Boolean(motionBackdropPreviewUrl),
                        frameWidth: creativeCanvasDims.width,
                        frameHeight: creativeCanvasDims.height,
                      })
                    : null;
                  const highlightSource = dubPack?.displayText.trim() ?? "";
                  const assHighlightWords = showAss
                    ? highlightWordsForCaption(highlightSource, previewSlide.highlightWords)
                    : previewSlide.highlightWords;
                  const showAssOverlay = Boolean(highlightSource);
                  const fontBundlePrev = resolveNewsShortFontBundle(template.style.headlineFont ?? "roboto-condensed");
                  const headlineFw = template.style.headlineFont === "bebas-neue" ? 400 : 900;
                  const highlightFw = template.style.headlineFont === "bebas-neue" ? 700 : 900;
                  /** Dub overlay: match ASS bold; Bebas was 400 here — use 700 without changing layout metrics. */
                  const dubOverlayBaseFw = template.style.headlineFont === "bebas-neue" ? 700 : headlineFw;
                  const panelTextPx = Math.max(22, template.style.fontSize / 2.7);
                  const dubBottomPct = dubPack?.previewBottomPct ?? 0;

                  const dubOverlay = showAssOverlay && dubPack ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 flex flex-col justify-end"
                      style={{ bottom: `${dubBottomPct}%` }}
                    >
                      <div
                        className="w-full px-4 pt-3 pb-4"
                        style={{
                          background: newsShortMotionPanelGradient(motionDimStrength),
                          borderTop: newsShortMotionPanelBorder(),
                          boxShadow: "0 -12px 48px rgba(0,0,0,0.85)",
                        }}
                      >
                        <div style={{ maxWidth: `${template.style.textBoxWidthPct}%`, margin: "0 auto" }}>
                          <div className="flex flex-col items-stretch gap-0.5">
                            {dubPack.wrappedLines.map((ln, li) => (
                              <p
                                key={`dubln-${li}`}
                                className="text-center uppercase"
                                style={{
                                  fontSize: `${panelTextPx}px`,
                                  lineHeight: template.style.lineHeight,
                                  fontFamily: fontBundlePrev.cssFontFamily,
                                  fontWeight: dubOverlayBaseFw,
                                }}
                              >
                                {withHighlights(
                                  decodeHtmlEntities(ln).toUpperCase(),
                                  assHighlightWords,
                                  template.style.highlightColor || lime,
                                  highlightFw,
                                  dubOverlayBaseFw,
                                  resolvedPanelTextColorForNewsShort(template) ?? "#ffffff",
                                )}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null;

                  if (!rel) {
                    return (
                      <>
                        <CreativeStudioSafeZoneOverlay format={creativeFmtResolved} />
                        <PreviewSlide
                          slide={previewSlide}
                          style={template.style}
                          brandTemplateId={template.brandTemplateId}
                          imageUrl={hasMotionBackdrop ? "" : previewSlide.imageUrl || template.heroImage}
                          backdropVideoSrc={motionBackdropPreviewUrl}
                          hideLabel={hideMeta}
                          hideSubline={hideMeta}
                          motionDimStrength={motionDimStrength}
                          motionOpaqueOpacity={motionOpaqueOpacity}
                          creativeVideoFormat={creativeFmtResolved}
                        />
                      </>
                    );
                  }
                  if (motionBackdropPreviewUrl) {
                    return (
                      <div className="absolute inset-0 h-full w-full">
                        <CreativeStudioSafeZoneOverlay format={creativeFmtResolved} />
                        <video
                          src={motionBackdropPreviewUrl}
                          className="absolute inset-0 h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                          autoPlay
                        />
                        <div
                          className="absolute inset-0 z-[1]"
                          style={newsShortMotionOpaqueOverlayStyle(motionOpaqueOpacity)}
                        />
                        <div
                          className="absolute inset-0 z-[2]"
                          style={newsShortMotionDimOverlayStyle(motionDimStrength)}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/file?rel=${encodeURIComponent(rel)}`}
                          alt=""
                          className="absolute inset-0 z-[3] h-full w-full object-contain"
                        />
                        {dubOverlay}
                      </div>
                    );
                  }
                  return (
                    <div className="absolute inset-0 h-full w-full">
                      <CreativeStudioSafeZoneOverlay format={creativeFmtResolved} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/file?rel=${encodeURIComponent(rel)}`}
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                      {dubOverlay}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {template.slides.map((slide, i) => {
                const isActive = slide.id === previewSlide.id;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setPreviewSlideId(slide.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? "border-[#eab308] bg-[#0b132a] text-[#eab308]"
                        : "border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <span className="font-mono text-xs lowercase">{previewLabelForSlide(slide, i)}</span>
                    <span className="ml-3 truncate text-right text-sm text-slate-300">
                      {slide.headline || slide.subline || `Slide ${i + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Caption</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                {template.slides
                  .map((s, i) => [
                    s.headline,
                    i === 0 || i === 2 ? "" : s.subline,
                  ].filter(Boolean).join(". "))
                  .filter(Boolean)
                  .join(" ")}
              </p>
            </div>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-start-3">
          <Panel title="Video">
            <div className="rounded-lg border border-[#1f2d26] bg-[#091127] p-3">
              {buildResult?.videoRel ? (
                <>
                  <video
                    src={`/api/file?rel=${encodeURIComponent(buildResult.videoRel)}`}
                    controls
                    playsInline
                    className={`${previewAspectShell} rounded-md border border-[#1f2d26] bg-black object-contain`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <a
                      className="font-semibold text-[#86efac] underline underline-offset-2 hover:text-[#bbf7d0]"
                      href={withAppPathPrefix(`/api/file?rel=${encodeURIComponent(buildResult.videoRel)}&download=1`)}
                      download={seoFriendlyMp4Filename}
                    >
                      Download MP4
                    </a>
                    {seoFriendlyMp4Filename ? (
                      <span className="font-mono text-[11px] text-slate-500">
                        Save as: {seoFriendlyMp4Filename}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] leading-snug text-slate-400">
                    {motionBackdropPreviewUrl
                      ? "Motion is composited in Content preview. Build video to generate and preview the final MP4 here."
                      : "Build video to preview and download the MP4 here."}
                  </p>
                  {motionBackdrop.rel ? (
                    <p className="font-mono text-[10px] text-slate-500 break-all">{motionBackdrop.rel}</p>
                  ) : null}
                  <div
                    className={`flex ${previewAspectShell} items-center justify-center rounded-lg border border-dashed border-[#1f2d26] bg-[#0a0e0c] px-3 text-center text-sm text-slate-500`}
                  >
                    No MP4 yet — use Build video.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </section>
    </div>

    {backdropLibraryKind ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ns-backdrop-library-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeBackdropLibraryPicker();
        }}
      >
        <div
          className="flex max-h-[min(92vh,940px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-950 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-4 py-3">
            <h2 id="ns-backdrop-library-title" className="text-sm font-black uppercase tracking-wide text-slate-100">
              Browse library
            </h2>
            <button
              type="button"
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              onClick={closeBackdropLibraryPicker}
            >
              Close
            </button>
          </div>
          <div className="flex shrink-0 gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                backdropLibraryKind === "image"
                  ? "bg-[#1f2d26] text-[#86efac] ring-1 ring-[#22c55e]/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setBackdropLibraryKind("image")}
            >
              Stills ({backdropLibraryData?.images.length ?? 0})
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                backdropLibraryKind === "video"
                  ? "bg-[#1f2d26] text-[#86efac] ring-1 ring-[#22c55e]/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setBackdropLibraryKind("video")}
            >
              Motion ({backdropLibraryData?.videos.length ?? 0})
            </button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
            <input
              type="search"
              value={libraryBrowseQuery}
              onChange={(e) => setLibraryBrowseQuery(e.target.value)}
              placeholder="Filter by path…"
              className="min-w-[12rem] flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
            />
            <span className="text-xs text-slate-500">
              {backdropLibraryKind === "image"
                ? `${libraryImagesFiltered.length} shown`
                : `${libraryVideosFiltered.length} shown`}
            </span>
            <a
              href={
                withAppPathPrefix(
                  backdropLibraryKind === "image" ? "/library?tab=libraryImages" : "/library?tab=backgroundVideo",
                )
              }
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-semibold text-[#86efac] underline hover:text-[#bbf7d0]"
            >
              Open full library
            </a>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {backdropLibraryBusy ? (
              <p className="text-sm text-slate-400">Loading library…</p>
            ) : backdropLibraryKind === "image" ? (
              libraryImagesFiltered.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {libraryImagesFiltered.map((rel) => (
                    <div
                      key={rel}
                      className="flex flex-col rounded-lg border border-slate-700 bg-black/50 p-2 shadow-inner"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={withAppPathPrefix(`/api/file?rel=${encodeURIComponent(rel)}`)}
                        alt=""
                        className="mx-auto aspect-[9/16] w-full max-h-64 rounded-md object-cover bg-black"
                      />
                      <p className="mt-2 line-clamp-3 break-all font-mono text-[9px] leading-tight text-slate-500">
                        {rel}
                      </p>
                      <button
                        type="button"
                        className="mt-2 w-full rounded-md border border-[#22c55e]/50 bg-[#22c55e]/15 py-1.5 text-xs font-semibold text-[#86efac] hover:bg-[#22c55e]/25"
                        onClick={() => pickBackdropLibraryImage(rel)}
                      >
                        Use this still
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-slate-500">
                  No library stills match this filter. Upload above or add files under{" "}
                  <code className="text-slate-400">output/images/library/</code>, or open the{" "}
                  <a
                    href={withAppPathPrefix("/library?tab=libraryImages")}
                    className="text-[#86efac] underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Library images
                  </a>{" "}
                  tab.
                </p>
              )
            ) : libraryVideosFiltered.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {libraryVideosFiltered.map((rel) => (
                  <div
                    key={rel}
                    className="flex flex-col rounded-lg border border-slate-700 bg-black/50 p-2 shadow-inner"
                  >
                    <video
                      src={withAppPathPrefix(`/api/file?rel=${encodeURIComponent(rel)}`)}
                      poster={withAppPathPrefix(`/api/file?rel=${encodeURIComponent(inferredBackdropPosterRelFromVideo(rel))}`)}
                      muted
                      playsInline
                      controls
                      preload="metadata"
                      className="mx-auto aspect-[9/16] w-full max-h-72 rounded-md bg-black object-contain"
                    />
                    <p className="mt-2 line-clamp-3 break-all font-mono text-[9px] leading-tight text-slate-500">
                      {rel}
                    </p>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-md border border-[#22c55e]/50 bg-[#22c55e]/15 py-1.5 text-xs font-semibold text-[#86efac] hover:bg-[#22c55e]/25"
                      onClick={() => pickBackdropLibraryVideo(rel)}
                    >
                      Use this clip
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500">
                No motion clips match this filter. Import Runway output, save a camera recording, or open{" "}
                <a
                  href={withAppPathPrefix("/library?tab=backgroundVideo")}
                  className="text-[#86efac] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Background video
                </a>{" "}
                in the library.
              </p>
            )}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
