"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import type {
  ContentFormat,
  F1GridBundle,
  F1ResultsBundle,
  FootballLineupBundle,
  GeneratedContent,
  PlanetFootballTableBundle,
  RunnerSilks,
  SceneSpec,
  TeamtalkNewsBundle,
  TeamLineUpBundle,
  TeamSheetBundle,
  ScoreLineBundle,
  PlanetRugbyTableBundle,
  TemplateSource,
  VoiceGender,
} from "@/types";
import {
  applyTemplateWithPreferences,
  buildRacecardScript,
  footballLineupBundleFromContent,
  materializeFromTemplate,
} from "@/app/features/content/content-generator";
import { formatLeagueTableAiContext } from "@/app/lib/league-table-ai-context";
import {
  normalizePlanetFootballDisplayBrand,
  planetFootballBrandDefaults,
} from "@/app/lib/planet-football-table-brands";
import { EDITOR_VOICEOVER_WRITER_PROMPT, LEAGUE_TABLE_EDITOR_VOICEOVER_PROMPT } from "@/app/lib/prompts-catalog";
import { Panel } from "@/app/components/Panel";
import { EditorCollapsible } from "@/app/features/editor/EditorCollapsible";
import { R365Button } from "@/app/components/R365Button";
import { FootballLineupsEditor } from "@/app/features/editor/FootballLineupsEditor";
import { TeamLineUpEditor } from "@/app/features/editor/TeamLineUpEditor";
import { TeamSheetEditor } from "@/app/features/editor/TeamSheetEditor";
import { ScoreLineEditor } from "@/app/features/editor/ScoreLineEditor";
import { RacingTemplateEditor } from "@/app/features/editor/RacingTemplateEditor";
import { SceneImageEditor } from "@/app/features/editor/SceneImageEditor";
import { EditorBackgroundVideoPanel } from "@/app/features/editor/EditorBackgroundVideoPanel";
import { CreativeVideoGeneratorContent } from "@/app/features/editor/CreativeVideoGeneratorContent";
import { VoiceoverPanel } from "@/app/features/editor/voiceover/VoiceoverPanel";
import {
  VOICE_PRESET_OPTIONS,
  type CreatorProfileOption,
  type DeliveryStyle,
  type ElevenlabsVoiceOption,
  type ToneStyle,
  type VoicePreset,
  type VoiceProviderPreference,
  type VoiceStyle,
} from "@/app/features/editor/voiceover/types";
import { pickRacingCommentatorVoiceId } from "@/app/lib/racing-voice-defaults";
import type { CompositorLayer } from "@/app/lib/compositor-types";
import { compositorLayersToDataUrl, stripLegacyFastResultsBoardOverlayLayers } from "@/app/lib/compositor-canvas";
import { sceneDisplayLabel } from "@/app/lib/scene-display-labels";
import { parseApiJson, pollVideoBuildJob } from "@/app/lib/parse-api-json";
import { requestRenderedScenes } from "@/app/lib/request-render-scenes";
import { sanitizeVideoBuildError } from "@/app/lib/video-build-jobs";
import { BRAND_SHORT_SINGULAR, BRAND_SHORTS } from "@/app/lib/brand";
import {
  computeSyncFromScript,
  DEFAULT_VOICEOVER_WPM,
  effectiveSceneCaption,
  estimateVoiceoverDurationSec,
  recalculateDurationsFromCaptionLines,
  splitScriptIntoSceneCaptions,
} from "@/app/lib/script-scene-captions";
import {
  applyDataFeedImport,
  exportDataFeedKeyValueCsv,
  parseDataFeedKeyValueCsv,
} from "@/app/lib/data-feed-csv";
import {
  exportDataFeedApiJsonV1String,
  PENDING_TEMPLATE_FEED_STORAGE_KEY,
  parseDataFeedJsonDocument,
} from "@/app/lib/data-feed-json";
import { coalesceGlobalBackgroundImageRel } from "@/app/lib/background-image-rel";
import { inferredBackdropPosterRelFromVideo } from "@/app/lib/backdrop-poster-rel";
import {
  clampMotionBackdropDimStrength,
  clampMotionBackdropOpaqueOpacity,
} from "@/app/lib/news-short-motion-layout";
import { mergeBackdropIntoContent } from "@/app/lib/template-backdrop-merge";
import { buildRacecardRunwayI2vFields } from "@/app/lib/racecard-runway-i2v-fields";
import { buildEditorRunwayI2vFields } from "@/app/lib/editor-runway-i2v-fields";
import { firstRunwayTaskOutputUrl } from "@/app/lib/runway-task-output";
import { RunwayImageToVideoPanel } from "@/app/features/runway/RunwayImageToVideoPanel";
import { studioApiPath, withAppPathPrefix } from "@/app/lib/app-base-path";
import { optimiseClientImageFile } from "@/app/lib/client-image-optimise";

type EditorType =
  | "next-off"
  | "fast-results"
  | "racecard"
  | "football-lineups"
  | "teamtalk-news"
  | "f1-grid"
  | "f1-results"
  | "planet-football-table"
  | "planet-rugby-table"
  | "team-line-up"
  | "team-sheet"
  | "score-line";

const formatMap: Record<EditorType, ContentFormat> = {
  "next-off": "next-off",
  "fast-results": "fast-results",
  racecard: "racecard",
  "football-lineups": "football-lineups",
  "teamtalk-news": "teamtalk-news",
  "f1-grid": "f1-grid",
  "f1-results": "f1-results",
  "planet-football-table": "planet-football-table",
  "planet-rugby-table": "planet-rugby-table",
  "team-line-up": "team-line-up",
  "team-sheet": "team-sheet",
  "score-line": "score-line",
};

function defaultVoicePresetForEditorType(t: EditorType): VoicePreset {
  if (t === "next-off" || t === "fast-results" || t === "racecard") {
    return "Racing365 - British - Commentator";
  }
  return "Female - Clean";
}

function fileUrl(rel: string, cacheBust?: number) {
  const q = `rel=${encodeURIComponent(rel)}`;
  const path = cacheBust != null ? `/api/file?${q}&_=${cacheBust}` : `/api/file?${q}`;
  return withAppPathPrefix(path);
}

function toOutputRel(absPath?: string) {
  if (!absPath) return "";
  const normalized = absPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const marker = "/output/";
  const idx = absPath.indexOf(marker);
  if (idx >= 0) return absPath.slice(idx + marker.length).replace(/^\/+/, "");
  const parts = absPath.split("output/");
  if (parts.length > 1) return parts[parts.length - 1]!.replace(/^\/+/, "");
  if (normalized.startsWith("video/") || normalized.startsWith("uploads/")) return normalized;
  return normalized;
}

async function probeExistingBuiltVideo(contentId: string): Promise<string | null> {
  const candidates = [`video/${contentId}-short-edited.mp4`, `video/${contentId}-short.mp4`];
  for (const rel of candidates) {
    const res = await fetch(studioApiPath(`/api/video-meta?rel=${encodeURIComponent(rel)}`), { cache: "no-store" });
    if (res.ok) return rel;
  }
  return null;
}

function sanitizeDownloadPart(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "preview";
}

type CompositorSceneState = Record<string, CompositorLayer[]>;

/** Identical sizing for Video + Content preview frames (9:16) with a taller portrait viewport. */
const EDITOR_PREVIEW_FRAME =
  "mx-auto aspect-[9/16] w-full max-w-md max-h-[min(82vh,900px)]";

type VideoBuildMode = "shorts" | "portrait" | "landscape";

const VIDEO_BUILD_DIMENSIONS: Record<VideoBuildMode, { width: number; height: number; label: string }> = {
  shorts: { width: 1080, height: 1920, label: "Shorts (1080×1920)" },
  portrait: { width: 1080, height: 1350, label: "Portrait (1080×1350)" },
  landscape: { width: 1920, height: 1080, label: "Landscape (1920×1080)" },
};

function templateDataTabLabel(fmt: ContentFormat): string {
  switch (fmt) {
    case "next-off":
      return "Template data — Next off";
    case "fast-results":
      return "Template data — Fast results";
    case "racecard":
      return "Template data — Racecard";
    case "teamtalk-news":
      return "Template data — TEAMtalk News";
    case "f1-grid":
      return "Template data — F1 Starting Grid";
    case "f1-results":
      return "Template data — F1 Race Results";
    case "planet-football-table":
      return "Template data — Planet Football Table";
    case "planet-rugby-table":
      return "Template data — Planet Rugby Table";
    case "team-line-up":
      return "Template data — Team Line-Up";
    case "team-sheet":
      return "Template data — Team Sheet";
    case "score-line":
      return "Template data — Score Line";
    case "football-lineups":
      return "Template data";
    default:
      return "Template data";
  }
}

type AiImproveResponse = {
  voiceover_script: string;
  short_caption: string;
  version_a: string;
  version_b: string;
  version_c: string;
};
type RunwayTaskJson = {
  id?: string;
  status?: "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress?: number;
  failure?: string;
  output?: unknown;
};
type PreviewImageFormat = "png" | "jpg";

/** Retina-class export when saving preview (matches sharp screen grabs). */
const PREVIEW_EXPORT_PIXEL_RATIO = 2;
const PREVIEW_JPG_QUALITY = 0.98;
const AI_DEFAULT_PROMPT = EDITOR_VOICEOVER_WRITER_PROMPT;

function aiDefaultPromptForFormat(format: ContentFormat): string {
  if (format === "planet-football-table" || format === "planet-rugby-table") {
    return LEAGUE_TABLE_EDITOR_VOICEOVER_PROMPT;
  }
  return EDITOR_VOICEOVER_WRITER_PROMPT;
}

function isHorseRacingFormat(fmt: ContentFormat): fmt is "next-off" | "fast-results" | "racecard" {
  return fmt === "next-off" || fmt === "fast-results" || fmt === "racecard";
}

const T2I_PROMPT_MAX_CHARS = 1000;
const T2I_PROMPT_SAFE_CHARS = 980;

function clampT2iPrompt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= T2I_PROMPT_SAFE_CHARS ? trimmed : `${trimmed.slice(0, T2I_PROMPT_SAFE_CHARS - 3)}...`;
}

function describeSilksForPrompt(silks: RunnerSilks | undefined): string {
  if (!silks) return "silks unknown";
  if (silks.silkCode?.trim()) return `silk code ${silks.silkCode.trim()}`;
  if (silks.imageUrl?.trim()) return "silks via image URL";
  const parts = [
    silks.body ? `body ${silks.body}` : "",
    silks.secondary ? `secondary ${silks.secondary}` : "",
    silks.cap ? `cap ${silks.cap}` : "",
    silks.pattern ? `pattern ${silks.pattern}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "silks unknown";
}

function buildHorseRacingT2iPrompt(content: GeneratedContent): string {
  const source = content.templateSource;
  const racecourse =
    source?.format === "next-off"
      ? source.bundle.race.course
      : source?.format === "fast-results"
        ? source.bundle.result.race.course
        : source?.format === "racecard"
          ? source.snapshot.race.course
          : "Unknown racecourse";
  const country = "UK";
  const raceMeta =
    source?.format === "racecard"
      ? {
          raceTime: source.snapshot.race.raceTime,
          title: source.snapshot.race.title,
          distance: source.snapshot.race.distance,
          going: source.snapshot.race.going,
          runnersCount: source.snapshot.race.runnersCount,
        }
      : source?.format === "next-off"
        ? {
            raceTime: source.bundle.race.raceTime,
            title: source.bundle.race.title,
            distance: source.bundle.race.distance,
            going: source.bundle.race.going,
            runnersCount: source.bundle.race.runnersCount,
          }
        : source?.format === "fast-results"
          ? {
              raceTime: source.bundle.result.race.raceTime,
              title: source.bundle.result.race.title,
              distance: source.bundle.result.race.distance,
              going: source.bundle.result.race.going,
              runnersCount: source.bundle.result.race.runnersCount,
            }
          : null;
  const horseLinesRaw =
    source?.format === "next-off"
      ? source.bundle.tips.map((t) => {
          const stall = t.silks?.altText?.trim() || "unknown";
          return `${t.horse} (stall ${stall}, ${describeSilksForPrompt(t.silks)})`;
        })
      : source?.format === "fast-results"
        ? [
            `${source.bundle.result.winner} (stall unknown, silks unknown)`,
            ...source.bundle.result.placings.map(
              (p) => `${p.horse} (stall unknown, ${describeSilksForPrompt(p.silks)})`,
            ),
          ]
        : source?.format === "racecard"
          ? source.snapshot.runners.slice(0, 12).map(
              (r) => `${r.horse} (stall ${r.draw ?? "unknown"}, ${describeSilksForPrompt(r.silks)})`,
            )
          : [];
  const horseLines = horseLinesRaw.slice(0, 6).join("; ");

  const compactPrompt = `Photorealistic horse-racing broadcast still at ${racecourse}, ${country}. Real UK racecourse look: green turf, white rails, traditional grandstand, trees, overcast daylight. Include 4-8 horses mid-gallop in natural spacing. Jockey silks must be unique and match template race data references: ${horseLines || "silks from template data"}. Scene: choose trackside left-to-right OR finish-line approach. Keep centre/lower-middle clean for overlays, horses slightly off-centre, no clutter. Strict negatives: no sun, sunset, orange sky, dramatic lighting, fantasy, desert, text, logos, watermarks, readable signage. Race meta: ${raceMeta?.raceTime ?? "?"} ${raceMeta?.title ?? ""}, ${raceMeta?.distance ?? ""}, going ${raceMeta?.going ?? "?"}, runners ${raceMeta?.runnersCount ?? "?"}. Generate a different composition each run while staying faithful to race data and silks.`;
  return clampT2iPrompt(compactPrompt);
}

/** TEAMtalk middle scene: full body copy lives in `data.secondaryParagraph`; caption is truncated for UI. */
function teamtalkDetailParagraphFromContent(content: GeneratedContent): string {
  const placings = content.scenes.find((s) => s.id === "placings");
  const fromScene =
    placings && typeof placings.data.secondaryParagraph === "string"
      ? placings.data.secondaryParagraph.trim()
      : "";
  if (fromScene) return fromScene;
  if (content.templateSource?.format === "teamtalk-news") {
    return (content.templateSource.bundle.secondaryParagraph ?? "").trim();
  }
  return "";
}

function aiFieldFromScenes(content: GeneratedContent) {
  const byId = (id: string) =>
    content.scenes.find((s) => s.id === id)?.captionLine?.trim() ?? "";
  const teamtalkDetail =
    content.format === "teamtalk-news" ? teamtalkDetailParagraphFromContent(content) : "";
  const leagueTableStandings =
    content.format === "planet-football-table" || content.format === "planet-rugby-table"
      ? formatLeagueTableAiContext(content, content.templateSource)
      : "";
  return {
    intro: byId("intro"),
    "tip-1": byId("tip-1") || byId("winner") || byId("table-1"),
    /** Middle-scene subtitle on card (TEAMtalk detail slide may be truncated — full copy is `detail_paragraph`). */
    "tip-2": byId("tip-2") || byId("placings"),
    "tip-3": byId("tip-3") || byId("results2"),
    outro: byId("outro"),
    caption: content.caption?.trim() ?? "",
    voiceover_script: content.script?.trim() ?? "",
    ...(content.format === "teamtalk-news" && teamtalkDetail
      ? { detail_paragraph: teamtalkDetail }
      : {}),
    ...(leagueTableStandings ? { league_table_standings: leagueTableStandings } : {}),
  };
}

const VOICE_STYLE_OPTS = ["Journalist", "Punchy Tips", "Calm / Studio", "Fast Picks"] as const satisfies readonly VoiceStyle[];

function isVoiceStyle(v: unknown): v is VoiceStyle {
  return typeof v === "string" && (VOICE_STYLE_OPTS as readonly string[]).includes(v);
}

function isDeliveryStyle(v: unknown): v is DeliveryStyle {
  return v === "Smooth" || v === "Balanced" || v === "Fast";
}

function isToneStyle(v: unknown): v is ToneStyle {
  return v === "Neutral" || v === "Confident" || v === "Urgent";
}

/** TEAMtalk News: default Improve-with-AI Voice style to Journalist unless the bundle saved an override. */
function teamtalkNewsAiStyleFromBundle(bundle: TeamtalkNewsBundle): {
  voiceStyle: VoiceStyle;
  deliveryStyle: DeliveryStyle;
  tone: ToneStyle;
} {
  return {
    voiceStyle: isVoiceStyle(bundle.aiVoiceStyle) ? bundle.aiVoiceStyle : "Journalist",
    deliveryStyle: isDeliveryStyle(bundle.aiDeliveryStyle) ? bundle.aiDeliveryStyle : "Balanced",
    tone: isToneStyle(bundle.aiTone) ? bundle.aiTone : "Neutral",
  };
}

function aiProfileFromTemplate(source: TemplateSource | undefined): {
  prompt?: string;
  voiceStyle?: VoiceStyle;
  deliveryStyle?: DeliveryStyle;
  tone?: ToneStyle;
} {
  if (!source) return {};
  if (source.format === "teamtalk-news" || source.format === "f1-grid" || source.format === "f1-results") {
    return {
      prompt: source.bundle.aiPrompt,
      voiceStyle: source.bundle.aiVoiceStyle,
      deliveryStyle: source.bundle.aiDeliveryStyle,
      tone: source.bundle.aiTone,
    };
  }
  if (source.format === "next-off" || source.format === "fast-results") {
    return {
      prompt: source.bundle.aiPrompt,
      voiceStyle: source.bundle.aiVoiceStyle,
      deliveryStyle: source.bundle.aiDeliveryStyle,
      tone: source.bundle.aiTone,
    };
  }
  if (source.format === "racecard") {
    return {
      prompt: source.snapshot.aiPrompt,
      voiceStyle: source.snapshot.aiVoiceStyle,
      deliveryStyle: source.snapshot.aiDeliveryStyle,
      tone: source.snapshot.aiTone,
    };
  }
  if (source.format === "planet-football-table" || source.format === "planet-rugby-table") {
    return {
      prompt: source.bundle.aiPrompt,
      voiceStyle: source.bundle.aiVoiceStyle,
      deliveryStyle: source.bundle.aiDeliveryStyle,
      tone: source.bundle.aiTone,
    };
  }
  return {};
}

export function EditorWorkspace({
  type,
  id,
  initialVideoBuildMode = "shorts",
  lockVideoBuildMode = false,
}: {
  type: EditorType;
  id: string;
  initialVideoBuildMode?: VideoBuildMode;
  lockVideoBuildMode?: boolean;
}) {
  const format = formatMap[type];
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [feedLine, setFeedLine] = useState<string>("");
  const [images, setImages] = useState<
    { sceneId: string; path: string; rel: string; underlayRel?: string }[]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [videoBuildStatus, setVideoBuildStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoBuildMode, setVideoBuildMode] = useState<VideoBuildMode>(initialVideoBuildMode);
  const [videoRel, setVideoRel] = useState<string | null>(null);
  const [videoPreviewNonce, setVideoPreviewNonce] = useState(0);
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  /** Background stills: output/images/library/{contentId}/ (new) or legacy uploads/{contentId}/ */
  const [backgroundImageRel, setBackgroundImageRel] = useState<string | null>(null);
  const [backgroundImageRelBySceneId, setBackgroundImageRelBySceneId] = useState<Record<string, string>>({});
  const [backgroundVideoRel, setBackgroundVideoRel] = useState<string | null>(null);
  const [backgroundVideoFrameRel, setBackgroundVideoFrameRel] = useState<string | null>(null);
  const [backdropLibraryKind, setBackdropLibraryKind] = useState<null | "image" | "video">(null);
  const [backdropLibraryData, setBackdropLibraryData] = useState<{ videos: string[]; images: string[] } | null>(
    null,
  );
  const [backdropLibraryBusy, setBackdropLibraryBusy] = useState(false);
  const [libraryBrowseQuery, setLibraryBrowseQuery] = useState("");
  const [librarySportFilter, setLibrarySportFilter] = useState("All sports");
  const [motionBackdropOpaqueOpacity, setMotionBackdropOpaqueOpacity] = useState(0.3);
  const [motionBackdropDimStrength, setMotionBackdropDimStrength] = useState(0.45);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [trimStartInput, setTrimStartInput] = useState("0");
  const [trimEndInput, setTrimEndInput] = useState("0");
  const [editVideoMsg, setEditVideoMsg] = useState<string | null>(null);
  const [editedCutOnDisk, setEditedCutOnDisk] = useState(false);
  const [templateDiskMsg, setTemplateDiskMsg] = useState<string | null>(null);
  const [subtitlesSyncMsg, setSubtitlesSyncMsg] = useState<string | null>(null);
  const [pngsStale, setPngsStale] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewImageFormat, setPreviewImageFormat] = useState<PreviewImageFormat>("png");
  const [previewSaveBusy, setPreviewSaveBusy] = useState(false);
  const [previewLibraryBusy, setPreviewLibraryBusy] = useState(false);
  const [previewSaveMsg, setPreviewSaveMsg] = useState<string | null>(null);
  const [planetRugbyLivePreviewHtml, setPlanetRugbyLivePreviewHtml] = useState<string | null>(null);
  const [browserTemplateMsg, setBrowserTemplateMsg] = useState<string | null>(null);
  const [compositorByScene, setCompositorByScene] = useState<CompositorSceneState>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [aiScriptSavedAt, setAiScriptSavedAt] = useState<number | null>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(AI_DEFAULT_PROMPT);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("Journalist");
  const [deliveryStyle, setDeliveryStyle] = useState<DeliveryStyle>("Balanced");
  const [tone, setTone] = useState<ToneStyle>("Neutral");
  const [aiOptimiseRhythm, setAiOptimiseRhythm] = useState(true);
  const [aiAddEmphasis, setAiAddEmphasis] = useState(true);
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfileOption[]>([]);
  const [selectedCreatorProfileId, setSelectedCreatorProfileId] = useState("");
  const [versionA, setVersionA] = useState("");
  const [t2iPromptText, setT2iPromptText] = useState("");
  const [t2iModel, setT2iModel] = useState<"gen4_image_turbo" | "gen4_image">("gen4_image_turbo");
  const [t2iRatio, setT2iRatio] = useState<"1080:1920" | "720:1280" | "1920:1080" | "1280:720">("1080:1920");
  const [t2iTaskId, setT2iTaskId] = useState<string | null>(null);
  const [t2iTaskJson, setT2iTaskJson] = useState<RunwayTaskJson | null>(null);
  const [t2iBusy, setT2iBusy] = useState(false);
  const [t2iError, setT2iError] = useState<string | null>(null);
  const [t2iImportBusy, setT2iImportBusy] = useState(false);
  const [t2iPromptSavedMsg, setT2iPromptSavedMsg] = useState<string | null>(null);
  const effectiveVideoBuildMode: VideoBuildMode = lockVideoBuildMode ? initialVideoBuildMode : videoBuildMode;
  const previewFrameClass =
    effectiveVideoBuildMode === "portrait"
      ? "mx-auto aspect-[4/5] w-full max-w-md max-h-[min(82vh,900px)]"
      : effectiveVideoBuildMode === "landscape"
        ? "mx-auto aspect-[16/9] w-full max-w-xl max-h-[min(72vh,720px)]"
        : EDITOR_PREVIEW_FRAME;
  const livePreviewScale =
    effectiveVideoBuildMode === "landscape" ? 1 / 3 : effectiveVideoBuildMode === "portrait" ? 0.37 : 0.375;

  const [versionB, setVersionB] = useState("");
  const [versionC, setVersionC] = useState("");
  const [aiSettingsMsg, setAiSettingsMsg] = useState<string | null>(null);
  const [aiPreviousDraft, setAiPreviousDraft] = useState<{ script: string; caption: string } | null>(null);
  const [voiceSettingsMsg, setVoiceSettingsMsg] = useState<string | null>(null);
  const [voicePreset, setVoicePreset] = useState<VoicePreset>(() => defaultVoicePresetForEditorType(type));
  const [voiceProviderPreference, setVoiceProviderPreference] = useState<VoiceProviderPreference>("auto");
  const [elevenlabsVoices, setElevenlabsVoices] = useState<ElevenlabsVoiceOption[]>([]);
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<{
    totalDefaults: number;
    labelledDefaults: number;
    unlabelledDefaults: number;
    unlabelledVoiceNames: string[];
    myVoicesCount?: number;
  } | null>(null);
  const [voiceProviderStatus, setVoiceProviderStatus] = useState<string | null>(null);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  /** Scene whose layers are shown in the image editor (synced with preview when PNGs exist). */
  const [compositorSceneId, setCompositorSceneId] = useState<string | null>(null);
  const compositorSceneIdRef = useRef<string | null>(null);
  const [compositorMsg, setCompositorMsg] = useState<string | null>(null);
  const compositorHydrateKeyRef = useRef<string>("");
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const bgVideoInputRef = useRef<HTMLInputElement>(null);
  const dataFeedCsvInputRef = useRef<HTMLInputElement>(null);
  const dataFeedJsonInputRef = useRef<HTMLInputElement>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);
  const voicePreviewAbortRef = useRef<AbortController | null>(null);
  const t2iSeededKeyRef = useRef<string>("");
  /** After server load/regenerate, skip one persist so sessionStorage draft is not overwritten by feed JSON. */
  const suppressTemplateDraftPersist = useRef(false);

  const contentId = id;
  const aiSettingsKey = `r365-ai-settings-${format}-${contentId}`;
  const voiceSettingsKey = `r365-voice-settings-${format}-${contentId}`;

  const closeBackdropLibraryPicker = useCallback(() => {
    setBackdropLibraryKind(null);
    setBackdropLibraryData(null);
    setLibraryBrowseQuery("");
    setLibrarySportFilter("All sports");
  }, []);

  const selectedCreatorProfile = useMemo(
    () => creatorProfiles.find((profile) => profile.id === selectedCreatorProfileId) ?? null,
    [creatorProfiles, selectedCreatorProfileId],
  );

  useEffect(() => {
    let active = true;
    const loadCreatorProfiles = async () => {
      try {
        const res = await fetch(studioApiPath("/api/language/governance"), { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          journalistProfiles?: Array<CreatorProfileOption & { active?: boolean }>;
        };
        if (!active || !Array.isArray(data.journalistProfiles)) return;
        setCreatorProfiles(
          data.journalistProfiles
            .filter((profile) => profile.active !== false)
            .map((profile) => ({
              id: String(profile.id ?? "").trim(),
              name: String(profile.name ?? "").trim(),
              brand: String(profile.brand ?? "").trim(),
              sports: Array.isArray(profile.sports) ? profile.sports.map(String).filter(Boolean) : [],
              styleNotes: String(profile.styleNotes ?? "").trim(),
              articleGuidelines: profile.articleGuidelines?.trim(),
              exampleTitles: Array.isArray(profile.exampleTitles)
                ? profile.exampleTitles.map(String).filter(Boolean).slice(0, 8)
                : [],
            }))
            .filter((profile) => profile.id && profile.name && profile.styleNotes),
        );
      } catch {
        if (active) setCreatorProfiles([]);
      }
    };
    void loadCreatorProfiles();
    return () => {
      active = false;
    };
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

  useEffect(() => {
    const ts = content?.templateSource;
    if (!ts || ts.format === "football-lineups") return;
    const root = ts.format === "racecard" ? ts.snapshot : ts.bundle;
    setMotionBackdropOpaqueOpacity(
      clampMotionBackdropOpaqueOpacity(
        (root as { motionBackdropOpaqueOpacity?: number }).motionBackdropOpaqueOpacity ?? 0.3,
      ),
    );
    setMotionBackdropDimStrength(
      clampMotionBackdropDimStrength(
        (root as { motionBackdropDimStrength?: number }).motionBackdropDimStrength ?? 0.45,
      ),
    );
  }, [content?.templateSource]);

  const libraryImagesFiltered = useMemo(() => {
    const imgs = backdropLibraryData?.images ?? [];
    const q = libraryBrowseQuery.trim().toLowerCase();
    return imgs.filter((rel) => {
      const lower = rel.toLowerCase();
      const sportOk = librarySportFilter === "All sports" || lower.includes(librarySportFilter.toLowerCase());
      const queryOk = !q || lower.includes(q);
      return sportOk && queryOk;
    });
  }, [backdropLibraryData?.images, libraryBrowseQuery, librarySportFilter]);

  const libraryVideosFiltered = useMemo(() => {
    const vids = backdropLibraryData?.videos ?? [];
    const q = libraryBrowseQuery.trim().toLowerCase();
    return vids.filter((rel) => {
      const lower = rel.toLowerCase();
      const sportOk = librarySportFilter === "All sports" || lower.includes(librarySportFilter.toLowerCase());
      const queryOk = !q || lower.includes(q);
      return sportOk && queryOk;
    });
  }, [backdropLibraryData?.videos, libraryBrowseQuery, librarySportFilter]);

  const librarySportOptions = useMemo(() => {
    const rels = [...(backdropLibraryData?.images ?? []), ...(backdropLibraryData?.videos ?? [])];
    const sports = [
      ["Football", ["football", "f365", "premier-league", "champions-league", "europa", "fa-cup"]],
      ["Horse Racing", ["racing", "horse", "racecard", "racing365", "cheltenham", "ascot"]],
      ["Formula 1", ["formula-1", "f1", "planetf1", "grand-prix"]],
      ["Rugby Union", ["rugby-union", "planet-rugby", "six-nations"]],
      ["Rugby League", ["rugby-league", "super-league"]],
      ["Cricket", ["cricket", "ashes"]],
      ["Golf", ["golf", "masters", "ryder-cup"]],
      ["Tennis", ["tennis", "wimbledon", "atp", "wta"]],
    ] as const;
    return [
      "All sports",
      ...sports
        .filter(([, needles]) => rels.some((rel) => needles.some((needle) => rel.toLowerCase().includes(needle))))
        .map(([sport]) => sport),
    ];
  }, [backdropLibraryData?.images, backdropLibraryData?.videos]);

  const t2iPreviewUrl = useMemo(() => {
    if (!t2iTaskJson || t2iTaskJson.status !== "SUCCEEDED") return null;
    return firstRunwayTaskOutputUrl(t2iTaskJson as Record<string, unknown>);
  }, [t2iTaskJson]);

  const openBackdropLibraryPicker = async (kind: "image" | "video") => {
    setBackdropLibraryKind(kind);
    setLibraryBrowseQuery("");
    setBackdropLibraryBusy(true);
    setError(null);
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

  useEffect(() => {
    if (!t2iTaskId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runway/tasks/${encodeURIComponent(t2iTaskId)}`);
        const json = await parseApiJson<RunwayTaskJson>(res);
        if (cancelled) return;
        setT2iTaskJson(json);
      } catch {
        if (!cancelled) setT2iTaskJson((prev) => prev);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [t2iTaskId]);

  useEffect(() => {
    const key = `${format}:${contentId}`;
    if (t2iSeededKeyRef.current === key) return;
    t2iSeededKeyRef.current = key;
    setT2iPromptSavedMsg(null);
    if (!content || !isHorseRacingFormat(format)) return;
    try {
      const saved = localStorage.getItem(`r365-t2i-horse-prompt-${contentId}`);
      if (saved && saved.trim()) {
        setT2iPromptText(saved);
        return;
      }
    } catch {
      /* ignore storage errors */
    }
    setT2iPromptText(buildHorseRacingT2iPrompt(content));
  }, [content, contentId, format]);

  const fillT2iPromptFromTemplate = useCallback(() => {
    if (!content) return;
    if (isHorseRacingFormat(content.format)) {
      setT2iPromptText(buildHorseRacingT2iPrompt(content));
      return;
    }
    const headline = content.scenes.find((s) => s.id === "intro")?.captionLine?.trim() ?? "";
    const detail =
      content.scenes.find((s) => s.id === "tip-1" || s.id === "winner" || s.id === "placings")?.captionLine?.trim() ??
      "";
    const prompt = [
      `${templateDataTabLabel(content.format).replace("Template data — ", "")} social backdrop, dramatic editorial sports style, high contrast lighting, clean composition, no text overlays, no logos.`,
      headline ? `Headline focus: ${headline}.` : "",
      detail ? `Secondary context: ${detail}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    setT2iPromptText(prompt);
  }, [content]);

  const saveHorseT2iPrompt = useCallback(() => {
    if (!isHorseRacingFormat(format)) return;
    const prompt = clampT2iPrompt(t2iPromptText);
    if (!prompt) {
      setT2iPromptSavedMsg("Prompt is empty.");
      return;
    }
    try {
      setT2iPromptText(prompt);
      localStorage.setItem(`r365-t2i-horse-prompt-${contentId}`, prompt);
      setT2iPromptSavedMsg("Prompt saved.");
    } catch {
      setT2iPromptSavedMsg("Could not save prompt in this browser.");
    }
  }, [contentId, format, t2iPromptText]);

  const startTextToImage = useCallback(async () => {
    const promptText = clampT2iPrompt(t2iPromptText);
    if (!promptText) return;
    if (promptText !== t2iPromptText) setT2iPromptText(promptText);
    setT2iBusy(true);
    setT2iError(null);
    try {
      const res = await fetch(studioApiPath("/api/runway/text-to-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText,
          model: t2iModel,
          ratio: t2iRatio,
        }),
      });
      const json = await parseApiJson<{ taskId: string }>(res);
      setT2iTaskId(json.taskId);
      setT2iTaskJson(null);
    } catch (e) {
      setT2iError(e instanceof Error ? e.message : "Could not start text-to-image.");
    } finally {
      setT2iBusy(false);
    }
  }, [t2iModel, t2iPromptText, t2iRatio]);

  const importTextToImageBackdrop = useCallback(async () => {
    if (!t2iTaskId || t2iTaskJson?.status !== "SUCCEEDED") return;
    setT2iImportBusy(true);
    setT2iError(null);
    try {
      const res = await fetch(studioApiPath("/api/runway/import-task"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, taskId: t2iTaskId, assetKind: "image" }),
      });
      const json = await parseApiJson<{ backgroundImageRel?: string }>(res);
      const rel = typeof json.backgroundImageRel === "string" ? json.backgroundImageRel.trim() : "";
      if (!rel) throw new Error("Runway import did not return a background image path.");
      setBackgroundImageRel(rel);
      setBackgroundVideoRel(null);
      setBackgroundVideoFrameRel(null);
      setContent((c) =>
        c
          ? mergeBackdropIntoContent(c, {
              backgroundImageRel: rel,
              backgroundVideoRel: null,
            })
          : c,
      );
      setUploadMsg("Runway still imported and applied as your backdrop image.");
      setPreviewNonce((n) => n + 1);
    } catch (e) {
      setT2iError(e instanceof Error ? e.message : "Could not import generated image.");
    } finally {
      setT2iImportBusy(false);
    }
  }, [contentId, t2iTaskId, t2iTaskJson?.status]);

  const pickBackdropLibraryImage = (rel: string) => {
    setBackgroundImageRel(rel);
    setBackgroundVideoRel(null);
    setBackgroundVideoFrameRel(null);
    setContent((c) =>
      c && c.templateSource && c.templateSource.format !== "football-lineups"
        ? mergeBackdropIntoContent(c, {
            backgroundImageRel: rel,
            backgroundVideoRel: null,
          })
        : c,
    );
    closeBackdropLibraryPicker();
  };

  const pickBackdropLibraryVideo = (rel: string) => {
    setBackgroundVideoRel(rel);
    setBackgroundVideoFrameRel(inferredBackdropPosterRelFromVideo(rel));
    setBackgroundImageRel(null);
    setContent((c) =>
      c && c.templateSource && c.templateSource.format !== "football-lineups"
        ? mergeBackdropIntoContent(c, {
            backgroundVideoRel: rel,
            backgroundImageRel: null,
          })
        : c,
    );
    closeBackdropLibraryPicker();
  };

  const loadContent = useCallback(async (signal?: AbortSignal) => {
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(studioApiPath("/api/generate-content"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, id }),
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      const data = await parseApiJson<{ error?: string; content?: GeneratedContent }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      if (!data.content) throw new Error("Invalid response: missing content");
      if (signal?.aborted) return;
      let next = data.content;
      let feedFromNewTemplate = false;
      let feedWarnings: string[] = [];
      if (id.startsWith("tpl-")) {
        const raw = sessionStorage.getItem(PENDING_TEMPLATE_FEED_STORAGE_KEY);
        if (raw) {
          try {
            const pending = JSON.parse(raw) as {
              templateId: string;
              rows: Record<string, string>;
              jsonRoot?: Record<string, unknown> | null;
            };
            if (pending.templateId === id) {
              sessionStorage.removeItem(PENDING_TEMPLATE_FEED_STORAGE_KEY);
              const { content: merged, versions, warnings } = applyDataFeedImport(
                next,
                pending.rows,
                id,
                { a: "", b: "", c: "" },
                pending.jsonRoot ?? null,
              );
              next = merged;
              setVersionA(versions.a);
              setVersionB(versions.b);
              setVersionC(versions.c);
              feedFromNewTemplate = true;
              feedWarnings = warnings;
            }
          } catch {
            sessionStorage.removeItem(PENDING_TEMPLATE_FEED_STORAGE_KEY);
          }
        }
      }
      suppressTemplateDraftPersist.current = true;
      setContent(next);
      const profile = aiProfileFromTemplate(next.templateSource);
      if (profile.prompt?.trim()) setAiPrompt(profile.prompt);
      else setAiPrompt(aiDefaultPromptForFormat(next.format));
      if (next.format === "teamtalk-news" && next.templateSource?.format === "teamtalk-news") {
        const ai = teamtalkNewsAiStyleFromBundle(next.templateSource.bundle);
        setVoiceStyle(ai.voiceStyle);
        setDeliveryStyle(ai.deliveryStyle);
        setTone(ai.tone);
      } else {
        if (profile.voiceStyle) setVoiceStyle(profile.voiceStyle);
        if (profile.deliveryStyle) setDeliveryStyle(profile.deliveryStyle);
        if (profile.tone) setTone(profile.tone);
      }
      setFeedLine(
        feedFromNewTemplate
          ? feedWarnings.filter(Boolean).length
            ? `${feedWarnings.filter(Boolean).join(" ")} Imported feed from new template — use Save template to persist.`
            : "Imported feed from new template — use Save template to persist."
          : `${format} · ${id}`,
      );
      setImages([]);
      setVideoRel(null);
      setPreviewSceneId(null);
      const ts = next.templateSource;
      if (
        ts?.format === "teamtalk-news" ||
        ts?.format === "f1-grid" ||
        ts?.format === "f1-results"
      ) {
        const b = ts.bundle;
        const byScene = { ...(b.backgroundImageRelBySceneId ?? {}) };
        setBackgroundImageRel(coalesceGlobalBackgroundImageRel(b.backgroundImageRel, byScene));
        setBackgroundImageRelBySceneId(byScene);
        setBackgroundVideoRel(b.backgroundVideoRel?.trim() ? b.backgroundVideoRel : null);
        setBurnSubtitles(Boolean(b.burnSubtitles));
        setBackgroundVideoFrameRel(null);
      } else if (ts?.format === "next-off" || ts?.format === "fast-results") {
        const b = ts.bundle;
        const byScene = { ...(b.backgroundImageRelBySceneId ?? {}) };
        setBackgroundImageRel(coalesceGlobalBackgroundImageRel(b.backgroundImageRel, byScene));
        setBackgroundImageRelBySceneId(byScene);
        setBackgroundVideoRel(b.backgroundVideoRel?.trim() ? b.backgroundVideoRel : null);
        setBackgroundVideoFrameRel(null);
        setBurnSubtitles(false);
      } else if (ts?.format === "racecard") {
        const b = ts.snapshot;
        const byScene = { ...(b.backgroundImageRelBySceneId ?? {}) };
        setBackgroundImageRel(coalesceGlobalBackgroundImageRel(b.backgroundImageRel, byScene));
        setBackgroundImageRelBySceneId(byScene);
        setBackgroundVideoRel(b.backgroundVideoRel?.trim() ? b.backgroundVideoRel : null);
        setBackgroundVideoFrameRel(null);
        setBurnSubtitles(false);
      } else if (ts?.format === "planet-football-table") {
        setBackgroundImageRel(null);
        setBackgroundImageRelBySceneId({});
        setBackgroundVideoRel(null);
        setBackgroundVideoFrameRel(null);
        setBurnSubtitles(ts.bundle.burnSubtitles !== false);
      } else {
        setBackgroundImageRel(null);
        setBackgroundImageRelBySceneId({});
        setBackgroundVideoRel(null);
        setBackgroundVideoFrameRel(null);
        setBurnSubtitles(false);
      }
      setPngsStale(feedFromNewTemplate);
      setPreviewNonce((n) => n + 1);
      setEditVideoMsg(null);
      setTrimStartInput("0");
      setTrimEndInput("0");
      const existingVideo = await probeExistingBuiltVideo(id);
      if (existingVideo && !signal?.aborted) {
        setVideoRel(existingVideo);
        setVideoPreviewNonce((n) => n + 1);
      }
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      const net =
        e instanceof TypeError &&
        /failed to fetch|networkerror|load failed|fetch/i.test(String(e.message));
      setError(
        net
          ? "Could not reach the app server. Keep this tab on the same URL as the dev server (e.g. http://127.0.0.1:8081) and ensure `npm run dev` is running."
          : e instanceof Error
            ? e.message
            : "Error",
      );
    } finally {
      setBusy(null);
    }
  }, [format, id]);

  useEffect(() => {
    const ac = new AbortController();
    void loadContent(ac.signal);
    return () => ac.abort();
  }, [loadContent]);

  useLayoutEffect(() => {
    if (!content?.scenes?.length) return;
    const ids = content.scenes.map((s) => s.id);
    const sceneKey = ids.join(",");
    const hydrateKey = `${contentId}|${sceneKey}`;
    if (compositorHydrateKeyRef.current === hydrateKey) return;
    compositorHydrateKeyRef.current = hydrateKey;
    let next: CompositorSceneState = {};
    try {
      const raw = sessionStorage.getItem(`r365-compositor-${contentId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          /* Legacy: one stack for all scenes — give each scene its own copy so they don’t share one array. */
          for (const id of ids) {
            next[id] = JSON.parse(JSON.stringify(parsed)) as CompositorLayer[];
          }
        } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const o = parsed as CompositorSceneState;
          for (const id of ids) {
            const row = o[id];
            next[id] = Array.isArray(row) ? (JSON.parse(JSON.stringify(row)) as CompositorLayer[]) : [];
          }
        }
      }
    } catch {
      next = {};
    }
    const fastResults = content?.templateSource?.format === "fast-results";
    for (const id of ids) {
      if (!next[id]) next[id] = [];
      else if (fastResults) next[id] = stripLegacyFastResultsBoardOverlayLayers(next[id]!);
    }
    setCompositorByScene(next);
    setCompositorSceneId((prev) => (prev && ids.includes(prev) ? prev : ids[0]!));
  }, [contentId, content?.scenes, content?.templateSource?.format]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`r365-compositor-${contentId}`, JSON.stringify(compositorByScene));
    } catch {
      /* quota */
    }
  }, [contentId, compositorByScene]);

  useEffect(() => {
    compositorSceneIdRef.current = compositorSceneId;
  }, [compositorSceneId]);

  useEffect(() => {
    if (previewSceneId && content?.scenes.some((s) => s.id === previewSceneId)) {
      setCompositorSceneId(previewSceneId);
    }
  }, [previewSceneId, content?.scenes]);

  const compositorLayers = useMemo(() => {
    const sid = compositorSceneId ?? content?.scenes[0]?.id;
    if (!sid) return [];
    return compositorByScene[sid] ?? [];
  }, [compositorSceneId, content?.scenes, compositorByScene]);

  const patchCompositorLayers = useCallback(
    (next: CompositorLayer[] | ((prev: CompositorLayer[]) => CompositorLayer[])) => {
      const sid = compositorSceneId ?? content?.scenes[0]?.id;
      if (!sid) return;
      setCompositorByScene((prev) => {
        const cur = prev[sid] ?? [];
        const resolved =
          typeof next === "function" ? (next as (p: CompositorLayer[]) => CompositorLayer[])(cur) : next;
        return { ...prev, [sid]: resolved };
      });
    },
    [compositorSceneId, content?.scenes],
  );

  const selectCompositorScene = useCallback((id: string) => {
    setCompositorSceneId(id);
    setPreviewSceneId(id);
  }, []);

  const saveCompositorLayers = useCallback(() => {
    try {
      sessionStorage.setItem(`r365-compositor-${contentId}`, JSON.stringify(compositorByScene));
      setCompositorMsg("Layers saved in this browser.");
      setTimeout(() => setCompositorMsg(null), 3500);
    } catch {
      setCompositorMsg("Could not save layers.");
    }
  }, [contentId, compositorByScene]);

  const compositorExportLen = useMemo(() => {
    const sid = compositorSceneId ?? content?.scenes[0]?.id;
    if (!sid || !compositorByScene[sid]?.length) return 0;
    try {
      const url = compositorLayersToDataUrl(compositorByScene[sid]!, 0);
      return url?.length ?? 0;
    } catch {
      return 0;
    }
  }, [compositorSceneId, content?.scenes, compositorByScene]);

  useEffect(() => {
    if (!videoRel) {
      setVideoDurationSec(null);
      return;
    }
    let cancelled = false;
    void fetch(studioApiPath(`/api/video-meta?rel=${encodeURIComponent(videoRel)}`))
      .then(async (r) => {
        const t = await r.text();
        try {
          return t.trim() ? (JSON.parse(t) as { durationSec?: number }) : {};
        } catch {
          return {};
        }
      })
      .then((d: { durationSec?: number }) => {
        if (cancelled) return;
        setVideoDurationSec(typeof d.durationSec === "number" ? d.durationSec : null);
      })
      .catch(() => {
        if (!cancelled) setVideoDurationSec(null);
      });
    return () => {
      cancelled = true;
    };
  }, [videoRel]);

  useEffect(() => {
    const editedRel = `video/${contentId}-short-edited.mp4`;
    let cancelled = false;
    void fetch(studioApiPath(`/api/video-meta?rel=${encodeURIComponent(editedRel)}`))
      .then((r) => {
        if (!cancelled) setEditedCutOnDisk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setEditedCutOnDisk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId, videoRel]);

  useEffect(() => {
    return () => {
      voicePreviewAudioRef.current?.pause();
      voicePreviewAudioRef.current = null;
      if (voicePreviewUrlRef.current) {
        URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      }
    };
  }, []);

  const updateScene = (index: number, patch: Partial<SceneSpec>) => {
    setContent((c) => {
      if (!c) return c;
      const scenes = c.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...c, scenes };
    });
  };

  const syncSceneSubtitlesFromScript = useCallback(() => {
    if (!content?.scenes.length) return;
    const script = content.script?.trim() ?? "";
    if (!script) {
      setError("Add a voiceover script first, then sync.");
      return;
    }
    setError(null);
    const voiceSpeed = content.voiceSpeed ?? 1;
    const { captions, durationSec, estimatedScriptSec } = computeSyncFromScript(
      script,
      content.scenes.length,
      voiceSpeed,
    );
    setContent((c) => {
      if (!c) return c;
      return {
        ...c,
        scenes: c.scenes.map((s, i) => ({
          ...s,
          captionLine: captions[i] ?? "",
          durationSec: durationSec[i] ?? 0.2,
        })),
      };
    });
    const picSum = durationSec.reduce((a, d) => a + d, 0);
    setSubtitlesSyncMsg(
      `Synced ${content.scenes.length} frame${content.scenes.length === 1 ? "" : "s"} (${content.scenes.map((s) => s.id).join(", ")}). Captions + durations from script (~${estimatedScriptSec.toFixed(1)}s voice est., picture sum ${picSum.toFixed(1)}s).`,
    );
    setTimeout(() => setSubtitlesSyncMsg(null), 6000);
  }, [content]);

  const adjustTimingsFromCaptionLines = useCallback(() => {
    if (!content?.scenes.length) return;
    const script = content.script?.trim() ?? "";
    const lines = content.scenes.map((s) => s.captionLine);
    if (!script && !lines.some((l) => l.trim())) {
      setError("Add caption text or a voiceover script, then adjust timings.");
      return;
    }
    setError(null);
    const voiceSpeed = content.voiceSpeed ?? 1;
    const { durationSec, targetTotalSec } = recalculateDurationsFromCaptionLines(lines, script, voiceSpeed);
    const picSum = durationSec.reduce((a, d) => a + d, 0);
    setContent((c) => {
      if (!c) return c;
      return {
        ...c,
        scenes: c.scenes.map((s, i) => ({
          ...s,
          durationSec: durationSec[i] ?? 0.2,
        })),
      };
    });
    setSubtitlesSyncMsg(
      `Adjusted all frame timings from current lines (~${targetTotalSec.toFixed(1)}s voice target, picture sum ${picSum.toFixed(1)}s).`,
    );
    setTimeout(() => setSubtitlesSyncMsg(null), 6000);
  }, [content]);

  const applyScriptWithAutoSync = useCallback((script: string) => {
    setContent((c) => {
      if (!c) return c;
      const voiceSpeed = c.voiceSpeed ?? 1;
      const { captions, durationSec } = computeSyncFromScript(script, c.scenes.length, voiceSpeed);
      return {
        ...c,
        script,
        scenes: c.scenes.map((s, i) => ({
          ...s,
          captionLine: captions[i] ?? "",
          durationSec: durationSec[i] ?? 0.2,
        })),
      };
    });
  }, []);

  const subtitleTimingTotals = useMemo(() => {
    if (!content?.scenes?.length) {
      return { pictureTotalSec: 0, scriptEstimateSec: 0 };
    }
    const pictureTotalSec = content.scenes.reduce(
      (a, s) => a + (Number.isFinite(s.durationSec) ? s.durationSec : 0),
      0,
    );
    const scriptEstimateSec = estimateVoiceoverDurationSec(content.script ?? "", {
      voiceSpeed: content.voiceSpeed ?? 1,
    });
    return { pictureTotalSec, scriptEstimateSec };
  }, [content?.scenes, content?.script, content?.voiceSpeed]);

  const runAiScriptImprove = useCallback(
    async (mode: "improve" | "regenerate" | "versions") => {
      if (!content) return;
      setAiBusy(true);
      setAiError(null);
      setAiSuccess(null);
      try {
        let sourceContent = content;
        if (
          content.templateSource?.format === "planet-football-table" ||
          content.templateSource?.format === "planet-rugby-table"
        ) {
          const rematerialized = materializeFromTemplate(content.templateSource);
          sourceContent = {
            ...rematerialized,
            script: content.script,
            caption: content.caption,
            templateSource: content.templateSource,
            voiceGender: content.voiceGender,
            voiceSpeed: content.voiceSpeed,
          };
        }
        const fields = aiFieldFromScenes(sourceContent);
        const res = await fetch(studioApiPath("/api/ai/improve-racing-voiceover"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format: content.format,
            customPrompt: aiPrompt.trim(),
            voiceStyle,
            deliveryStyle,
            tone,
            optimiseForVoiceover: aiOptimiseRhythm,
            addEmphasis: aiAddEmphasis,
            generateThreeVersions: mode === "versions",
            mode,
            journalistProfile: selectedCreatorProfile
              ? {
                  id: selectedCreatorProfile.id,
                  name: selectedCreatorProfile.name,
                  brand: selectedCreatorProfile.brand,
                  sports: selectedCreatorProfile.sports,
                  styleNotes: selectedCreatorProfile.styleNotes,
                  articleGuidelines: selectedCreatorProfile.articleGuidelines,
                  exampleTitles: selectedCreatorProfile.exampleTitles,
                }
              : undefined,
            fields,
          }),
        });
        const data = await parseApiJson<AiImproveResponse & { error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Could not improve script right now.");
        if (!data.voiceover_script || !data.short_caption) {
          throw new Error("AI returned incomplete JSON.");
        }
        setAiPreviousDraft({
          script: content.script ?? "",
          caption: content.caption ?? "",
        });
        setContent((c) =>
          c
            ? {
                ...c,
                script: data.voiceover_script,
                caption: data.short_caption,
                scenes: (() => {
                  const voiceSpeed = c.voiceSpeed ?? 1;
                  const { captions, durationSec } = computeSyncFromScript(
                    data.voiceover_script,
                    c.scenes.length,
                    voiceSpeed,
                  );
                  return c.scenes.map((s, i) => ({
                    ...s,
                    captionLine: captions[i] ?? "",
                    durationSec: durationSec[i] ?? 0.2,
                  }));
                })(),
              }
            : c,
        );
        setVersionA(data.version_a ?? "");
        setVersionB(data.version_b ?? "");
        setVersionC(data.version_c ?? "");
        setAiSuccess(
          mode === "versions"
            ? "Three versions generated. Scene subtitles and timings synced."
            : mode === "regenerate"
              ? "AI script regenerated. Scene subtitles and timings synced."
              : "AI script improved. Scene subtitles and timings synced.",
        );
      } catch (e) {
        setAiError(
          e instanceof Error
            ? e.message
            : "Could not write script at the moment. Please try again.",
        );
      } finally {
        setAiBusy(false);
      }
    },
    [content, aiPrompt, voiceStyle, deliveryStyle, tone, aiOptimiseRhythm, aiAddEmphasis, selectedCreatorProfile],
  );

  const restorePreviousAiDraft = useCallback(() => {
    if (!aiPreviousDraft) return;
    setContent((c) =>
      c
        ? {
            ...c,
            script: aiPreviousDraft.script,
            caption: aiPreviousDraft.caption,
          }
        : c,
    );
    setAiSuccess("Restored previous script and caption.");
  }, [aiPreviousDraft]);

  const saveAiPrompt = useCallback(() => {
    try {
      const next = {
        prompt: aiPrompt,
        voiceStyle,
        deliveryStyle,
        tone,
        optimiseRhythm: aiOptimiseRhythm,
        addEmphasis: aiAddEmphasis,
      };
      localStorage.setItem(aiSettingsKey, JSON.stringify(next));
      const verifyRaw = localStorage.getItem(aiSettingsKey);
      const verify = verifyRaw && verifyRaw.trim() ? (JSON.parse(verifyRaw) as { prompt?: unknown }) : {};
      if (typeof verify.prompt !== "string" || verify.prompt !== aiPrompt) {
        throw new Error("Prompt verification failed");
      }
      setAiSettingsMsg("Prompt saved for this template.");
      setTimeout(() => setAiSettingsMsg(null), 2500);
    } catch {
      setAiError("Could not save prompt in this browser.");
    }
  }, [aiSettingsKey, aiPrompt, voiceStyle, deliveryStyle, tone, aiOptimiseRhythm, aiAddEmphasis]);

  const resetAiSettings = useCallback(async () => {
    setAiPrompt(AI_DEFAULT_PROMPT);
    setVoiceStyle("Journalist");
    setDeliveryStyle("Balanced");
    setTone("Neutral");
    setAiOptimiseRhythm(true);
    setAiAddEmphasis(true);
    try {
      localStorage.removeItem(aiSettingsKey);
      try {
        const res = await fetch(studioApiPath("/api/prompts"));
        const data = await res.json();
        if (res.ok) {
          const row = (data.builtin ?? []).find((b: { id: string }) => b.id === "builtin-editor-voiceover");
          if (row && typeof row.body === "string") setAiPrompt(row.body);
        }
      } catch {
        /* keep AI_DEFAULT_PROMPT */
      }
      setAiSettingsMsg("AI settings reset to default.");
      setTimeout(() => setAiSettingsMsg(null), 2500);
    } catch {
      setAiError("Could not reset AI settings in this browser.");
    }
  }, [aiSettingsKey]);

  const saveVoiceSettings = useCallback(() => {
    if (!content) return;
    try {
      sessionStorage.setItem(
        voiceSettingsKey,
        JSON.stringify({
          voiceGender: content.voiceGender ?? "female",
          voiceSpeed: content.voiceSpeed ?? 1,
          voicePreset,
          voiceProviderPreference,
          elevenlabsVoiceId,
        }),
      );
      setVoiceSettingsMsg("Voice settings saved for this template.");
      setTimeout(() => setVoiceSettingsMsg(null), 2500);
    } catch {
      setError("Could not save voice settings in this browser.");
    }
  }, [content, voiceSettingsKey, voicePreset, voiceProviderPreference, elevenlabsVoiceId]);

  const applyVoicePreset = useCallback((preset: VoicePreset) => {
    setVoicePreset(preset);
    setContent((c) => {
      if (!c) return c;
      if (preset === "Racing365 - British - Commentator") {
        return { ...c, voiceGender: "male", voiceSpeed: 1.2 };
      }
      if (preset === "Female - Energetic") return { ...c, voiceGender: "female", voiceSpeed: 1.15 };
      if (preset === "Male - Broadcast") return { ...c, voiceGender: "male", voiceSpeed: 1 };
      if (preset === "Male - Deep") return { ...c, voiceGender: "male", voiceSpeed: 0.9 };
      return { ...c, voiceGender: "female", voiceSpeed: 1 };
    });
  }, []);

  const selectElevenlabsVoice = useCallback((voiceId: string) => {
    setElevenlabsVoiceId(voiceId);
    const selected = elevenlabsVoices.find((v) => v.voiceId === voiceId);
    const labelledGender = selected?.labels?.gender?.toLowerCase().trim();
    if (labelledGender === "male" || labelledGender === "female") {
      setContent((c) => (c ? { ...c, voiceGender: labelledGender } : c));
    }
  }, [elevenlabsVoices]);

  useEffect(() => {
    if (!elevenlabsVoiceId) return;
    const selected = elevenlabsVoices.find((v) => v.voiceId === elevenlabsVoiceId);
    const labelledGender = selected?.labels?.gender?.toLowerCase().trim();
    if (labelledGender !== "male" && labelledGender !== "female") return;
    setContent((c) => {
      if (!c) return c;
      if (c.voiceGender === labelledGender) return c;
      return { ...c, voiceGender: labelledGender };
    });
  }, [elevenlabsVoiceId, elevenlabsVoices]);

  useEffect(() => {
    let active = true;
    const loadVoices = async () => {
      setVoicesLoading(true);
      try {
        const res = await fetch(studioApiPath("/api/voice-options/elevenlabs"), { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          voices?: Array<{
            voice_id?: string;
            name?: string;
            description?: string;
            category?: string;
            groupLabel?: string;
            labels?: Record<string, string>;
          }>;
          diagnostics?: {
            totalDefaults?: number;
            labelledDefaults?: number;
            unlabelledDefaults?: number;
            unlabelledVoiceNames?: string[];
            myVoicesCount?: number;
          };
          status?: string;
        };
        if (!active) return;
        const next = Array.isArray(data.voices)
          ? data.voices
              .map((v) => ({
                voiceId: String(v.voice_id ?? "").trim(),
                name: String(v.name ?? "").trim(),
                description: typeof v.description === "string" ? v.description : undefined,
                category: typeof v.category === "string" ? v.category : undefined,
                groupLabel: typeof v.groupLabel === "string" ? v.groupLabel : undefined,
                labels: v.labels && typeof v.labels === "object" ? v.labels : undefined,
              }))
              .filter((v) => v.voiceId && v.name)
          : [];
        setElevenlabsVoices(next);
        setVoiceDiagnostics({
          totalDefaults: Number(data.diagnostics?.totalDefaults ?? next.length),
          labelledDefaults: Number(data.diagnostics?.labelledDefaults ?? 0),
          unlabelledDefaults: Number(data.diagnostics?.unlabelledDefaults ?? 0),
          unlabelledVoiceNames: Array.isArray(data.diagnostics?.unlabelledVoiceNames)
            ? data.diagnostics!.unlabelledVoiceNames!.filter((x) => typeof x === "string")
            : [],
          myVoicesCount:
            typeof data.diagnostics?.myVoicesCount === "number" ? data.diagnostics.myVoicesCount : undefined,
        });
        setVoiceProviderStatus(typeof data.status === "string" ? data.status : null);
        if (next.length > 0) {
          const racing =
            format === "next-off" || format === "fast-results" || format === "racecard";
          setElevenlabsVoiceId((cur) => {
            if (cur?.trim()) return cur;
            if (racing) {
              const pref = pickRacingCommentatorVoiceId(next);
              if (pref) return pref;
            }
            return next[0]!.voiceId;
          });
        }
      } catch {
        if (!active) return;
        setElevenlabsVoices([]);
        setVoiceDiagnostics(null);
        setVoiceProviderStatus("network_error");
      } finally {
        if (active) setVoicesLoading(false);
      }
    };
    void loadVoices();
    return () => {
      active = false;
    };
  }, [format]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(voiceSettingsKey);
      if (!raw) return;
      const p = JSON.parse(raw) as {
        voiceGender?: VoiceGender;
        voiceSpeed?: number;
        voicePreset?: VoicePreset;
        voiceProviderPreference?: VoiceProviderPreference;
        elevenlabsVoiceId?: string;
      };
      setContent((c) =>
        c
          ? {
              ...c,
              voiceGender:
                p.voiceGender === "male" || p.voiceGender === "female"
                  ? p.voiceGender
                  : (c.voiceGender ?? "female"),
              voiceSpeed:
                typeof p.voiceSpeed === "number" && Number.isFinite(p.voiceSpeed)
                  ? Math.min(2, Math.max(0.5, p.voiceSpeed))
                  : (c.voiceSpeed ?? 1),
            }
          : c,
      );
      if (p.voicePreset && VOICE_PRESET_OPTIONS.includes(p.voicePreset as VoicePreset)) {
        setVoicePreset(p.voicePreset as VoicePreset);
      }
      if (
        p.voiceProviderPreference === "auto" ||
        p.voiceProviderPreference === "elevenlabs" ||
        p.voiceProviderPreference === "openai"
      ) {
        setVoiceProviderPreference(p.voiceProviderPreference);
      }
      if (typeof p.elevenlabsVoiceId === "string" && p.elevenlabsVoiceId.trim()) {
        setElevenlabsVoiceId(p.elevenlabsVoiceId.trim());
      }
    } catch {
      /* ignore invalid persisted voice settings */
    }
  }, [voiceSettingsKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(aiSettingsKey);
      if (!raw) return;
      const p = JSON.parse(raw) as {
        prompt?: string;
        voiceStyle?: VoiceStyle;
        deliveryStyle?: DeliveryStyle;
        tone?: ToneStyle;
        optimiseRhythm?: boolean;
        addEmphasis?: boolean;
      };
      if (typeof p.prompt === "string" && p.prompt.trim()) setAiPrompt(p.prompt);
      /* TEAMtalk: Voice / delivery / tone come from the loaded bundle (defaults to Journalist), not localStorage */
      if (format !== "teamtalk-news") {
        if (p.voiceStyle && ["Journalist", "Punchy Tips", "Calm / Studio", "Fast Picks"].includes(p.voiceStyle)) {
          setVoiceStyle(p.voiceStyle);
        }
        if (p.deliveryStyle && ["Smooth", "Balanced", "Fast"].includes(p.deliveryStyle)) {
          setDeliveryStyle(p.deliveryStyle);
        }
        if (p.tone && ["Neutral", "Confident", "Urgent"].includes(p.tone)) setTone(p.tone);
      }
      if (typeof p.optimiseRhythm === "boolean") setAiOptimiseRhythm(p.optimiseRhythm);
      if (typeof p.addEmphasis === "boolean") setAiAddEmphasis(p.addEmphasis);
    } catch {
      /* ignore bad payload */
    }
  }, [aiSettingsKey, format]);

  /** Apply global built-in override from /prompts when this template has no saved AI prompt in localStorage. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(aiSettingsKey);
        if (raw) {
          try {
            const p = JSON.parse(raw) as { prompt?: string };
            if (typeof p.prompt === "string" && p.prompt.trim()) return;
          } catch {
            /* ignore */
          }
        }
        const res = await fetch(studioApiPath("/api/prompts"));
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const row = (data.builtin ?? []).find((b: { id: string }) => b.id === "builtin-editor-voiceover");
        if (row && typeof row.body === "string") setAiPrompt(row.body);
      } catch {
        /* keep bundled default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiSettingsKey]);

  const invalidateRasterPreviews = useCallback(() => {
    setImages([]);
    setPreviewSceneId(null);
    setPngsStale(true);
  }, []);

  const racecardI2vHeroUrl = useMemo(() => {
    if (format !== "racecard" || !content?.templateSource || content.templateSource.format !== "racecard") {
      return null;
    }
    const u = content.templateSource.snapshot.race.courseImageUrl?.trim();
    return u && /^https:\/\//i.test(u) ? u : null;
  }, [format, content?.templateSource]);

  const downloadDataFeedCsv = useCallback(() => {
    if (!content) return;
    const csv = exportDataFeedKeyValueCsv({
      content,
      contentId,
      versionA,
      versionB,
      versionC,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-feed-${contentId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, contentId, versionA, versionB, versionC]);

  const onDataFeedCsvSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !content) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const rows = parseDataFeedKeyValueCsv(text);
          const { content: next, versions, warnings } = applyDataFeedImport(
            content,
            rows,
            contentId,
            { a: versionA, b: versionB, c: versionC },
          );
          setContent(next);
          setVersionA(versions.a);
          setVersionB(versions.b);
          setVersionC(versions.c);
          invalidateRasterPreviews();
          const w = warnings.filter(Boolean).join(" ");
          setFeedLine(w ? `${w} Imported — fields updated.` : "Imported CSV — fields updated.");
        } catch (err) {
          setFeedLine(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    },
    [content, contentId, versionA, versionB, versionC, invalidateRasterPreviews],
  );

  const downloadDataFeedJson = useCallback(() => {
    if (!content) return;
    const json = exportDataFeedApiJsonV1String({
      content,
      contentId,
      versionA,
      versionB,
      versionC,
    });
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-feed-${contentId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, contentId, versionA, versionB, versionC]);

  const onDataFeedJsonSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !content) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const { rows, root } = parseDataFeedJsonDocument(text);
          const { content: next, versions, warnings } = applyDataFeedImport(
            content,
            rows,
            contentId,
            { a: versionA, b: versionB, c: versionC },
            root,
          );
          setContent(next);
          setVersionA(versions.a);
          setVersionB(versions.b);
          setVersionC(versions.c);
          invalidateRasterPreviews();
          const w = warnings.filter(Boolean).join(" ");
          setFeedLine(w ? `${w} Imported JSON — fields updated.` : "Imported JSON — fields updated.");
        } catch (err) {
          setFeedLine(`JSON import failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    },
    [content, contentId, versionA, versionB, versionC, invalidateRasterPreviews],
  );

  const browserTemplateKey = `r365-editor-template-${contentId}`;

  useEffect(() => {
    if (!content?.templateSource || content.templateSource.format === "football-lineups") return;
    if (suppressTemplateDraftPersist.current) {
      suppressTemplateDraftPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(browserTemplateKey, JSON.stringify(content.templateSource));
    } catch {
      /* quota or private mode */
    }
  }, [content?.templateSource, browserTemplateKey]);

  const saveTemplateToBrowser = useCallback(() => {
    if (!content?.templateSource || content.templateSource.format === "football-lineups") return;
    try {
      sessionStorage.setItem(browserTemplateKey, JSON.stringify(content.templateSource));
      setBrowserTemplateMsg("Saved template draft in this browser.");
      setTimeout(() => setBrowserTemplateMsg(null), 4000);
    } catch {
      setBrowserTemplateMsg("Could not save (storage full or blocked).");
    }
  }, [browserTemplateKey, content?.templateSource]);

  const restoreTemplateFromBrowser = useCallback(() => {
    const raw = sessionStorage.getItem(browserTemplateKey);
    if (!raw) {
      setBrowserTemplateMsg("No saved draft for this id.");
      setTimeout(() => setBrowserTemplateMsg(null), 3000);
      return;
    }
    try {
      const source = JSON.parse(raw) as TemplateSource;
      setContent((c) => (c ? applyTemplateWithPreferences(c, source) : c));
      if (source.format === "teamtalk-news") {
        const ai = teamtalkNewsAiStyleFromBundle(source.bundle);
        setVoiceStyle(ai.voiceStyle);
        setDeliveryStyle(ai.deliveryStyle);
        setTone(ai.tone);
      }
      invalidateRasterPreviews();
      setBrowserTemplateMsg("Restored saved draft.");
      setTimeout(() => setBrowserTemplateMsg(null), 4000);
    } catch {
      setBrowserTemplateMsg("Saved draft is invalid JSON.");
    }
  }, [browserTemplateKey, invalidateRasterPreviews]);

  const renderScenes = async () => {
    if (!content) return;
    setBusy("render");
    setError(null);
    try {
      let scenesForRender = content.scenes;
      if (content.templateSource?.format === "planet-rugby-table" || content.templateSource?.format === "planet-football-table" || content.templateSource?.format === "team-line-up" || content.templateSource?.format === "team-sheet" || content.templateSource?.format === "score-line") {
        const rematerialized = materializeFromTemplate(content.templateSource);
        const currentById = new Map(content.scenes.map((s) => [s.id, s]));
        scenesForRender = rematerialized.scenes.map((s) => {
          const cur = currentById.get(s.id);
          if (!cur) return s;
          return {
            ...s,
            captionLine: cur.captionLine,
            durationSec: cur.durationSec,
          };
        });
      }
      const editorCompositorBySceneId: Record<string, string> = {};
      const fastResults = content.templateSource?.format === "fast-results";
      for (const s of scenesForRender) {
        const ly = compositorByScene[s.id];
        if (ly?.length) {
          const toRaster = fastResults ? stripLegacyFastResultsBoardOverlayLayers(ly) : ly;
          const dataUrl = compositorLayersToDataUrl(toRaster, 0);
          if (dataUrl) editorCompositorBySceneId[s.id] = dataUrl;
        }
      }
      const basePayload: Record<string, unknown> = {
        contentId,
        width: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].width,
        height: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].height,
        backgroundImageRel,
        backgroundVideoFrameRel,
        backgroundVideoRel,
        ...(backgroundVideoRel
          ? {
              motionBackdropOpaqueOpacity,
              motionBackdropDimStrength,
            }
          : {}),
      };
      const renderedImages: { sceneId: string; path: string; rel?: string; underlayPath?: string; underlayRel?: string }[] = [];
      for (const scene of scenesForRender) {
        const sceneBackgroundImageRelBySceneId =
          backgroundImageRelBySceneId[scene.id]
            ? { [scene.id]: backgroundImageRelBySceneId[scene.id] }
            : {};
        const sceneCompositorBySceneId =
          editorCompositorBySceneId[scene.id] ? { [scene.id]: editorCompositorBySceneId[scene.id] } : {};
        const payload: Record<string, unknown> = {
          ...basePayload,
          scenes: [scene],
          backgroundImageRelBySceneId:
            Object.keys(sceneBackgroundImageRelBySceneId).length > 0
              ? sceneBackgroundImageRelBySceneId
              : undefined,
        };
        if (Object.keys(sceneCompositorBySceneId).length > 0) {
          payload.editorCompositorBySceneId = sceneCompositorBySceneId;
        }
        const data = await requestRenderedScenes(studioApiPath("/api/render-scenes"), payload);
        renderedImages.push(...data.images);
      }
      const imgs = renderedImages.map((im) => ({
        ...im,
        rel: im.rel ?? toOutputRel(im.path),
        underlayRel: im.underlayRel ?? (im.underlayPath ? toOutputRel(im.underlayPath) : undefined),
      }));
      setImages(imgs);
      const prefer = compositorSceneIdRef.current;
      const previewPrefer = previewSceneId;
      setPreviewSceneId(
        previewPrefer && imgs.some((i) => i.sceneId === previewPrefer)
          ? previewPrefer
          : prefer && imgs.some((i) => i.sceneId === prefer)
            ? prefer
            : imgs[0]?.sceneId ?? null,
      );
      setPngsStale(false);
      setPreviewNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const stopVoicePreview = useCallback(() => {
    voicePreviewAbortRef.current?.abort();
    voicePreviewAbortRef.current = null;
    const current = voicePreviewAudioRef.current;
    if (current) {
      current.pause();
      current.currentTime = 0;
    }
    voicePreviewAudioRef.current = null;
    if (voicePreviewUrlRef.current) {
      URL.revokeObjectURL(voicePreviewUrlRef.current);
      voicePreviewUrlRef.current = null;
    }
    setVoicePreviewPlaying(false);
    setVoicePreviewBusy(false);
  }, []);

  const previewVoice = async () => {
    if (!content?.script?.trim()) {
      setError("Add a voiceover script before preview.");
      return;
    }
    stopVoicePreview();
    setVoicePreviewBusy(true);
    setVoicePreviewPlaying(false);
    setError(null);
    const controller = new AbortController();
    voicePreviewAbortRef.current = controller;
    try {
      const res = await fetch(studioApiPath("/api/preview-voice"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          script: content.script,
          voiceGender: content.voiceGender ?? "female",
          voiceSpeed: content.voiceSpeed ?? 1,
          elevenlabsVoiceId: elevenlabsVoiceId || undefined,
          voiceProviderPreference,
          contentId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Preview failed (${res.status})`);
      }
      const usedProvider = res.headers.get("X-Voice-Provider");
      const fallbackReason = res.headers.get("X-Voice-Fallback-Reason");
      if (usedProvider === "openai" && fallbackReason) {
        setVoiceSettingsMsg("Preview used OpenAI TTS because ElevenLabs was unavailable.");
        setTimeout(() => setVoiceSettingsMsg(null), 3500);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      voicePreviewUrlRef.current = url;
      const audio = new Audio(url);
      voicePreviewAudioRef.current = audio;
      setVoicePreviewPlaying(true);
      audio.onended = () => {
        if (voicePreviewUrlRef.current === url) {
          URL.revokeObjectURL(url);
          voicePreviewUrlRef.current = null;
          voicePreviewAudioRef.current = null;
        }
        setVoicePreviewPlaying(false);
      };
      audio.onerror = () => {
        if (voicePreviewUrlRef.current === url) {
          URL.revokeObjectURL(url);
          voicePreviewUrlRef.current = null;
        }
        voicePreviewAudioRef.current = null;
        setVoicePreviewPlaying(false);
        setError("Could not play preview audio in this browser.");
      };
      await audio.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setVoicePreviewPlaying(false);
      setError(e instanceof Error ? e.message : "Voice preview failed");
    } finally {
      voicePreviewAbortRef.current = null;
      setVoicePreviewBusy(false);
    }
  };

  useEffect(() => () => stopVoicePreview(), [stopVoicePreview]);

  const saveUserTemplateToDisk = async () => {
    if (!content?.templateSource) return;
    if (!contentId.startsWith("tpl-")) {
      setError(
        'Use “New template” on Templates (Next off, Fast results, Racecards, TEAMtalk News, Planet Rugby Tables, F1 Grid, F1 Results, …) to get a tpl-… id — then edits can be saved to disk.',
      );
      return;
    }
    setBusy("save-template");
    setError(null);
    setTemplateDiskMsg(null);
    try {
      const ts = content.templateSource;
      const sceneEdits = Object.fromEntries(
        content.scenes.map((s) => [s.id, { captionLine: s.captionLine, durationSec: s.durationSec }]),
      );
      let body: object;
      if (ts.format === "next-off") {
        body = {
          format: "next-off",
          nextOff: {
            ...ts.bundle,
            id: contentId,
            script: content.script,
            aiPrompt,
            aiVoiceStyle: voiceStyle,
            aiDeliveryStyle: deliveryStyle,
            aiTone: tone,
            voiceGender: content.voiceGender,
            voiceSpeed: content.voiceSpeed ?? 1,
            sceneEdits,
            backgroundImageRel: backgroundImageRel ?? undefined,
            backgroundImageRelBySceneId:
              Object.keys(backgroundImageRelBySceneId).length > 0
                ? { ...backgroundImageRelBySceneId }
                : undefined,
            backgroundVideoRel: backgroundVideoRel ?? undefined,
            motionBackdropOpaqueOpacity,
            motionBackdropDimStrength,
          },
        };
      } else if (ts.format === "fast-results") {
        body = {
          format: "fast-results",
          fastResults: {
            ...ts.bundle,
            id: contentId,
            script: content.script,
            aiPrompt,
            aiVoiceStyle: voiceStyle,
            aiDeliveryStyle: deliveryStyle,
            aiTone: tone,
            voiceGender: content.voiceGender,
            voiceSpeed: content.voiceSpeed ?? 1,
            sceneEdits,
            backgroundImageRel: backgroundImageRel ?? undefined,
            backgroundImageRelBySceneId:
              Object.keys(backgroundImageRelBySceneId).length > 0
                ? { ...backgroundImageRelBySceneId }
                : undefined,
            backgroundVideoRel: backgroundVideoRel ?? undefined,
            motionBackdropOpaqueOpacity,
            motionBackdropDimStrength,
          },
        };
      } else if (ts.format === "teamtalk-news") {
        const winnerData = content.scenes.find((s) => s.id === "winner")?.data as
          | Record<string, unknown>
          | undefined;
        const detailData = content.scenes.find((s) => s.id === "placings")?.data as
          | Record<string, unknown>
          | undefined;
        const outroData = content.scenes.find((s) => s.id === "outro")?.data as
          | Record<string, unknown>
          | undefined;
        const sceneEdits: NonNullable<TeamtalkNewsBundle["sceneEdits"]> = {};
        for (const s of content.scenes) {
          sceneEdits[s.id] = { captionLine: s.captionLine, durationSec: s.durationSec };
        }
        const latest = {
          ...ts.bundle,
          id: contentId,
          headlineLines:
            Array.isArray(winnerData?.headlineLines) &&
            winnerData!.headlineLines.every((x) => typeof x === "string")
              ? (winnerData!.headlineLines as string[])
              : ts.bundle.headlineLines,
          secondaryParagraph:
            typeof detailData?.secondaryParagraph === "string"
              ? detailData.secondaryParagraph
              : ts.bundle.secondaryParagraph,
          linkCta: typeof outroData?.linkCta === "string" ? outroData.linkCta : ts.bundle.linkCta,
          outroLine:
            typeof outroData?.outroLine === "string" ? outroData.outroLine : ts.bundle.outroLine,
          playerImageUrl:
            typeof winnerData?.playerImageUrl === "string"
              ? winnerData.playerImageUrl
              : ts.bundle.playerImageUrl,
          leftClubLogoUrl:
            typeof winnerData?.leftClubLogoUrl === "string"
              ? winnerData.leftClubLogoUrl
              : ts.bundle.leftClubLogoUrl,
          rightClubLogoUrl:
            typeof winnerData?.rightClubLogoUrl === "string"
              ? winnerData.rightClubLogoUrl
              : ts.bundle.rightClubLogoUrl,
          playerName: typeof winnerData?.playerName === "string" ? winnerData.playerName : ts.bundle.playerName,
          tag: typeof winnerData?.tag === "string" ? winnerData.tag : ts.bundle.tag,
          script: content.script,
          aiPrompt,
          aiVoiceStyle: voiceStyle,
          aiDeliveryStyle: deliveryStyle,
          aiTone: tone,
          voiceGender: content.voiceGender,
          voiceSpeed: content.voiceSpeed ?? 1,
          backgroundImageRel: backgroundImageRel ?? undefined,
          backgroundImageRelBySceneId:
            Object.keys(backgroundImageRelBySceneId).length > 0
              ? { ...backgroundImageRelBySceneId }
              : undefined,
          backgroundVideoRel: backgroundVideoRel ?? undefined,
          motionBackdropOpaqueOpacity,
          motionBackdropDimStrength,
          burnSubtitles,
          sceneEdits,
        };
        body = { format: "teamtalk-news", teamtalkNews: latest };
      } else if (ts.format === "f1-grid") {
        const sceneEdits: NonNullable<F1GridBundle["sceneEdits"]> = {};
        for (const s of content.scenes) {
          sceneEdits[s.id] = { captionLine: s.captionLine, durationSec: s.durationSec };
        }
        const latest: F1GridBundle = {
          ...ts.bundle,
          id: contentId,
          script: content.script,
          aiPrompt,
          aiVoiceStyle: voiceStyle,
          aiDeliveryStyle: deliveryStyle,
          aiTone: tone,
          voiceGender: content.voiceGender,
          voiceSpeed: content.voiceSpeed ?? 1,
          backgroundImageRel: backgroundImageRel ?? undefined,
          backgroundImageRelBySceneId:
            Object.keys(backgroundImageRelBySceneId).length > 0
              ? { ...backgroundImageRelBySceneId }
              : undefined,
          backgroundVideoRel: backgroundVideoRel ?? undefined,
          motionBackdropOpaqueOpacity,
          motionBackdropDimStrength,
          burnSubtitles,
          sceneEdits,
        };
        body = { format: "f1-grid", f1Grid: latest };
      } else if (ts.format === "f1-results") {
        const sceneEdits: NonNullable<F1ResultsBundle["sceneEdits"]> = {};
        for (const s of content.scenes) {
          sceneEdits[s.id] = { captionLine: s.captionLine, durationSec: s.durationSec };
        }
        const latest: F1ResultsBundle = {
          ...ts.bundle,
          id: contentId,
          script: content.script,
          aiPrompt,
          aiVoiceStyle: voiceStyle,
          aiDeliveryStyle: deliveryStyle,
          aiTone: tone,
          voiceGender: content.voiceGender,
          voiceSpeed: content.voiceSpeed ?? 1,
          backgroundImageRel: backgroundImageRel ?? undefined,
          backgroundImageRelBySceneId:
            Object.keys(backgroundImageRelBySceneId).length > 0
              ? { ...backgroundImageRelBySceneId }
              : undefined,
          backgroundVideoRel: backgroundVideoRel ?? undefined,
          motionBackdropOpaqueOpacity,
          motionBackdropDimStrength,
          burnSubtitles,
          sceneEdits,
        };
        body = { format: "f1-results", f1Results: latest };
      } else if (ts.format === "planet-rugby-table") {
        const sceneEdits: NonNullable<PlanetRugbyTableBundle["sceneEdits"]> = {};
        for (const s of content.scenes) {
          sceneEdits[s.id] = { captionLine: s.captionLine, durationSec: s.durationSec };
        }
        const latest: PlanetRugbyTableBundle = {
          ...ts.bundle,
          id: contentId,
          script: content.script,
          aiPrompt,
          aiVoiceStyle: voiceStyle,
          aiDeliveryStyle: deliveryStyle,
          aiTone: tone,
          voiceGender: content.voiceGender,
          voiceSpeed: content.voiceSpeed ?? 1,
          sceneEdits,
        };
        body = { format: "planet-rugby-table", planetRugbyTable: latest };
      } else if (ts.format === "planet-football-table") {
        const sceneEdits: NonNullable<PlanetFootballTableBundle["sceneEdits"]> = {};
        for (const s of content.scenes) {
          sceneEdits[s.id] = { captionLine: s.captionLine, durationSec: s.durationSec };
        }
        const latest: PlanetFootballTableBundle = {
          ...ts.bundle,
          id: contentId,
          script: content.script,
          aiPrompt,
          aiVoiceStyle: voiceStyle,
          aiDeliveryStyle: deliveryStyle,
          aiTone: tone,
          matchContext: ts.bundle.matchContext,
          cardContentMode: ts.bundle.cardContentMode,
          showMatchScore: ts.bundle.showMatchScore,
          showMatchScorers: ts.bundle.showMatchScorers,
          showStandingsTable: ts.bundle.showStandingsTable,
          includeCommentaryInAi: ts.bundle.includeCommentaryInAi,
          brandLogoScale: ts.bundle.brandLogoScale,
          displayBrand: ts.bundle.displayBrand,
          burnSubtitles,
          voiceGender: content.voiceGender,
          voiceSpeed: content.voiceSpeed ?? 1,
          sceneEdits,
        };
        body = { format: "planet-football-table", planetFootballTable: latest };
      } else if (ts.format === "team-line-up") {
        const latest: TeamLineUpBundle = {
          ...ts.bundle,
          id: contentId,
          aiCaption: content.caption,
        };
        body = { format: "team-line-up", teamLineUp: latest };
      } else if (ts.format === "team-sheet") {
        const latest: TeamSheetBundle = {
          ...ts.bundle,
          id: contentId,
          aiCaption: content.caption,
        };
        body = { format: "team-sheet", teamSheet: latest };
      } else if (ts.format === "score-line") {
        const latest: ScoreLineBundle = {
          ...ts.bundle,
          id: contentId,
          aiCaption: content.caption,
        };
        body = { format: "score-line", scoreLine: latest };
      } else if (ts.format === "football-lineups") {
        const latest: FootballLineupBundle = footballLineupBundleFromContent(content, {
          ...ts.bundle,
          id: contentId,
        });
        body = { format: "football-lineups", footballLineup: latest };
      } else {
        body = {
          format: "racecard",
          racecard: {
            ...ts.snapshot,
            id: contentId,
            script: content.script,
            aiPrompt,
            aiVoiceStyle: voiceStyle,
            aiDeliveryStyle: deliveryStyle,
            aiTone: tone,
            voiceGender: content.voiceGender,
            voiceSpeed: content.voiceSpeed ?? 1,
            sceneEdits,
            backgroundImageRel: backgroundImageRel ?? undefined,
            backgroundImageRelBySceneId:
              Object.keys(backgroundImageRelBySceneId).length > 0
                ? { ...backgroundImageRelBySceneId }
                : undefined,
            backgroundVideoRel: backgroundVideoRel ?? undefined,
            motionBackdropOpaqueOpacity,
            motionBackdropDimStrength,
          },
        };
      }
      const res = await fetch(studioApiPath("/api/templates"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Save failed");
      setTemplateDiskMsg("Saved to data/local/user-templates.json (gitignored).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const saveAiScriptPackage = async () => {
    if (!content) return;
    saveAiPrompt();
    saveVoiceSettings();
    if (contentId.startsWith("tpl-") && content.templateSource) {
      await saveUserTemplateToDisk();
      setAiScriptSavedAt(Date.now());
      setAiSuccess("Saved script, AI style settings, and voice settings to template.");
      setTimeout(() => setAiSuccess(null), 3500);
      return;
    }
    saveTemplateToBrowser();
    setAiScriptSavedAt(Date.now());
    setAiSuccess("Saved script and settings in this browser.");
    setTimeout(() => setAiSuccess(null), 3500);
  };

  const buildVideo = async () => {
    if (!content) return;
    let imagesForBuild = images;
    if (
      (content.templateSource?.format === "planet-rugby-table" || content.templateSource?.format === "planet-football-table") &&
      (images.length !== content.scenes.length || pngsStale)
    ) {
      setBusy("render");
      setError(null);
      try {
        const rematerialized = materializeFromTemplate(content.templateSource);
        const currentById = new Map(content.scenes.map((s) => [s.id, s]));
        const scenesForRender = rematerialized.scenes.map((s) => {
          const cur = currentById.get(s.id);
          if (!cur) return s;
          return {
            ...s,
            captionLine: cur.captionLine,
            durationSec: cur.durationSec,
          };
        });
        const data = await requestRenderedScenes(studioApiPath("/api/render-scenes"), {
            contentId,
            scenes: scenesForRender,
            width: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].width,
            height: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].height,
            backgroundImageRel,
            backgroundImageRelBySceneId,
            backgroundVideoFrameRel,
            backgroundVideoRel,
            ...(backgroundVideoRel
              ? {
                  motionBackdropOpaqueOpacity,
                  motionBackdropDimStrength,
                }
              : {}),
          });
        imagesForBuild = data.images.map((im) => ({
          ...im,
          rel: im.rel ?? toOutputRel(im.path),
          underlayRel: im.underlayRel ?? (im.underlayPath ? toOutputRel(im.underlayPath) : undefined),
        }));
        setImages(imagesForBuild);
        setPreviewSceneId((prev) =>
          prev && imagesForBuild.some((i) => i.sceneId === prev) ? prev : imagesForBuild[0]?.sceneId ?? null,
        );
        setPngsStale(false);
        setPreviewNonce((n) => n + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render failed");
        setBusy(null);
        return;
      }
    }
    if (imagesForBuild.length !== content.scenes.length) {
      setError("Render all scenes first.");
      return;
    }
    setBusy("video");
    setVideoBuildStatus(null);
    setError(null);
    try {
      const order = new Map(imagesForBuild.map((im) => [im.sceneId, im.rel ?? im.path]));
      const scriptChunks = splitScriptIntoSceneCaptions(content.script, content.scenes.length);
      const scenes = content.scenes.map((s, i) => ({
        imagePath: order.get(s.id) ?? "",
        durationSec: s.durationSec,
        caption: effectiveSceneCaption(s.captionLine, scriptChunks[i] ?? ""),
      }));
      if (scenes.some((s) => !s.imagePath)) {
        throw new Error("Missing image for a scene — re-render.");
      }
      const pfAccent =
        content.templateSource?.format === "planet-football-table"
          ? planetFootballBrandDefaults(
              normalizePlanetFootballDisplayBrand(content.templateSource.bundle.displayBrand),
            ).subtitleAccentColor
          : undefined;
      const res = await fetch(studioApiPath("/api/build-short"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          format,
          headline: content.headline,
          script: content.script,
          scenes,
          burnSubtitles,
          subtitleAccentColor: pfAccent,
          voiceGender: content.voiceGender ?? "female",
          voiceSpeed: content.voiceSpeed ?? 1,
          elevenlabsVoiceId: elevenlabsVoiceId || undefined,
          voiceProviderPreference,
          outputWidth: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].width,
          outputHeight: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].height,
          buildMode: effectiveVideoBuildMode,
          ...(backgroundVideoRel ? { backgroundVideoRel } : {}),
        }),
      });
      const data = await parseApiJson<{
        async?: boolean;
        jobId?: string;
        status?: string;
        error?: string;
        videoPath?: string;
        voiceProvider?: string;
        voiceFallbackReason?: string;
        debug?: unknown;
      }>(res);
      if (data.error && res.status !== 202) throw new Error(data.error);
      if (!res.ok && res.status !== 202) throw new Error(data.error || "Video build failed");

      let buildResult = data;
      if (res.status === 202 && data.async && data.jobId) {
        buildResult = await pollVideoBuildJob(
          studioApiPath(`/api/build-short?jobId=${encodeURIComponent(data.jobId)}`),
          {
            onProgress: (job) => {
              if (job.status === "running" && job.phase) {
                setVideoBuildStatus(job.phase);
              } else if (job.status === "pending") {
                setVideoBuildStatus("starting");
              }
            },
          },
        );
      }

      if (buildResult.error) throw new Error(sanitizeVideoBuildError(buildResult.error));
      if (!buildResult.videoPath) throw new Error("Video build finished without returning a video path.");
      setVideoRel(toOutputRel(buildResult.videoPath));
      setVideoPreviewNonce((n) => n + 1);
      if (buildResult.voiceProvider === "openai" && buildResult.voiceFallbackReason) {
        setVoiceSettingsMsg("Video built with OpenAI TTS after ElevenLabs fallback.");
        setTimeout(() => setVoiceSettingsMsg(null), 3500);
      }
      setEditVideoMsg(null);
      setTrimStartInput("0");
      setTrimEndInput("0");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
      setVideoBuildStatus(null);
    }
  };

  const originalVideoRel = `video/${contentId}-short.mp4`;
  const editedVideoRel = `video/${contentId}-short-edited.mp4`;

  const applyVideoTrim = async () => {
    if (!videoRel) return;
    const ts = parseFloat(trimStartInput);
    const te = parseFloat(trimEndInput);
    if (!Number.isFinite(ts) || !Number.isFinite(te) || ts < 0 || te < 0) {
      setError("Trim values must be non-negative numbers.");
      return;
    }
    if (ts + te < 0.05) {
      setError("Trim at least 0.05s total (from start and/or end).");
      return;
    }
    setBusy("edit-video");
    setError(null);
    setEditVideoMsg(null);
    try {
      const res = await fetch(studioApiPath("/api/edit-video"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          videoRel,
          trimStartSec: ts,
          trimEndSec: te,
        }),
      });
      const data = await parseApiJson<{
        error?: string;
        videoRel?: string;
        outputDurationSec?: number;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Edit failed");
      if (data.videoRel) setVideoRel(data.videoRel);
      setEditedCutOnDisk(true);
      setTrimStartInput("0");
      setTrimEndInput("0");
      setEditVideoMsg(
        `Edited clip saved (${(data.outputDurationSec ?? 0).toFixed(2)}s). Original build unchanged.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setBusy(null);
    }
  };

  const saveBackgroundUploads = async () => {
    const imgFile = bgImageInputRef.current?.files?.[0];
    const vidFile = bgVideoInputRef.current?.files?.[0];
    if (!imgFile && !vidFile) {
      setUploadMsg("Choose an image and/or video first.");
      return;
    }
    setBusy("upload");
    setUploadMsg(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("contentId", contentId);
      const selectedSceneId = compositorSceneId ?? content?.scenes[0]?.id ?? "";
      if (imgFile && selectedSceneId) fd.set("sceneId", selectedSceneId);
      let imageOptimisationMsg = "";
      if (imgFile) {
        const optimised = await optimiseClientImageFile(imgFile);
        if (optimised.file.size > 6 * 1024 * 1024) {
          throw new Error("Background image is still too large after optimisation. Use an image under 6MB for live renders.");
        }
        imageOptimisationMsg = optimised.message ? `${optimised.message} ` : "";
        fd.append("backgroundImage", optimised.file);
      }
      if (vidFile) fd.append("backgroundVideo", vidFile);
      const res = await fetch(studioApiPath("/api/editor-upload"), { method: "POST", body: fd });
      const data = await parseApiJson<{
        error?: string;
        backgroundImageRel?: string;
        backgroundImageRelBySceneId?: Record<string, string>;
        backgroundVideoRel?: string;
        backgroundVideoFrameRel?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const mergedByScene = data.backgroundImageRelBySceneId
        ? { ...backgroundImageRelBySceneId, ...data.backgroundImageRelBySceneId }
        : { ...backgroundImageRelBySceneId };
      const nextBackgroundImageRel = data.backgroundImageRel?.trim()
        ? data.backgroundImageRel.trim()
        : data.backgroundImageRelBySceneId
          ? coalesceGlobalBackgroundImageRel(backgroundImageRel, mergedByScene)
          : data.backgroundVideoRel
            ? null
            : backgroundImageRel;
      if (data.backgroundImageRelBySceneId) {
        setBackgroundImageRelBySceneId(mergedByScene);
      }
      if (nextBackgroundImageRel !== backgroundImageRel) {
        setBackgroundImageRel(nextBackgroundImageRel);
      }
      if (data.backgroundVideoRel) setBackgroundVideoRel(data.backgroundVideoRel);
      if (data.backgroundVideoFrameRel) setBackgroundVideoFrameRel(data.backgroundVideoFrameRel);
      setContent((c) =>
        c && c.templateSource && c.templateSource.format !== "football-lineups"
          ? mergeBackdropIntoContent(c, {
              backgroundImageRel: nextBackgroundImageRel,
              backgroundImageRelBySceneId: Object.keys(mergedByScene).length > 0 ? mergedByScene : null,
              backgroundVideoRel: data.backgroundVideoRel ?? backgroundVideoRel,
            })
          : c,
      );
      setUploadMsg(
        imgFile && selectedSceneId
          ? `${imageOptimisationMsg}Saved image for ${sceneDisplayLabel(format, selectedSceneId)} and attached it to this template draft — render scenes to apply.`
          : `${imageOptimisationMsg}Saved and attached to this template draft — use Render scenes to apply behind the template.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload error");
    } finally {
      setBusy(null);
    }
  };

  const clearBackgroundUploads = () => {
    setBackgroundImageRel(null);
    setBackgroundImageRelBySceneId({});
    setBackgroundVideoRel(null);
    setBackgroundVideoFrameRel(null);
    setMotionBackdropOpaqueOpacity(0.3);
    setMotionBackdropDimStrength(0.45);
    setUploadMsg(null);
    if (bgImageInputRef.current) bgImageInputRef.current.value = "";
    if (bgVideoInputRef.current) bgVideoInputRef.current.value = "";
  };

  const previewRel = useMemo(() => {
    if (images.length === 0) return undefined;
    if (previewSceneId) {
      const hit = images.find((i) => i.sceneId === previewSceneId);
      return hit?.rel;
    }
    return images[0]?.rel;
  }, [images, previewSceneId]);

  const editorLivePreviewScene = useMemo(() => {
    if (content?.format === "team-sheet" && content.templateSource?.format === "team-sheet") {
      const scenes = materializeFromTemplate(content.templateSource).scenes;
      return (
        (previewSceneId ? scenes.find((s) => s.id === previewSceneId) : undefined) ??
        scenes.find((s) => s.id === "sheet-home") ??
        scenes.find((s) => s.id === "sheet-combined") ??
        scenes.find((s) => s.templateId?.startsWith("team-sheet-")) ??
        scenes[0] ??
        null
      );
    }
    if (content?.format === "score-line" && content.templateSource?.format === "score-line") {
      const scenes = materializeFromTemplate(content.templateSource).scenes;
      return (
        (previewSceneId ? scenes.find((s) => s.id === previewSceneId) : undefined) ??
        scenes.find((s) => s.id === "score-main") ??
        scenes.find((s) => s.templateId === "score-line-full") ??
        scenes[0] ??
        null
      );
    }
    if (content?.format === "team-line-up" && content.templateSource?.format === "team-line-up") {
      const scenes = materializeFromTemplate(content.templateSource).scenes;
      return (
        (previewSceneId ? scenes.find((s) => s.id === previewSceneId) : undefined) ??
        scenes.find((s) => s.id === "lineup-home") ??
        scenes.find((s) => s.templateId === "team-line-up-card") ??
        scenes[0] ??
        null
      );
    }
    if (content?.format !== "planet-rugby-table" && content?.format !== "planet-football-table") return null;
    const ts = content.templateSource;
    const scenes =
      ts?.format === "planet-rugby-table" || ts?.format === "planet-football-table"
        ? materializeFromTemplate(ts).scenes
        : content.scenes;
    return (
      (previewSceneId ? scenes.find((s) => s.id === previewSceneId) : undefined) ??
      scenes.find((s) => s.templateId === "planet-rugby-table" || s.templateId === "planet-football-table") ??
      scenes[0] ??
      null
    );
  }, [content?.format, content?.scenes, content?.templateSource, previewSceneId]);

  const livePreviewDims = useMemo(() => {
    const fallback = VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode];
    if (
      (content?.format === "team-line-up" || content?.format === "team-sheet" || content?.format === "score-line") &&
      editorLivePreviewScene?.data
    ) {
      const width = Number(editorLivePreviewScene.data.width);
      const height = Number(editorLivePreviewScene.data.height);
      if (width > 0 && height > 0) return { width, height };
    }
    return { width: fallback.width, height: fallback.height };
  }, [content?.format, editorLivePreviewScene, effectiveVideoBuildMode]);

  const livePreviewFrameClass = useMemo(() => {
    if (content?.format === "team-line-up" || content?.format === "team-sheet" || content?.format === "score-line") {
      const ratio = livePreviewDims.width / livePreviewDims.height;
      if (ratio > 1.2) return "mx-auto aspect-[16/9] w-full max-w-xl max-h-[min(72vh,720px)]";
      if (livePreviewDims.height > 1600) return EDITOR_PREVIEW_FRAME;
      return "mx-auto aspect-[4/5] w-full max-w-md max-h-[min(82vh,900px)]";
    }
    return previewFrameClass;
  }, [content?.format, livePreviewDims, previewFrameClass]);

  const livePreviewScaleValue = useMemo(() => {
    if (content?.format === "team-line-up" || content?.format === "team-sheet" || content?.format === "score-line") {
      if (livePreviewDims.width > livePreviewDims.height) return 1 / 3;
      if (livePreviewDims.height <= 1400) return 0.37;
      return 0.375;
    }
    return livePreviewScale;
  }, [content?.format, livePreviewDims, livePreviewScale]);

  useEffect(() => {
    if (!editorLivePreviewScene) {
      setPlanetRugbyLivePreviewHtml(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const dims = VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode];
      const sceneDims =
        content?.format === "team-line-up" || content?.format === "team-sheet" || content?.format === "score-line"
          ? livePreviewDims
          : { width: dims.width, height: dims.height };
      fetch(studioApiPath("/api/preview-scene-html"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          scene: editorLivePreviewScene,
          width: sceneDims.width,
          height: sceneDims.height,
          backgroundImageRel,
          backgroundImageRelBySceneId,
          backgroundVideoFrameRel,
          backgroundVideoRel,
        }),
      })
        .then((res) => (res.ok ? parseApiJson<{ html?: string; error?: string }>(res) : Promise.reject(new Error("Live preview failed"))))
        .then((data) => setPlanetRugbyLivePreviewHtml(data.html ?? null))
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setPlanetRugbyLivePreviewHtml(null);
        });
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    backgroundImageRel,
    backgroundImageRelBySceneId,
    backgroundVideoFrameRel,
    backgroundVideoRel,
    content?.format,
    effectiveVideoBuildMode,
    editorLivePreviewScene,
    livePreviewDims,
  ]);

  const planetRugbyActiveControlsSummary = useMemo(() => {
    if (content?.templateSource?.format !== "planet-rugby-table" && content?.templateSource?.format !== "planet-football-table") return null;
    const b = content.templateSource.bundle;
    const mode = b.tableMode ?? "full-table";
    const hidden = new Set(b.hiddenColumns ?? []);
    const visibleLabels = [
      ["position", "#"],
      ["team", "TEAM"],
      ["played", "P"],
      ["won", "W"],
      ["drawn", "D"],
      ["lost", "L"],
      ["pointsDifference", "PD"],
      ["points", "PTS"],
    ]
      .filter(([k]) => !hidden.has(k as typeof b.hiddenColumns extends Array<infer T> ? T : never))
      .map(([, label]) => label)
      .join(" ");
    const modeLabel =
      mode === "full-table"
        ? "Full table"
        : mode === "top-half"
          ? "Top half"
          : mode === "bottom-half"
            ? "Bottom half"
            : mode === "head-to-head"
              ? `Head-to-head${b.selectedTeamA ? `: ${b.selectedTeamA}` : ""}${b.selectedTeamB ? ` vs ${b.selectedTeamB}` : ""}`
              : mode === "playoff-race"
                ? `Playoff race (Top ${b.playoffRows ?? 4})`
                : `Bottom battle (Bottom ${b.bottomRows ?? 4})`;
    const rowsLabel = `${b.table.rows.length} table row${b.table.rows.length === 1 ? "" : "s"} (one slide)`;
    const styleLabel = `Style ${(b.tableStyle ?? "standard-image-overlay").replaceAll("-", " ")}`;
    const positionLabel = `Position ${b.tablePosition ?? "lower-left"}`;
    const teamLogosLabel = `Club logos ${b.showTeamLogos !== false ? "on" : "off"}`;
    const transparencyLabel = `Table transparency ${Math.round((1 - (b.tablePanelOpacity ?? 0.58)) * 100)}%`;
    const bgLabel = b.backgroundImageUrl?.trim() || backgroundImageRel ? "Background on" : "Background off";
    const introLabel = `Intro "${(b.introLine ?? `${b.table.competition} latest table`).trim()}"`;
    const outroLabel = `Outro "${(b.outroLine ?? "For more rugby coverage, head to PlanetRugby.com").trim()}"`;
    return `${modeLabel} · ${styleLabel} · ${rowsLabel} · ${positionLabel} · ${teamLogosLabel} · ${transparencyLabel} · Columns: ${visibleLabels} · ${bgLabel} · ${introLabel} · ${outroLabel}`;
  }, [backgroundImageRel, content?.templateSource]);

  const downloadPreviewImage = useCallback(async () => {
    if (!previewRel && !editorLivePreviewScene) return;
    setPreviewSaveBusy(true);
    setPreviewSaveMsg(null);
    setError(null);
    try {
      let relForDownload = previewRel;
      let savedFromLivePreview = false;
      const exportScene = editorLivePreviewScene;
      if (exportScene) {
        const data = await requestRenderedScenes(studioApiPath("/api/render-scenes"), {
            contentId: `${contentId}-live-preview`,
            scenes: [exportScene],
            width: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].width,
            height: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].height,
            pixelRatio: PREVIEW_EXPORT_PIXEL_RATIO,
            backgroundImageRel: backgroundImageRel ?? (backgroundVideoRel ? backgroundVideoFrameRel : null),
            backgroundImageRelBySceneId,
          });
        const first = data.images[0];
        relForDownload = first?.rel ?? (first?.path ? toOutputRel(first.path) : undefined);
        if (!relForDownload) throw new Error("Could not render live preview image.");
        savedFromLivePreview = true;
        setPreviewNonce((n) => n + 1);
      }

      if (!relForDownload) return;
      const res = await fetch(fileUrl(relForDownload, previewNonce), { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not download preview (${res.status}).`);
      const srcBlob = await res.blob();
      let outBlob = srcBlob;
      let ext = "png";
      let mime = "image/png";
      if (previewImageFormat === "jpg") {
        const objectUrl = URL.createObjectURL(srcBlob);
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new window.Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("Could not decode preview image."));
            el.src = objectUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 1080;
          canvas.height = img.naturalHeight || 1920;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas export unavailable.");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          outBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Could not encode JPG."))),
              "image/jpeg",
              PREVIEW_JPG_QUALITY,
            );
          });
          ext = "jpg";
          mime = "image/jpeg";
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
      const sceneId = previewSceneId ?? images[0]?.sceneId ?? "scene";
      const base = sanitizeDownloadPart(content?.headline || `${contentId}-${sceneId}`);
      const blob = outBlob.type ? outBlob : new Blob([outBlob], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-${sanitizeDownloadPart(sceneId)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setPreviewSaveMsg(savedFromLivePreview ? `Rendered and saved live ${ext.toUpperCase()} image.` : `Saved ${ext.toUpperCase()} image.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save preview image.");
    } finally {
      setPreviewSaveBusy(false);
    }
  }, [
    backgroundImageRel,
    backgroundImageRelBySceneId,
    backgroundVideoFrameRel,
    backgroundVideoRel,
    content?.headline,
    contentId,
    effectiveVideoBuildMode,
    images,
    editorLivePreviewScene,
    previewImageFormat,
    previewNonce,
    previewRel,
    previewSceneId,
  ]);

  const savePreviewImageToLibrary = useCallback(async () => {
    if (!previewRel && !editorLivePreviewScene) return;
    setPreviewLibraryBusy(true);
    setPreviewSaveMsg(null);
    setError(null);
    try {
      let sourceRel = previewRel;
      const sceneId = previewSceneId ?? editorLivePreviewScene?.id ?? images[0]?.sceneId ?? "scene";
      if (editorLivePreviewScene) {
        const data = await requestRenderedScenes(studioApiPath("/api/render-scenes"), {
            contentId: `${contentId}-library-preview`,
            scenes: [editorLivePreviewScene],
            width: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].width,
            height: VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].height,
            pixelRatio: PREVIEW_EXPORT_PIXEL_RATIO,
            backgroundImageRel: backgroundImageRel ?? (backgroundVideoRel ? backgroundVideoFrameRel : null),
            backgroundImageRelBySceneId,
          });
        const first = data.images[0];
        sourceRel = first?.rel ?? (first?.path ? toOutputRel(first.path) : undefined);
        if (!sourceRel) throw new Error("Could not render preview for library.");
      }
      if (!sourceRel) throw new Error("No preview image to save.");

      const saveRes = await fetch(studioApiPath("/api/library/save-preview-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          sourceRel,
          sceneId,
          title: content?.headline ?? "Saved preview image",
        }),
      });
      const saveJson = await parseApiJson<{ error?: string; rel?: string }>(saveRes);
      if (!saveRes.ok) throw new Error(saveJson.error || "Could not save to library.");
      setPreviewSaveMsg(`Saved to Library: ${saveJson.rel ?? "preview image"}`);
      setBackdropLibraryData(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save to library.");
    } finally {
      setPreviewLibraryBusy(false);
    }
  }, [
    backgroundImageRel,
    backgroundImageRelBySceneId,
    backgroundVideoFrameRel,
    backgroundVideoRel,
    content?.headline,
    contentId,
    effectiveVideoBuildMode,
    images,
    editorLivePreviewScene,
    previewRel,
    previewSceneId,
  ]);

  /** Template + data only (no compositor PNG) — shown under the layer canvas in the image editor */
  const compositorTemplateUnderlayRel = useMemo(() => {
    const sid = compositorSceneId ?? content?.scenes[0]?.id;
    if (!sid) return undefined;
    const hit = images.find((i) => i.sceneId === sid);
    return hit?.underlayRel;
  }, [images, compositorSceneId, content?.scenes]);

  const motionOpaqueK = clampMotionBackdropOpaqueOpacity(motionBackdropOpaqueOpacity);
  const motionDimK = clampMotionBackdropDimStrength(motionBackdropDimStrength);

  return (
    <>
      <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="Actions">
            <div className="flex flex-col gap-4" role="group" aria-label="Build actions">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#eab308]/40 bg-[#eab308]/10 text-[11px] font-bold text-[#eab308]"
                  >
                    1
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#eab308]/90">Step 1</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Creates PNGs for each scene (1080×1920) from your current template and data.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[#eab308]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#eab308] transition hover:border-[#eab308]/60 hover:bg-[#141c18] disabled:opacity-40"
                  onClick={() => void renderScenes()}
                  disabled={!!busy || !content}
                >
                  Render scenes
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[11px] font-bold text-[#38bdf8]"
                  >
                    2
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#38bdf8]/90">Step 2</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Pulls the seed JSON again from the feed (same as a fresh load). Use when you want new race data or
                      Text.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[#38bdf8]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#38bdf8] transition hover:border-[#38bdf8]/60 hover:bg-[#141c18] disabled:opacity-40"
                  onClick={() => void loadContent()}
                  disabled={!!busy}
                >
                  Regenerate
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
                    <p className="text-[10px] leading-snug text-slate-500">
                      Happy with the output? Now create your video.
                    </p>
                  </div>
                </div>
                {!lockVideoBuildMode ? (
                  <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Build type
                    <select
                      className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm font-semibold text-white"
                      value={videoBuildMode}
                      onChange={(e) => setVideoBuildMode(e.target.value as VideoBuildMode)}
                      disabled={!!busy}
                    >
                      <option value="shorts">{VIDEO_BUILD_DIMENSIONS.shorts.label}</option>
                      <option value="portrait">{VIDEO_BUILD_DIMENSIONS.portrait.label}</option>
                    <option value="landscape">{VIDEO_BUILD_DIMENSIONS.landscape.label}</option>
                    </select>
                  </label>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Build type:{" "}
                    <span className="text-slate-300">{VIDEO_BUILD_DIMENSIONS[effectiveVideoBuildMode].label}</span>
                  </p>
                )}
                <button
                  type="button"
                  className="w-full rounded-lg border border-[#22c55e]/35 bg-[#0a0e0c] px-3 py-2.5 text-center text-sm font-semibold text-[#22c55e] transition hover:border-[#22c55e]/60 hover:bg-[#141c18] disabled:opacity-40"
                  onClick={() => void buildVideo()}
                  disabled={!!busy || !content}
                >
                  Build video
                </button>
              </div>
            </div>
          </Panel>

          <div className="space-y-3">
            {format !== "football-lineups" &&
              (content ? (
                <RacingTemplateEditor
                  content={content}
                  contentId={contentId}
                  setContent={setContent}
                  onAfterTemplateCommit={invalidateRasterPreviews}
                  onSaveBrowserDraft={saveTemplateToBrowser}
                />
              ) : (
                <EditorCollapsible title={templateDataTabLabel(format)}>
                  <p className="text-sm text-slate-500">Load or regenerate content to edit template data.</p>
                </EditorCollapsible>
              ))}

            <EditorCollapsible title="Edit controls">
            <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Headline
              <span className="mt-0.5 block font-normal normal-case text-slate-600">
                Shown in page copy, video metadata, and download filenames.
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm text-white"
                value={content?.headline ?? ""}
                onChange={(e) => setContent((c) => (c ? { ...c, headline: e.target.value } : c))}
              />
            </label>
            {format !== "football-lineups" && (
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Odds highlight
                <input
                  className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm text-[#22c55e]"
                  value={content?.oddsHighlight ?? ""}
                  onChange={(e) =>
                    setContent((c) => (c ? { ...c, oddsHighlight: e.target.value } : c))
                  }
                />
              </label>
            )}
            {content?.format === "football-lineups" && (
              <FootballLineupsEditor content={content} setContent={setContent} />
            )}
            {content?.format === "team-line-up" && (
              <TeamLineUpEditor content={content} setContent={setContent} />
            )}
            {content?.format === "team-sheet" && (
              <TeamSheetEditor content={content} setContent={setContent} />
            )}
            {content?.format === "score-line" && (
              <ScoreLineEditor content={content} setContent={setContent} />
            )}
            <label className="block text-xs font-semibold uppercase text-slate-500">
              CTA
              <input
                className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm"
                value={content?.cta ?? ""}
                onChange={(e) => setContent((c) => (c ? { ...c, cta: e.target.value } : c))}
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Captions / script
              <textarea
                className="mt-1 min-h-[100px] w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm"
                value={content?.caption ?? ""}
                onChange={(e) => setContent((c) => (c ? { ...c, caption: e.target.value } : c))}
              />
            </label>
            </div>
          </EditorCollapsible>

            <EditorCollapsible title="Voiceover script">
            <VoiceoverPanel
              script={content?.script ?? ""}
              onScriptChange={applyScriptWithAutoSync}
              promptOpen={aiPromptOpen}
              prompt={aiPrompt}
              voiceStyle={voiceStyle}
              deliveryStyle={deliveryStyle}
              tone={tone}
              optimiseForVoiceover={aiOptimiseRhythm}
              addEmphasis={aiAddEmphasis}
              creatorProfiles={creatorProfiles}
              selectedCreatorProfileId={selectedCreatorProfileId}
              loading={aiBusy}
              error={aiError}
              success={aiSuccess}
              settingsMessage={aiSettingsMsg}
              hasPreviousDraft={!!aiPreviousDraft}
              versions={{ versionA, versionB, versionC }}
              voicePreset={voicePreset}
              voiceProviderPreference={voiceProviderPreference}
              voiceGender={content?.voiceGender ?? "female"}
              voiceSpeed={content?.voiceSpeed ?? 1}
              voicePreviewBusy={voicePreviewBusy}
              voicePreviewPlaying={voicePreviewPlaying}
              canPreview={!!content?.script?.trim()}
              elevenlabsVoices={elevenlabsVoices}
              elevenlabsVoiceId={elevenlabsVoiceId}
              voicesLoading={voicesLoading}
              voiceDiagnostics={voiceDiagnostics}
              voiceProviderStatus={voiceProviderStatus}
              voiceSettingsMsg={voiceSettingsMsg}
              onPromptToggle={() => setAiPromptOpen((v) => !v)}
              onPromptChange={setAiPrompt}
              onSavePrompt={saveAiPrompt}
              onResetPrompt={resetAiSettings}
              onVoiceStyleChange={setVoiceStyle}
              onDeliveryStyleChange={setDeliveryStyle}
              onToneChange={setTone}
              onOptimiseChange={setAiOptimiseRhythm}
              onAddEmphasisChange={setAiAddEmphasis}
              onCreatorProfileChange={setSelectedCreatorProfileId}
              onImprove={() => void runAiScriptImprove("improve")}
              onGenerateVersions={() => void runAiScriptImprove("versions")}
              onRegenerate={() => void runAiScriptImprove("regenerate")}
              onRestorePrevious={restorePreviousAiDraft}
              onUseVersion={(value) =>
                setContent((c) => {
                  if (!c) return c;
                  const voiceSpeed = c.voiceSpeed ?? 1;
                  const { captions, durationSec } = computeSyncFromScript(value, c.scenes.length, voiceSpeed);
                  return {
                    ...c,
                    script: value,
                    scenes: c.scenes.map((s, i) => ({
                      ...s,
                      captionLine: captions[i] ?? "",
                      durationSec: durationSec[i] ?? 0.2,
                    })),
                  };
                })
              }
              onVoicePresetChange={applyVoicePreset}
              onVoiceProviderPreferenceChange={setVoiceProviderPreference}
              onVoiceGenderChange={(value) => setContent((c) => (c ? { ...c, voiceGender: value } : c))}
              onVoiceSpeedChange={(value) => setContent((c) => (c ? { ...c, voiceSpeed: value } : c))}
              onElevenlabsVoiceChange={selectElevenlabsVoice}
              onPreviewVoice={() => void previewVoice()}
              onStopPreviewVoice={stopVoicePreview}
              onSaveVoice={saveVoiceSettings}
              onSaveScriptPackage={() => void saveAiScriptPackage()}
              scriptSavedAt={aiScriptSavedAt}
              scriptActions={
                format === "racecard" && content?.templateSource?.format === "racecard" ? (
                  <div className="flex flex-col gap-2">
                    <R365Button
                      type="button"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() => {
                        const ts = content?.templateSource;
                        if (!ts || ts.format !== "racecard") return;
                        const snap = ts.snapshot;
                        setAiError(null);
                        applyScriptWithAutoSync(buildRacecardScript(snap));
                        setAiSuccess("Voiceover script filled from Template data — Racecard. Scene captions synced.");
                        setTimeout(() => setAiSuccess(null), 4000);
                      }}
                    >
                      Fill script from racecard data
                    </R365Button>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Rebuilds the voiceover from course, time, title, going, distance, top picks (with odds), market
                      mover, scratches, and the full runner list — then syncs frame captions like{" "}
                      <strong className="text-slate-400">Sync captions from script</strong>.
                    </p>
                  </div>
                ) : undefined
              }
            />
          </EditorCollapsible>

            <EditorCollapsible title="Image editor (layers)">
            <div className="space-y-2">
              <SceneImageEditor
                layers={compositorLayers}
                onLayersChange={patchCompositorLayers}
                sceneId={compositorSceneId ?? content?.scenes[0]?.id ?? null}
                sceneOptions={
                  content?.scenes.map((s) => ({
                    id: s.id,
                    label: sceneDisplayLabel(format, s.id),
                  })) ?? []
                }
                onSceneChange={selectCompositorScene}
                onSaveLayers={saveCompositorLayers}
                onRenderScenes={() => void renderScenes()}
                renderBusy={busy === "render"}
                contentFormat={format}
                templateUnderlaySrc={
                  compositorTemplateUnderlayRel
                    ? fileUrl(compositorTemplateUnderlayRel, previewNonce)
                    : undefined
                }
              />
              {compositorMsg && <p className="text-[10px] text-[#22c55e]">{compositorMsg}</p>}
              {compositorExportLen > 1_200_000 && (
                <p className="text-[10px] text-amber-200/90">
                  Large compositor PNG for this scene — if render fails, reduce layers or complexity.
                </p>
              )}
            </div>
          </EditorCollapsible>

            <EditorCollapsible title="Background video">
            <EditorBackgroundVideoPanel
              contentId={contentId}
              content={content}
              format={format}
              onVideoSaved={(rels) => {
                setBackgroundVideoRel(rels.backgroundVideoRel);
                setBackgroundVideoFrameRel(rels.backgroundVideoFrameRel);
                setContent((c) =>
                  c
                    ? mergeBackdropIntoContent(c, { backgroundVideoRel: rels.backgroundVideoRel })
                    : c,
                );
              }}
              onSaveBackdrop={async () => {
                if (
                  contentId.startsWith("tpl-") &&
                  content?.templateSource &&
                  content.templateSource.format !== "football-lineups"
                ) {
                  await saveUserTemplateToDisk();
                }
                saveTemplateToBrowser();
                setUploadMsg(
                  "Backdrop path saved with your template. It appears under Upload backdrop file and survives refresh.",
                );
              }}
            />
          </EditorCollapsible>

            {(format === "racecard" || format === "f1-grid" || format === "f1-results") && content ? (
              <EditorCollapsible title="Image to video (Runway)">
                <RunwayImageToVideoPanel
                  contentId={contentId}
                  getMotionAiFields={() =>
                    format === "racecard"
                      ? buildRacecardRunwayI2vFields(content)
                      : buildEditorRunwayI2vFields(content, format)
                  }
                  heroImageUrl={racecardI2vHeroUrl}
                  backdropImageLibraryRel={backgroundImageRel?.trim() ? backgroundImageRel : null}
                  onImportedVideo={(rels) => {
                    setBackgroundVideoRel(rels.backgroundVideoRel);
                    setBackgroundVideoFrameRel(rels.backgroundVideoFrameRel);
                    setBackgroundImageRel(null);
                    setContent((c) =>
                      c &&
                      c.templateSource &&
                      (c.templateSource.format === "racecard" ||
                        c.templateSource.format === "f1-grid" ||
                        c.templateSource.format === "f1-results")
                        ? mergeBackdropIntoContent(c, {
                            backgroundVideoRel: rels.backgroundVideoRel,
                            backgroundImageRel: null,
                          })
                        : c,
                    );
                    setPreviewNonce((n) => n + 1);
                  }}
                />
              </EditorCollapsible>
            ) : null}

            {content ? (
              <EditorCollapsible title="Text to image (Runway)">
                <div className="space-y-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Generate a still image with Runway Gen-4 Image and import it directly as your template backdrop.
                  </p>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Prompt
                    <textarea
                      value={t2iPromptText}
                      onChange={(e) => {
                        setT2iPromptText(e.target.value);
                        if (t2iPromptSavedMsg) setT2iPromptSavedMsg(null);
                      }}
                      rows={4}
                      maxLength={T2I_PROMPT_MAX_CHARS}
                      placeholder="Describe the scene, lighting, and visual style."
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Model
                      <select
                        value={t2iModel}
                        onChange={(e) => setT2iModel(e.target.value as "gen4_image_turbo" | "gen4_image")}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="gen4_image_turbo">gen4_image_turbo</option>
                        <option value="gen4_image">gen4_image</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Aspect ratio
                      <select
                        value={t2iRatio}
                        onChange={(e) =>
                          setT2iRatio(e.target.value as "1080:1920" | "720:1280" | "1920:1080" | "1280:720")
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      >
                        <option value="1080:1920">Portrait (9:16) - 1080x1920</option>
                        <option value="720:1280">Portrait (9:16) - 720x1280</option>
                        <option value="1920:1080">Landscape (16:9) - 1920x1080</option>
                        <option value="1280:720">Landscape (16:9) - 1280x720</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={fillT2iPromptFromTemplate}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#eab308]/50"
                    >
                      Fill prompt from template
                    </button>
                    {isHorseRacingFormat(format) ? (
                      <button
                        type="button"
                        onClick={saveHorseT2iPrompt}
                        className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#eab308]/50"
                      >
                        Save prompt
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void startTextToImage()}
                      disabled={t2iBusy || !t2iPromptText.trim()}
                      className="rounded-md border border-[#1f2d26] bg-[#0d1c14] px-3 py-1.5 text-xs font-semibold text-[#22c55e] hover:bg-[#11271c] disabled:opacity-40"
                    >
                      {t2iBusy ? "Starting..." : "Start Text to Image (Runway)"}
                    </button>
                  </div>
                  {isHorseRacingFormat(format) && t2iPromptSavedMsg ? (
                    <p className="text-xs text-[#22c55e]">{t2iPromptSavedMsg}</p>
                  ) : null}
                  {t2iTaskId ? (
                    <div className="space-y-2 rounded-md border border-slate-800 bg-slate-950/60 p-3">
                      <p className="font-mono text-[10px] text-[#eab308]">task {t2iTaskId}</p>
                      <p className="text-[11px] text-slate-400">
                        Status: <strong className="text-slate-200">{t2iTaskJson?.status ?? "..."}</strong>
                        {t2iTaskJson?.status === "RUNNING" && typeof t2iTaskJson.progress === "number" ? (
                          <span className="text-slate-500"> ({Math.round(t2iTaskJson.progress * 100)}%)</span>
                        ) : null}
                      </p>
                      {t2iTaskJson?.status === "FAILED" || t2iTaskJson?.status === "CANCELLED" ? (
                        <p className="text-xs text-red-300">{t2iTaskJson.failure || "Task ended"}</p>
                      ) : null}
                      {t2iTaskJson?.status === "SUCCEEDED" ? (
                        <div className="space-y-2">
                          {t2iPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t2iPreviewUrl}
                              alt="Runway text-to-image result"
                              className="max-h-56 w-full rounded-lg border border-[#1f2d26] bg-black object-contain"
                            />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void importTextToImageBackdrop()}
                            disabled={t2iImportBusy}
                            className="rounded-md border border-[#1f2d26] bg-[#0d1c14] px-3 py-1.5 text-xs font-semibold text-[#22c55e] hover:bg-[#11271c] disabled:opacity-40"
                          >
                            {t2iImportBusy ? "Importing..." : "Import to backdrop (image)"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {t2iError ? <p className="text-xs text-red-400">{t2iError}</p> : null}
                </div>
              </EditorCollapsible>
            ) : null}

            <EditorCollapsible title="Background (before render)">
            <div className="space-y-3">
              <p className="text-[10px] leading-relaxed text-slate-500">
                Stills and motion clips here are <strong className="text-slate-400">backdrops only</strong> (behind slide
                text and graphics). Upload a <strong className="text-slate-400">different image per slide</strong> (saved
                to the currently selected scene), or one <strong className="text-slate-400">motion backdrop</strong> for
                the whole Short — scaled to the <strong className="text-slate-400">full 9×16 frame</strong> in the final
                MP4. When motion is active, it <strong className="text-slate-400">replaces</strong> the global still for
                render. You can also pick files from the{" "}
                <a href="/library" className="text-[#86efac] underline hover:text-[#bbf7d0]">
                  asset library
                </a>
                .
              </p>
              <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#eab308]">
                  Background Image
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Upload a still image for the currently selected scene, or choose a library still (global backdrop).
                </p>
                <label className="mt-2 block text-xs text-slate-500">
                  Image file (PNG, JPG, WebP, GIF)
                  <input
                    ref={bgImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-[#eab308]/50 disabled:opacity-40"
                    disabled={!!busy || backdropLibraryBusy}
                    onClick={() => void openBackdropLibraryPicker("image")}
                  >
                    Browse stills in library
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-slate-600">
                  Image upload target:{" "}
                  <strong className="text-slate-400">
                    {sceneDisplayLabel(format, compositorSceneId ?? content?.scenes?.[0]?.id ?? "intro")}
                  </strong>
                </p>
                {backgroundImageRel ? (
                  <p className="mt-1 font-mono text-[10px] text-[#22c55e]">{backgroundImageRel}</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#eab308]">
                  Upload backdrop file
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Upload one motion backdrop used across the whole Short (MP4/WebM/MOV). Use{" "}
                  <strong className="text-slate-400">Background video</strong> (collapsible above) for Runway-generated
                  clips.
                </p>
                <label className="mt-2 block text-xs text-slate-500">
                  Video file (MP4, WebM, MOV)
                  <input
                    ref={bgVideoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    className="mt-1 block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-[#1f2d26] file:px-2 file:py-1 file:text-slate-200"
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:border-[#eab308]/50 disabled:opacity-40"
                    disabled={!!busy || backdropLibraryBusy}
                    onClick={() => void openBackdropLibraryPicker("video")}
                  >
                    Browse motion in library
                  </button>
                </div>
                {backgroundVideoRel && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Current backdrop video
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-[#22c55e]">{backgroundVideoRel}</p>
                    <video
                      src={fileUrl(backgroundVideoRel, previewNonce)}
                      poster={
                        backgroundVideoFrameRel
                          ? fileUrl(backgroundVideoFrameRel, previewNonce)
                          : fileUrl(inferredBackdropPosterRelFromVideo(backgroundVideoRel), previewNonce)
                      }
                      className="mt-2 max-h-48 w-full rounded-lg border border-[#1f2d26] bg-black object-contain"
                      controls
                      muted
                      playsInline
                      preload="metadata"
                    />
                  </div>
                )}
                {backgroundVideoFrameRel ? (
                  <p className="mt-2 font-mono text-[10px] text-slate-500">
                    Fallback video frame: {backgroundVideoFrameRel}
                  </p>
                ) : null}
                {backgroundVideoRel ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Base darkness (uniform black)
                      </p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Full-screen wash over motion, under the readability gradient. Same as Content preview + server
                        PNGs. <strong className="text-slate-400">Render scenes</strong> after changing.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
                          {Math.round(motionOpaqueK * 100)}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={70}
                          step={5}
                          className="min-w-0 flex-1 accent-[#86efac]"
                          value={Math.round(motionOpaqueK * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            const v = pct / 100;
                            setMotionBackdropOpaqueOpacity(v);
                            setContent((c) =>
                              c && c.templateSource && c.templateSource.format !== "football-lineups"
                                ? mergeBackdropIntoContent(c, { motionBackdropOpaqueOpacity: v })
                                : c,
                            );
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Gradient strength (readability)
                      </p>
                      <p className="text-[10px] leading-snug text-slate-500">
                        Scales the bottom fade and panel ramp only (not the uniform black layer).
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
                          {Math.round(motionDimK * 100)}%
                        </span>
                        <input
                          type="range"
                          min={25}
                          max={160}
                          step={5}
                          className="min-w-0 flex-1 accent-[#86efac]"
                          value={Math.round(motionDimK * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            const v = pct / 100;
                            setMotionBackdropDimStrength(v);
                            setContent((c) =>
                              c && c.templateSource && c.templateSource.format !== "football-lineups"
                                ? mergeBackdropIntoContent(c, { motionBackdropDimStrength: v })
                                : c,
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <R365Button onClick={() => void saveBackgroundUploads()} disabled={!!busy}>
                  Save uploads
                </R365Button>
                <R365Button variant="ghost" onClick={clearBackgroundUploads} disabled={!!busy}>
                  Clear
                </R365Button>
              </div>
              {(backgroundImageRel ||
                Object.keys(backgroundImageRelBySceneId).length > 0 ||
                backgroundVideoFrameRel ||
                backgroundVideoRel) && (
                <p className="mt-2 text-xs text-[#22c55e]">
                  Active:{" "}
                  {backgroundVideoRel && (
                    <span className="font-mono">
                      motion video → {backgroundVideoRel}
                      {backgroundImageRel ? " (image ignored while video is set)" : ""}
                    </span>
                  )}
                  {!backgroundVideoRel && backgroundImageRel && (
                    <span className="font-mono">static image → {backgroundImageRel}</span>
                  )}
                  {!backgroundVideoRel &&
                    Object.entries(backgroundImageRelBySceneId).map(([sid, rel]) => (
                      <span key={sid} className="ml-2 font-mono">
                        {sceneDisplayLabel(format, sid)} → {rel}
                      </span>
                    ))}
                  {!backgroundVideoRel && !backgroundImageRel && backgroundVideoFrameRel && (
                    <span className="font-mono">video frame only → {backgroundVideoFrameRel}</span>
                  )}
                </p>
              )}
              {uploadMsg && <p className="mt-2 text-xs text-slate-400">{uploadMsg}</p>}
              {backgroundVideoRel && (
                <p className="mt-2 text-xs text-amber-200/90">
                  Video background active — Render scenes then Build video so motion appears in the MP4.
                </p>
              )}
            </div>
          </EditorCollapsible>

            <EditorCollapsible title="Scene subtitles & timing">
            <div className="space-y-4">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Subtitles and SRT cues follow <strong className="text-slate-400">scene order</strong> (e.g.{" "}
              {format === "fast-results" ? (
                <>
                  <span className="font-mono text-slate-500">intro</span>,{" "}
                  <span className="text-slate-400">Winner</span>{" "}
                  (<span className="font-mono text-slate-500">winner</span>),{" "}
                  <span className="text-slate-400">Top four</span>{" "}
                  (<span className="font-mono text-slate-500">placings</span>),{" "}
                  <span className="font-mono text-slate-500">outro</span>
                </>
              ) : (
                <>
                  <span className="font-mono text-slate-500">intro</span>, frame(s),{" "}
                  <span className="font-mono text-slate-500">outro</span>
                </>
              )}
              ). Lines are split from the <strong className="text-slate-400">voiceover script</strong> across
              frames; edit lines, then use <strong className="text-slate-400">Adjust timings from lines</strong> to
              reset all durations after text changes. Empty lines at build time fall back to the script chunk for
              that frame.
            </p>
            {content && (
              <div className="min-w-0 overflow-hidden rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3 space-y-3">
                <div className="space-y-1.5 text-xs text-slate-500 sm:text-[11px]">
                  <p className="leading-snug">
                    <strong className="text-slate-400">Overall picture time</strong> (sum of frame durations):{" "}
                    <span className="font-mono text-[#22c55e] tabular-nums">
                      {subtitleTimingTotals.pictureTotalSec.toFixed(1)}s
                    </span>
                  </p>
                  <p className="leading-snug">
                    <strong className="text-slate-400">Overall script</strong> (est. voiceover at{" "}
                    {DEFAULT_VOICEOVER_WPM} wpm, your speed {(content.voiceSpeed ?? 1).toFixed(2)}×):{" "}
                    <span className="font-mono text-[#22d3ee] tabular-nums">
                      {subtitleTimingTotals.scriptEstimateSec.toFixed(1)}s
                    </span>
                  </p>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="min-w-0 flex-1 sm:min-w-[10rem] [&>button]:w-full">
                    <R365Button type="button" onClick={syncSceneSubtitlesFromScript} disabled={!content}>
                      Sync captions from script
                    </R365Button>
                  </div>
                  <div className="min-w-0 flex-1 sm:min-w-[10rem] [&>button]:w-full">
                    <R365Button type="button" onClick={adjustTimingsFromCaptionLines} disabled={!content}>
                      Adjust timings from lines
                    </R365Button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600">
                  <strong className="text-slate-400">Sync</strong> fills captions + durations from the voiceover
                  script. After you edit subtitle text, click <strong className="text-slate-400">Adjust timings from
                  lines</strong> to reset all <strong className="text-slate-400">Dur (s)</strong> by word share (same
                  voice-length target; empty rows use the script slice for that frame). Min 0.2s per frame.
                </p>
              </div>
            )}
            {subtitlesSyncMsg && <p className="text-[10px] text-[#22c55e]">{subtitlesSyncMsg}</p>}
            <p className="text-[10px] text-slate-600">
              <strong className="text-slate-400">Duration</strong> sets how long each PNG shows (seconds).
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {content?.scenes.map((s, i) => (
                <div key={`scene-${s.id}-${i}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="shrink-0 text-[10px] text-[#eab308]" title={s.id}>
                    {sceneDisplayLabel(format, s.id)}
                  </span>
                  <input
                    className="min-w-0 flex-1 rounded border border-[#1f2d26] bg-[#0a0e0c] px-2 py-1 text-xs"
                    value={s.captionLine}
                    onChange={(e) => updateScene(i, { captionLine: e.target.value })}
                    placeholder="Caption / subtitle line"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
                    <span className="whitespace-nowrap">Dur (s)</span>
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      className="w-16 rounded border border-[#1f2d26] bg-[#0a0e0c] px-1 py-1 text-xs text-white"
                      value={s.durationSec}
                      onChange={(e) =>
                        updateScene(i, { durationSec: Math.max(0.2, Number(e.target.value) || 0.2) })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
              />
              Burn subtitles into video (FFmpeg)
            </label>
            {format === "planet-football-table" && burnSubtitles && (
              <p className="text-[11px] leading-snug text-slate-500">
                Brand style: voiceover is split into <strong className="text-slate-400">short sentences</strong> timed to
                the read-out, each with a coloured outline (no background box) at the bottom of the frame — colour matches
                your selected brand (Sport365, Football365, TEAMtalk, or Planet Football).
              </p>
            )}
            {content?.templateSource &&
              content.templateSource.format !== "football-lineups" &&
              !contentId.startsWith("tpl-") && (
                <p className="text-[10px] text-slate-600 pt-2">
                  Create a <strong className="text-slate-400">New template</strong> from the list page to
                  enable saving this layout to disk (tpl-… ids). Use <strong className="text-slate-400">Save template</strong>{" "}
                  under <strong className="text-slate-400">Data feed</strong> when you have a tpl- id.
                </p>
              )}
            <p className="text-xs text-slate-500">
              Template set: {BRAND_SHORTS} ({format}). Social static cards use 1080×1350 via same
              renderer with <code className="text-slate-400">social-*</code> templates.
            </p>
            <div className="mt-6 border-t border-[#1f2d26] pt-6">
              <CreativeVideoGeneratorContent
                variant={format === "planet-football-table" ? "world-cup-football" : "default"}
              />
            </div>
            </div>
          </EditorCollapsible>

            <EditorCollapsible title="Data feed">
          <p className="text-sm text-slate-400">{feedLine}</p>
          {content && (
            <div className="mt-3 flex flex-wrap gap-2">
              <R365Button type="button" variant="ghost" onClick={downloadDataFeedCsv} disabled={!!busy}>
                Download CSV
              </R365Button>
              <R365Button
                type="button"
                variant="ghost"
                onClick={() => dataFeedCsvInputRef.current?.click()}
                disabled={!!busy}
              >
                Import CSV
              </R365Button>
              <input
                ref={dataFeedCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onDataFeedCsvSelected}
              />
              <R365Button type="button" variant="ghost" onClick={downloadDataFeedJson} disabled={!!busy}>
                Download JSON
              </R365Button>
              <R365Button
                type="button"
                variant="ghost"
                onClick={() => dataFeedJsonInputRef.current?.click()}
                disabled={!!busy}
              >
                Import JSON
              </R365Button>
              <input
                ref={dataFeedJsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onDataFeedJsonSelected}
              />
            </div>
          )}
          <p className="mt-3 text-[11px] leading-snug text-slate-500">
            API-shaped feed: <code className="text-slate-500">GET /api/racing-data-feed-template?format=racecard</code>{" "}
            (or <code className="text-slate-500">fast-results</code>, <code className="text-slate-500">next-off</code>) returns an
            empty template; paste or save that JSON and use <strong className="text-slate-400">Import JSON</strong> here.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            <strong className="text-slate-400">Regenerate</strong> pulls the seed JSON again. Template fields
            below are editable for this session — use them as your layout template, then{" "}
            <strong className="text-[#eab308]">Render scenes</strong>.
          </p>
          {format === "football-lineups" && (
            <p className="mt-3 text-xs text-slate-500">
              Football: all pitch, bench, injury, and kit data is in{" "}
              <strong className="text-slate-400">Edit controls</strong>.
            </p>
          )}
            </EditorCollapsible>

            {content?.templateSource && (
            <EditorCollapsible
              title={contentId.startsWith("tpl-") ? "Save template" : "Template draft (browser)"}
            >
            <p className="text-xs text-slate-500">
              {contentId.startsWith("tpl-") ? (
                <>
                  <strong className="text-slate-400">Save template</strong> writes the current layout, copy, voice,
                  backgrounds, and scene timings to <code className="text-slate-500">data/local/user-templates.json</code>{" "}
                  (gitignored).
                </>
              ) : (
                <>
                  Save silks, placings, and race fields to this device. Restore after refresh without losing edits.
                  Create a <strong className="text-slate-400">New template</strong> to get a{" "}
                  <code className="text-slate-500">tpl-…</code> id and persist to disk.
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <R365Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (contentId.startsWith("tpl-")) void saveUserTemplateToDisk();
                  else saveTemplateToBrowser();
                }}
                disabled={!!busy}
              >
                {busy === "save-template"
                  ? "Saving…"
                  : contentId.startsWith("tpl-")
                    ? "Save template"
                    : "Save draft (browser)"}
              </R365Button>
              <R365Button type="button" variant="ghost" onClick={restoreTemplateFromBrowser} disabled={!!busy}>
                Restore saved
              </R365Button>
            </div>
            {browserTemplateMsg && <p className="mt-2 text-xs text-[#22c55e]">{browserTemplateMsg}</p>}
            {templateDiskMsg && contentId.startsWith("tpl-") && (
              <p className="mt-2 text-xs text-[#22c55e]">{templateDiskMsg}</p>
            )}
            </EditorCollapsible>
            )}

          </div>

        {busy && (
          <p className="text-sm text-[#eab308]">
            Working: {busy}
            {busy === "video" && videoBuildStatus
              ? ` (${videoBuildStatus === "voice"
                  ? "generating voiceover"
                  : videoBuildStatus === "encoding"
                    ? "encoding video — live builds can take several minutes"
                    : videoBuildStatus === "saving"
                      ? "saving video for preview"
                      : videoBuildStatus === "starting"
                        ? "starting build worker"
                        : videoBuildStatus})`
              : ""}
            …
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="min-w-0 lg:col-span-4">
        <Panel title="Content preview">
          {pngsStale && (
            <p className="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
              Template data changed (layout, logos, table style, silks, etc.). PNGs below are out of date — click{" "}
              <strong className="text-[#eab308]">Render scenes</strong> to refresh.
            </p>
          )}
          {content?.format === "fast-results" && (() => {
            const ws = content.scenes.find((s) => s.id === "winner")?.data?.winnerSilks as
              | RunnerSilks
              | undefined;
            const bits: string[] = [];
            if (ws?.silkCode) bits.push(`code ${ws.silkCode}`);
            if (ws?.imageUrl) bits.push("custom image URL");
            if (bits.length === 0 && ws?.body) bits.push("procedural colours");
            return bits.length > 0 ? (
              <p className="mb-2 text-[11px] font-mono text-slate-500">
                Live winner silk: {bits.join(" · ")}
              </p>
            ) : null;
          })()}
          {planetRugbyActiveControlsSummary ? (
            <p className="mb-2 rounded border border-[#1f2d26] bg-[#0a0e0c] px-2 py-1 text-[11px] text-slate-400">
              Active controls: {planetRugbyActiveControlsSummary}
            </p>
          ) : null}
          {planetRugbyLivePreviewHtml && (!previewRel || pngsStale) ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#22c55e]">
                Live table preview — updates before render
              </p>
              <div
                className={`flex ${livePreviewFrameClass} items-center justify-center overflow-hidden rounded-md border border-[#22c55e]/35 bg-black`}
              >
                <iframe
                  title="Live Planet Rugby table preview"
                  srcDoc={planetRugbyLivePreviewHtml}
                  className="origin-center border-0 bg-black"
                  style={{
                    width: `${livePreviewDims.width}px`,
                    height: `${livePreviewDims.height}px`,
                    transform: `scale(${livePreviewScaleValue})`,
                    flex: "0 0 auto",
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          ) : previewRel ? (
            <div
              className={`flex ${previewFrameClass} items-center justify-center overflow-hidden rounded-md border border-[#1f2d26] bg-black`}
            >
              {backgroundVideoRel && backgroundVideoFrameRel ? (
                <div className="relative h-full w-full">
                  <Image
                    src={fileUrl(backgroundVideoFrameRel, previewNonce)}
                    alt=""
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                  <Image
                    src={fileUrl(previewRel, previewNonce)}
                    alt="Scene preview"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-contain"
                  />
                </div>
              ) : (
              <Image
                src={fileUrl(previewRel, previewNonce)}
                alt="Scene preview"
                width={1080}
                height={1920}
                unoptimized
                className="h-full w-full object-contain"
              />
              )}
            </div>
          ) : (
            <div
              className={`flex ${previewFrameClass} items-center justify-center rounded-lg border border-dashed border-[#1f2d26] bg-[#0a0e0c] text-center text-sm text-slate-500 px-3`}
            >
              {pngsStale
                ? "Click Render scenes for fresh PNGs"
                : previewSceneId && images.length > 0
                  ? "No PNG for this scene yet — Render scenes to refresh."
                  : "Placeholder — Render scenes to preview PNGs (1080×1920)"}
            </div>
          )}
          {previewRel || planetRugbyLivePreviewHtml ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Save format
                <select
                  className="ml-2 rounded-md border border-[#1f2d26] bg-[#0a0e0c] px-2 py-1 text-xs font-semibold text-slate-200"
                  value={previewImageFormat}
                  onChange={(e) => setPreviewImageFormat(e.target.value as PreviewImageFormat)}
                  disabled={previewSaveBusy || previewLibraryBusy}
                >
                  <option value="png">PNG (best quality)</option>
                  <option value="jpg">JPG (smaller file)</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void downloadPreviewImage()}
                disabled={previewSaveBusy || previewLibraryBusy}
                className="rounded-md border border-[#22c55e]/40 bg-[#0d1c14] px-3 py-1.5 text-xs font-semibold text-[#22c55e] hover:bg-[#11271c] disabled:opacity-40"
              >
                {previewSaveBusy
                  ? "Saving..."
                  : previewRel
                    ? "Save preview image"
                    : "Save live preview image"}
              </button>
              <button
                type="button"
                onClick={() => void savePreviewImageToLibrary()}
                disabled={previewSaveBusy || previewLibraryBusy}
                className="rounded-md border border-[#eab308]/40 bg-[#1f1807] px-3 py-1.5 text-xs font-semibold text-[#eab308] hover:bg-[#2a210a] disabled:opacity-40"
              >
                {previewLibraryBusy ? "Saving..." : "Save to Library"}
              </button>
            </div>
          ) : null}
          {previewSaveMsg ? <p className="mt-2 text-center text-xs text-[#22c55e]">{previewSaveMsg}</p> : null}
          {(content?.scenes.length ?? 0) > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {content?.scenes.map((scene, idx) => (
                <button
                  key={`${scene.id || "scene"}-${idx}`}
                  type="button"
                  onClick={() => {
                    setPreviewSceneId(scene.id);
                    setCompositorSceneId(scene.id);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-mono transition ${
                    (previewSceneId ?? images[0]?.sceneId ?? editorLivePreviewScene?.id) === scene.id
                      ? "bg-[#eab308] text-black"
                      : "border border-[#1f2d26] bg-[#0a0e0c] text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {sceneDisplayLabel(format, scene.id)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1 text-sm text-slate-300">
            {content?.scenes.map((s, i) => (
              <button
                key={`${s.id}-${i}`}
                type="button"
                onClick={() => {
                  setPreviewSceneId(s.id);
                  setCompositorSceneId(s.id);
                }}
                className="flex justify-between gap-2 rounded-md border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2"
              >
                <span className="text-xs text-[#eab308]" title={s.id}>
                  {sceneDisplayLabel(format, s.id)}
                </span>
                <span className="min-w-0 flex-1 text-right text-slate-400 line-clamp-2">{s.captionLine}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Caption</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{content?.caption}</p>
          </div>
        </Panel>
        </div>

        <div className="min-w-0 lg:col-span-4 space-y-4">
          <Panel title="Video">
            {videoRel ? (
              <video
                key={`${videoRel}-${videoPreviewNonce}`}
                src={fileUrl(videoRel, videoPreviewNonce)}
                controls
                playsInline
                title={content?.headline ?? `${BRAND_SHORT_SINGULAR} preview`}
                className={`${previewFrameClass} object-contain bg-black rounded-md border border-[#1f2d26]`}
                onError={() => {
                  setError(
                    "Video preview could not load. If the build just finished, wait a few seconds and refresh — otherwise run Build video again after the latest deploy.",
                  );
                }}
              />
            ) : (
              <div
                className={`flex ${previewFrameClass} items-center justify-center rounded-lg border border-dashed border-[#1f2d26] bg-[#0a0e0c] text-center text-sm text-slate-500 px-3`}
              >
                Placeholder — Build video to preview MP4 here.
              </div>
            )}
            {videoRel && (
              <div className="mt-4 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Video editor
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Trim the clip shown above. Output is saved as{" "}
                  <code className="text-slate-500">{contentId}-short-edited.mp4</code>. Your original{" "}
                  <code className="text-slate-500">-short.mp4</code> is kept. The library shows the edited
                  version when it exists.
                </p>
                {videoDurationSec != null && (
                  <p className="text-xs text-slate-500">
                    Current file duration: {videoDurationSec.toFixed(2)}s
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Trim from start (s)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-black px-3 py-2 text-sm text-white"
                      value={trimStartInput}
                      onChange={(e) => setTrimStartInput(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Trim from end (s)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="mt-1 w-full rounded-lg border border-[#1f2d26] bg-black px-3 py-2 text-sm text-white"
                      value={trimEndInput}
                      onChange={(e) => setTrimEndInput(e.target.value)}
                    />
                  </label>
                </div>
                <R365Button
                  type="button"
                  onClick={() => void applyVideoTrim()}
                  disabled={!!busy}
                >
                  {busy === "edit-video" ? "Saving…" : "Apply trim & save edited clip"}
                </R365Button>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {videoRel === originalVideoRel && editedCutOnDisk && (
                    <button
                      type="button"
                      className="text-[#22c55e] hover:underline"
                      onClick={() => {
                        setVideoRel(editedVideoRel);
                        setTrimStartInput("0");
                        setTrimEndInput("0");
                      }}
                    >
                      Preview edited cut
                    </button>
                  )}
                  {videoRel === editedVideoRel && (
                    <button
                      type="button"
                      className="text-[#22c55e] hover:underline"
                      onClick={() => {
                        setVideoRel(originalVideoRel);
                        setTrimStartInput("0");
                        setTrimEndInput("0");
                      }}
                    >
                      Preview original build
                    </button>
                  )}
                </div>
                {editVideoMsg && <p className="text-xs text-[#22c55e]">{editVideoMsg}</p>}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>

    {backdropLibraryKind ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-backdrop-library-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeBackdropLibraryPicker();
        }}
      >
        <div
          className="flex max-h-[min(92vh,940px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-primary)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
            <h2
              id="editor-backdrop-library-title"
              className="text-sm font-black uppercase tracking-wide text-[color:var(--text-primary)]"
            >
              Browse library
            </h2>
            <button
              type="button"
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              onClick={closeBackdropLibraryPicker}
            >
              Close
            </button>
          </div>
          <div className="flex shrink-0 gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                backdropLibraryKind === "image"
                  ? "bg-[color:var(--accent-soft)] text-[color:var(--primary)] ring-1 ring-[color:var(--accent)]/40"
                  : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              }`}
              onClick={() => setBackdropLibraryKind("image")}
            >
              Stills ({backdropLibraryData?.images.length ?? 0})
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                backdropLibraryKind === "video"
                  ? "bg-[color:var(--accent-soft)] text-[color:var(--primary)] ring-1 ring-[color:var(--accent)]/40"
                  : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              }`}
              onClick={() => setBackdropLibraryKind("video")}
            >
              Motion ({backdropLibraryData?.videos.length ?? 0})
            </button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2">
            <select
              value={librarySportFilter}
              onChange={(e) => setLibrarySportFilter(e.target.value)}
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-primary)]"
            >
              {librarySportOptions.map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={libraryBrowseQuery}
              onChange={(e) => setLibraryBrowseQuery(e.target.value)}
              placeholder="Filter by path…"
              className="min-w-[12rem] flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
            />
            <span className="text-xs text-[color:var(--text-muted)]">
              {backdropLibraryKind === "image"
                ? `${libraryImagesFiltered.length} shown`
                : `${libraryVideosFiltered.length} shown`}
            </span>
            <a
              href={
                backdropLibraryKind === "image" ? "/library?tab=libraryImages" : "/library?tab=backgroundVideo"
              }
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-semibold text-[color:var(--accent)] underline hover:text-[color:var(--accent-hover)]"
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
                        src={`/api/file?rel=${encodeURIComponent(rel)}`}
                        alt=""
                        className="mx-auto aspect-[9/16] w-full max-h-64 rounded-md bg-black object-cover"
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
                  <a href="/library?tab=libraryImages" className="text-[#86efac] underline" target="_blank" rel="noreferrer">
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
                    className="flex flex-col rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2 shadow-inner"
                  >
                    <video
                      src={`/api/file?rel=${encodeURIComponent(rel)}`}
                      poster={`/api/file?rel=${encodeURIComponent(inferredBackdropPosterRelFromVideo(rel))}`}
                      muted
                      playsInline
                      controls
                      preload="metadata"
                      className="mx-auto aspect-[9/16] w-full max-h-72 rounded-md bg-black object-contain"
                    />
                      <p className="mt-2 line-clamp-3 break-all font-mono text-[9px] leading-tight text-[color:var(--text-muted)]">
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
                  href="/library?tab=backgroundVideo"
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
