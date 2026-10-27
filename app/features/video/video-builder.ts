import fs from "fs/promises";
import path from "path";
import {
  outputSubtitlesDir,
  outputVideoDir,
  outputDir,
  assetsManifestPath,
  projectRoot,
} from "@/app/lib/paths";
import { ffmpegBinary, probeHasAudioStream, probeMediaDurationSec, ffmpegMp4VideoEncodeArgs, runFfmpeg } from "./ffmpeg-utils";
import { buildNewsShortAss, type NewsShortAssStyle } from "@/app/features/content/news-short-ass";
import { buildSrt, type SubtitleCue } from "@/app/features/content/subtitle-generator";
import {
  buildLeagueTableAss,
  buildSport365Ass,
  buildSport365SentenceCues,
  SPORT365_SUBTITLE_PINK,
} from "@/app/lib/sport365-subtitle-burn";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { assertAudioAssetRel, assertCrossContentBackdropRel } from "@/app/lib/editor-upload";
import { readLibraryBlobAsset } from "@/app/lib/library-blob-assets";
import { materializeVideoAssetToDisk } from "@/app/lib/video-blob-assets";
import { BRAND_ENCODER, BRAND_MARK } from "@/app/lib/brand";
import { upsertLibraryMetadata } from "@/app/lib/library-metadata";
import type { BackingMusicConfig, VideoRecordCirclePosition, VideoRecordLayout } from "@/app/features/news-shorts/types";
import { motionBackdropRelLooksLikeCameraRecording } from "@/app/lib/news-shorts-build-sources";
import { bundledNewsShortFontsDirExists, subtitlesFilterWithOptionalFontsdir } from "@/app/lib/news-short-fonts-server";

export interface SceneClip {
  imagePath: string;
  durationSec: number;
  caption: string;
  /** News Shorts styled ASS (headline line). */
  subtitleHeadline?: string;
  subtitleSubline?: string;
  highlightWords?: string[];
}

export type NewsShortOutputDimensions = { width: number; height: number };

export interface BuildShortInput {
  contentId: string;
  format: string;
  scenes: SceneClip[];
  /**
   * Slide / motion composite size (default 1080×1920). Use 1920×1080 for Creative Studio landscape.
   */
  outputWidth?: number;
  outputHeight?: number;
  /** Voice/TTS file — omit when `useVideoAudio` is true with a backdrop video. */
  audioPath?: string;
  burnSubtitles?: boolean;
  /** Accent colour for planet-football-table ASS subtitle outline (hex). */
  subtitleAccentColor?: string;
  /** Shown in library, FFmpeg metadata, and download naming context */
  seoTitle: string;
  /** Filename stem (ASCII slug, no `-short` suffix) */
  seoSlug: string;
  /** Optional exact MP4 name for downloads (from SEO `file_name`); manifest + Content-Disposition */
  seoDownloadFile?: string;
  /** Motion background under transparent scene PNGs (output/uploads/...) */
  backgroundVideoRel?: string;
  /**
   * When set with a non–camera-record `backgroundVideoRel`, composites this camera clip as a circular PiP on top of
   * the full-frame backdrop video (Runway/upload). Omit for single-stream motion (camera-only or backdrop-only).
   */
  cameraOverlayRel?: string;
  /**
   * Still image (uploads/… or images/library/…) used as the full-frame backdrop for **Face in circle** layout
   * with a **camera-record** motion clip only in the circular PiP. Ignored when the motion clip is not a camera
   * recording (Runway/upload video replaces the still for the backdrop) and ignored for full/half layouts.
   */
  backgroundImageRel?: string;
  /**
   * How a **camera-record** single-stream backdrop is composed before slide PNGs are overlaid (`half` / `full` /
   * `circle`). Runway/upload clips from Background (before render) always use **full** frame in FFmpeg regardless of
   * this value.
   */
  videoRecordLayout?: VideoRecordLayout;
  /** Circular PiP placement for **Face in circle** and dual Runway + camera builds. */
  videoRecordCirclePosition?: VideoRecordCirclePosition;
  /**
   * When true with a backdrop video, mux that file’s audio instead of `audioPath` (TTS / voice recording).
   */
  useVideoAudio?: boolean;
  /** Optional backing music bed mixed underneath primary soundtrack. */
  backingMusic?: BackingMusicConfig;
  /** Search keywords for library filtering. */
  searchKeywords?: string[];
  /**
   * When true with `format: "news-shorts"`, burn ASS subtitles that mimic slide styling instead of plain SRT.
   * Slide PNGs should omit headline/subline (`editorSubtitleOverlayOnly` at render time).
   */
  styledSubtitleBurn?: boolean;
  /** Required when `styledSubtitleBurn` — from template style controls. */
  subtitleStyle?: NewsShortAssStyle;
  /** Build intent used by hub filters (does not change render logic directly). */
  buildMode?: "shorts" | "portrait" | "landscape";
  /** Voiceover script — used for Sport365 sentence-by-sentence subtitle burn on football tables. */
  script?: string;
}

function normalizeVideoRecordLayout(raw: VideoRecordLayout | string | undefined | null): VideoRecordLayout {
  if (raw === "half" || raw === "circle" || raw === "full") return raw;
  if (typeof raw === "string") {
    const v = raw.toLowerCase();
    if (v === "half" || v === "circle") return v;
  }
  return "full";
}

function clampNewsShortOutputDims(ow?: number, oh?: number): { ow: number; oh: number } {
  const w = ow && Number.isFinite(ow) ? Math.round(ow) : 1080;
  const h = oh && Number.isFinite(oh) ? Math.round(oh) : 1920;
  return {
    ow: Math.min(3840, Math.max(480, w)),
    oh: Math.min(3840, Math.max(480, h)),
  };
}

function normalizeVideoRecordCirclePosition(
  raw: VideoRecordCirclePosition | string | undefined | null,
): VideoRecordCirclePosition {
  if (raw === "middle-right" || raw === "top-right" || raw === "bottom-right" || raw === "top-left") return raw;
  if (typeof raw === "string") {
    const v = raw.toLowerCase();
    if (v === "middle-right" || v === "top-right" || v === "bottom-right" || v === "top-left") return v as VideoRecordCirclePosition;
  }
  return "middle-right";
}

/** FFmpeg `overlay=` x:y using main `W,H` and overlay `w,h` constants. */
function circlePipOverlayCoords(pos: VideoRecordCirclePosition): string {
  switch (pos) {
    case "top-right":
      return "W-w-48:48";
    case "bottom-right":
      return "W-w-48:H-h-48";
    case "top-left":
      return "48:48";
    default:
      return "W-w-60:(H-h)/2";
  }
}

/** Background stream [bg] from input index `bgIdx`, trimmed to `targetStr` seconds. */
function buildBackgroundVideoFilterChain(
  bgIdx: number,
  targetStr: string,
  layout: VideoRecordLayout,
  circlePos: VideoRecordCirclePosition,
  ow: number,
  oh: number,
): string {
  const t = targetStr;
  const xy = circlePipOverlayCoords(circlePos);
  const halfH = Math.round(oh / 2);
  const pip = Math.max(280, Math.min(720, Math.round((Math.min(ow, oh) * 560) / 1920)));
  const pipC = Math.max(120, Math.round((pip * 280) / 560));
  const pipRsq = Math.round((pip * 260) / 560) ** 2;
  if (layout === "full") {
    return `[${bgIdx}:v]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setpts=PTS-STARTPTS[bgwork];[bgwork]trim=duration=${t},setpts=PTS-STARTPTS[bgtrim];[bgtrim]format=yuv420p[bg]`;
  }
  if (layout === "half") {
    return `[${bgIdx}:v]fps=30,setpts=PTS-STARTPTS[bg0];[bg0]scale=${ow}:${halfH}:force_original_aspect_ratio=decrease,pad=${ow}:${halfH}:(ow-iw)/2:(oh-ih)/2:color=black[top];[top]pad=${ow}:${oh}:0:0:color=black[bgwork];[bgwork]trim=duration=${t},setpts=PTS-STARTPTS[bgtrim];[bgtrim]format=yuv420p[bg]`;
  }
  /* circle: full-frame camera + circular PiP — dim base layer slightly for slide readability */
  return `[${bgIdx}:v]fps=30,setpts=PTS-STARTPTS[bg_src];[bg_src]split=2[sp_a][sp_b];[sp_a]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,trim=duration=${t},setpts=PTS-STARTPTS[bgfull];[bgfull]eq=brightness=-0.085:saturation=0.94[bgfull_d];[sp_b]scale=${pip}:${pip}:force_original_aspect_ratio=decrease,pad=${pip}:${pip}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,trim=duration=${t},setpts=PTS-STARTPTS[bgsqtrim];[bgsqtrim]format=rgba,geq=r='p(X,Y)':g='p(X,Y)':b='p(X,Y)':a='if(lte((X-${pipC})*(X-${pipC})+(Y-${pipC})*(Y-${pipC}),${pipRsq}),255,0)'[circ];[bgfull_d][circ]overlay=${xy}:format=auto:shortest=0[bgmix];[bgmix]format=yuv420p[bg]`;
}

/** Half layout: camera top 960px + optional still bottom 960px (under slide graphics). */
function buildHalfBackgroundCameraPlusBottomStillChain(
  cameraIdx: number,
  stillIdx: number,
  targetStr: string,
  ow: number,
  oh: number,
): string {
  const t = targetStr;
  const halfH = Math.round(oh / 2);
  return `[${cameraIdx}:v]fps=30,setpts=PTS-STARTPTS[bg0];[bg0]scale=${ow}:${halfH}:force_original_aspect_ratio=decrease,pad=${ow}:${halfH}:(ow-iw)/2:(oh-ih)/2:color=black[top];[${stillIdx}:v]fps=30,setpts=PTS-STARTPTS[img0];[img0]scale=${ow}:${halfH}:force_original_aspect_ratio=increase,crop=${ow}:${halfH},format=yuv420p[bot];[top][bot]vstack=inputs=2[bgwork];[bgwork]trim=duration=${t},setpts=PTS-STARTPTS[bgtrim];[bgtrim]format=yuv420p[bg]`;
}

/** Circle layout: full-frame still image + camera only in the circular mask. */
function buildCircleBackgroundWithImageChain(
  cameraVideoIdx: number,
  stillImageIdx: number,
  targetStr: string,
  circlePos: VideoRecordCirclePosition,
  ow: number,
  oh: number,
): string {
  const t = targetStr;
  const xy = circlePipOverlayCoords(circlePos);
  const pip = Math.max(280, Math.min(720, Math.round((Math.min(ow, oh) * 560) / 1920)));
  const pipC = Math.max(120, Math.round((pip * 280) / 560));
  const pipRsq = Math.round((pip * 260) / 560) ** 2;
  return `[${stillImageIdx}:v]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,trim=duration=${t},setpts=PTS-STARTPTS[bgfull];[bgfull]eq=brightness=-0.075:saturation=0.96[bgfull_d];[${cameraVideoIdx}:v]fps=30,setpts=PTS-STARTPTS[bg_src];[bg_src]scale=${pip}:${pip}:force_original_aspect_ratio=decrease,pad=${pip}:${pip}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,trim=duration=${t},setpts=PTS-STARTPTS[bgsqtrim];[bgsqtrim]format=rgba,geq=r='p(X,Y)':g='p(X,Y)':b='p(X,Y)':a='if(lte((X-${pipC})*(X-${pipC})+(Y-${pipC})*(Y-${pipC}),${pipRsq}),255,0)'[circ];[bgfull_d][circ]overlay=${xy}:format=auto:shortest=0[bgmix];[bgmix]format=yuv420p[bg]`;
}

/** Full-frame 1080×1920 backdrop from a video input (Runway / upload behind PiP + slides). */
function buildBackdropVideoFullFrameChain(
  backdropIdx: number,
  targetStr: string,
  ow: number,
  oh: number,
): string {
  const t = targetStr;
  return `[${backdropIdx}:v]scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setpts=PTS-STARTPTS[bd_in];[bd_in]trim=duration=${t},setpts=PTS-STARTPTS[bgfull]`;
}

/** Circular PiP from a camera video (middle-right), same geometry as single-stream circle layout. */
function buildCameraCirclePipChain(cameraIdx: number, targetStr: string, ow: number, oh: number): string {
  const t = targetStr;
  const pip = Math.max(280, Math.min(720, Math.round((Math.min(ow, oh) * 560) / 1920)));
  const pipC = Math.max(120, Math.round((pip * 280) / 560));
  const pipRsq = Math.round((pip * 260) / 560) ** 2;
  return `[${cameraIdx}:v]fps=30,setpts=PTS-STARTPTS[cam_src];[cam_src]scale=${pip}:${pip}:force_original_aspect_ratio=decrease,pad=${pip}:${pip}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,trim=duration=${t},setpts=PTS-STARTPTS[cam_sq];[cam_sq]format=rgba,geq=r='p(X,Y)':g='p(X,Y)':b='p(X,Y)':a='if(lte((X-${pipC})*(X-${pipC})+(Y-${pipC})*(Y-${pipC}),${pipRsq}),255,0)'[circpip]`;
}

/** Backdrop video fills the frame; camera is a round PiP — then slide PNGs overlay full frame. */
function buildDualBackdropAndCameraPipChain(
  backdropIdx: number,
  cameraIdx: number,
  targetStr: string,
  circlePos: VideoRecordCirclePosition,
  ow: number,
  oh: number,
): string {
  const a = buildBackdropVideoFullFrameChain(backdropIdx, targetStr, ow, oh);
  const b = buildCameraCirclePipChain(cameraIdx, targetStr, ow, oh);
  const xy = circlePipOverlayCoords(circlePos);
  return `${a};${b};[bgfull][circpip]overlay=${xy}:format=auto:shortest=0[bgmix];[bgmix]format=yuv420p[bg]`;
}

/** Optional concat demuxer list for debugging / manual FFmpeg runs */
async function writeConcatFile(scenes: SceneClip[], concatPath: string) {
  const root = projectRoot();
  const relFile = (p: string) => {
    const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
    return path.relative(root, abs).split(path.sep).join("/");
  };
  const lines: string[] = [];
  for (const s of scenes) {
    const rf = relFile(s.imagePath);
    lines.push(`file '${rf.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${s.durationSec}`);
  }
  const last = scenes[scenes.length - 1];
  if (last) {
    lines.push(`file '${relFile(last.imagePath).replace(/'/g, "'\\''")}'`);
  }
  await fs.writeFile(concatPath, lines.join("\n"), "utf-8");
}

function buildImageChain(
  scenes: SceneClip[],
  ow: number,
  oh: number,
): {
  args: string[];
  filterComplex: string;
  audioInputIndex: number;
} {
  const root = projectRoot();
  const args: string[] = ["-y"];
  for (const s of scenes) {
    const img = path.isAbsolute(s.imagePath) ? s.imagePath : path.resolve(root, s.imagePath);
    args.push("-loop", "1", "-t", String(s.durationSec), "-i", img);
  }

  const vf = `fps=30,format=yuv420p,scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS`;
  const chains = scenes.map((_, i) => `[${i}:v]${vf}[v${i}]`).join(";");
  const concatInputs = scenes.map((_, i) => `[v${i}]`).join("");
  const n = scenes.length;
  const filterComplex = `${chains};${concatInputs}concat=n=${n}:v=1:a=0[vcat]`;
  const audioInputIndex = n;
  return { args, filterComplex, audioInputIndex };
}

async function materializeRelativeSceneImage(rel: string, contentId: string, index: number): Promise<string | null> {
  const normalized = rel.split(path.sep).join("/").replace(/^\/+/, "");
  const blob = await readLibraryBlobAsset(normalized);
  if (blob) {
    const ext = path.extname(normalized) || ".png";
    const out = path.join(outputDir(), "images", contentId, `build-scene-${index}${ext}`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, blob.bytes);
    return out;
  }
  const underOutput = path.join(outputDir(), ...normalized.split("/"));
  try {
    await fs.access(underOutput);
    return underOutput;
  } catch {
    return null;
  }
}

async function materializeSceneImagePath(imagePath: string, contentId: string, index: number): Promise<string> {
  if (path.isAbsolute(imagePath)) {
    try {
      await fs.access(imagePath);
      return imagePath;
    } catch {
      const norm = imagePath.replace(/\\/g, "/");
      const libraryAt = norm.indexOf("images/library/");
      if (libraryAt >= 0) {
        const fromLibrary = await materializeRelativeSceneImage(norm.slice(libraryAt), contentId, index);
        if (fromLibrary) return fromLibrary;
      }
      throw new Error(
        `Scene image missing on this server (${path.basename(imagePath)}). Render scenes again, then build the video.`,
      );
    }
  }
  const fromRel = await materializeRelativeSceneImage(imagePath, contentId, index);
  if (fromRel) return fromRel;
  return path.resolve(projectRoot(), imagePath);
}

async function resolveVideoAssetAbs(rel: string): Promise<string> {
  const normalized = rel.split(path.sep).join("/").replace(/^\/+/, "");
  const abs = path.normalize(path.join(outputDir(), ...normalized.split("/")));
  try {
    await fs.access(abs);
    return abs;
  } catch {
    const materialized = await materializeVideoAssetToDisk(normalized);
    if (materialized) return materialized;
    throw new Error(`Video asset missing: ${normalized}`);
  }
}

/** RGBA foreground for overlay on motion background */
function buildForegroundRgbaChain(
  scenes: SceneClip[],
  ow: number,
  oh: number,
): {
  args: string[];
  filterComplex: string;
  n: number;
} {
  const root = projectRoot();
  const args: string[] = ["-y"];
  for (const s of scenes) {
    const img = path.isAbsolute(s.imagePath) ? s.imagePath : path.resolve(root, s.imagePath);
    args.push("-loop", "1", "-t", String(s.durationSec), "-i", img);
  }
  const vf = `format=rgba,scale=${ow}:${oh}:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=30,setpts=PTS-STARTPTS`;
  const chains = scenes.map((_, i) => `[${i}:v]${vf}[vv${i}]`).join(";");
  const concatInputs = scenes.map((_, i) => `[vv${i}]`).join("");
  const n = scenes.length;
  const filterComplex = `${chains};${concatInputs}concat=n=${n}:v=1:a=0[vcatraw];[vcatraw]format=rgba,setsar=1[vcat]`;
  return { args, filterComplex, n };
}

function resolveBackingMusic(input: BackingMusicConfig | undefined): {
  abs: string;
  volume: number;
  ducking: boolean;
  duckStrength: number;
  duckAttackMs: number;
  duckReleaseMs: number;
  duckUnderNarration: boolean;
  duckUnderClipAudio: boolean;
  loop: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  trimStartSec: number;
  trimEndSec?: number;
  offsetSec: number;
} | null {
  if (!input?.enabled || !input.assetRel?.trim()) return null;
  const rel = assertAudioAssetRel(input.assetRel.trim());
  const abs = path.normalize(path.join(outputDir(), ...rel.split("/")));
  const clamp = (v: number, lo: number, hi: number, dflt: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  const volume = clamp(Number(input.volume), 0, 1, 0.18);
  const duckStrength = clamp(Number(input.duckStrength), 0, 1, 0.55);
  const fadeInSec = clamp(Number(input.fadeInMs) / 1000, 0, 10, 0.3);
  const fadeOutSec = clamp(Number(input.fadeOutMs) / 1000, 0, 10, 0.8);
  const trimStartSec = clamp(Number(input.trimStartMs) / 1000, 0, 1200, 0);
  const trimEndSecRaw = Number(input.trimEndMs);
  const trimEndSec =
    Number.isFinite(trimEndSecRaw) && trimEndSecRaw > Number(input.trimStartMs)
      ? clamp(trimEndSecRaw / 1000, trimStartSec + 0.001, 1200, trimStartSec + 0.001)
      : undefined;
  const offsetSec = clamp(Number(input.offsetMs) / 1000, 0, 120, 0);

  return {
    abs,
    volume,
    ducking: input.ducking !== false,
    duckStrength,
    duckAttackMs: Math.round(clamp(Number(input.duckAttackMs), 10, 2000, 80)),
    duckReleaseMs: Math.round(clamp(Number(input.duckReleaseMs), 40, 4000, 350)),
    duckUnderNarration: input.duckUnderNarration !== false,
    duckUnderClipAudio: input.duckUnderClipAudio !== false,
    loop: input.loop !== false,
    fadeInSec,
    fadeOutSec,
    trimStartSec,
    trimEndSec,
    offsetSec,
  };
}

function buildPrimaryPlusMusicAudioChain(params: {
  primaryIdx: number;
  musicIdx?: number;
  targetDur: number;
  audioTakeStr: string;
  primaryIsClipAudio: boolean;
  music: ReturnType<typeof resolveBackingMusic>;
}): string {
  const { primaryIdx, musicIdx, targetDur, audioTakeStr, primaryIsClipAudio, music } = params;
  const targetStr = targetDur.toFixed(3);
  const basePrimary = `[${primaryIdx}:a]atrim=0:${audioTakeStr},asetpts=PTS-STARTPTS,apad=whole_dur=${targetStr}[apr]`;
  if (!music || musicIdx == null) return `${basePrimary};[apr]anull[outa]`;

  const trimEndExpr = music.trimEndSec != null ? `:end=${music.trimEndSec.toFixed(3)}` : "";
  let chain =
    `${basePrimary};` +
    `[${musicIdx}:a]atrim=start=${music.trimStartSec.toFixed(3)}${trimEndExpr},asetpts=PTS-STARTPTS` +
    `${music.offsetSec > 0 ? `,adelay=${Math.round(music.offsetSec * 1000)}|${Math.round(music.offsetSec * 1000)}` : ""}` +
    `,volume=${music.volume.toFixed(3)}[mbase]`;

  let musicLabel = "mbase";
  if (music.fadeInSec > 0.0005) {
    chain += `;[${musicLabel}]afade=t=in:st=0:d=${music.fadeInSec.toFixed(3)}[mfi]`;
    musicLabel = "mfi";
  }
  if (music.fadeOutSec > 0.0005) {
    const st = Math.max(0, targetDur - music.fadeOutSec);
    chain += `;[${musicLabel}]afade=t=out:st=${st.toFixed(3)}:d=${music.fadeOutSec.toFixed(3)}[mfo]`;
    musicLabel = "mfo";
  }
  chain += `;[${musicLabel}]apad=whole_dur=${targetStr},atrim=0:${targetStr}[mbed]`;

  const shouldDuck =
    music.ducking &&
    (primaryIsClipAudio ? music.duckUnderClipAudio : music.duckUnderNarration);
  if (shouldDuck) {
    const ratio = (4 + music.duckStrength * 8).toFixed(3);
    chain += `;[mbed][apr]sidechaincompress=threshold=0.02:ratio=${ratio}:attack=${music.duckAttackMs}:release=${music.duckReleaseMs}[mduck]`;
    chain += `;[apr][mduck]amix=inputs=2:weights='1 1':duration=longest:dropout_transition=0,alimiter=limit=0.95[outa]`;
  } else {
    chain += `;[apr][mbed]amix=inputs=2:weights='1 1':duration=longest:dropout_transition=0,alimiter=limit=0.95[outa]`;
  }
  return chain;
}

export async function buildShortVideo(input: BuildShortInput): Promise<{
  videoPath: string;
  srtPath: string;
  /** Present when `styledSubtitleBurn` — ASS burned into the MP4. */
  assPath?: string;
  concatPath: string;
}> {
  await fs.mkdir(outputVideoDir(), { recursive: true });
  await fs.mkdir(outputSubtitlesDir(), { recursive: true });
  const scenes = await Promise.all(
    input.scenes.map(async (scene, index) => ({
      ...scene,
      imagePath: await materializeSceneImagePath(scene.imagePath, input.contentId, index),
    })),
  );

  const { ow, oh } = clampNewsShortOutputDims(input.outputWidth, input.outputHeight);
  const halfSlideH = Math.round(oh / 2);

  const concatPath = path.join(outputDir(), `concat-${input.contentId}.txt`);
  await writeConcatFile(scenes, concatPath);

  const sceneSum = Math.max(0.1, scenes.reduce((a, s) => a + s.durationSec, 0));
  const sport365Script =
    input.script?.trim() ||
    scenes
      .map((s) => s.caption.trim())
      .filter(Boolean)
      .join(" ");
  const useSport365Ass =
    input.format === "planet-football-table" &&
    input.burnSubtitles !== false &&
    Boolean(sport365Script);

  let t = 0;
  const sceneCues: SubtitleCue[] = scenes.map((s) => {
    const start = t;
    const end = t + s.durationSec;
    t = end;
    return { startSec: start, endSec: end, text: s.caption };
  });
  const sentenceCues = useSport365Ass ? buildSport365SentenceCues(sport365Script, sceneSum) : [];
  const srtCues = useSport365Ass && sentenceCues.length > 0 ? sentenceCues : sceneCues;
  const srtPath = path.join(outputSubtitlesDir(), `${input.contentId}.srt`);
  await fs.writeFile(srtPath, buildSrt(srtCues), "utf-8");

  const useAss =
    input.styledSubtitleBurn === true &&
    input.format === "news-shorts" &&
    input.subtitleStyle &&
    input.burnSubtitles !== false;

  let assPath: string | undefined;
  let subtitleRelForBurn: string;
  if (useSport365Ass && sentenceCues.length > 0) {
    assPath = path.join(outputSubtitlesDir(), `${input.contentId}-sport365.ass`);
    await fs.writeFile(
      assPath,
      buildLeagueTableAss(sentenceCues, {
        playResX: ow,
        playResY: oh,
        busyMotionBackdrop: Boolean(input.backgroundVideoRel?.trim()),
        accentColor: input.subtitleAccentColor ?? SPORT365_SUBTITLE_PINK,
        styleName: "FootballTable",
      }),
      "utf-8",
    );
    subtitleRelForBurn = path.relative(projectRoot(), assPath).split(path.sep).join("/");
  } else if (useAss) {
    t = 0;
    const assCues = scenes.map((s) => {
      const start = t;
      const end = t + s.durationSec;
      t = end;
      return {
        startSec: start,
        endSec: end,
        headline: (s.subtitleHeadline ?? s.caption).trim(),
        subline: (s.subtitleSubline ?? "").trim(),
        highlightWords: s.highlightWords ?? [],
      };
    });
    assPath = path.join(outputSubtitlesDir(), `${input.contentId}-short.ass`);
    await fs.writeFile(
      assPath,
      buildNewsShortAss(assCues, {
        ...input.subtitleStyle!,
        busyMotionBackdrop: Boolean(input.backgroundVideoRel?.trim()),
        playResX: ow,
        playResY: oh,
      }),
      "utf-8",
    );
    subtitleRelForBurn = path.relative(projectRoot(), assPath).split(path.sep).join("/");
  } else {
    subtitleRelForBurn = path.relative(projectRoot(), srtPath).split(path.sep).join("/");
  }

  const videoPath = path.join(outputVideoDir(), `${input.contentId}-short.mp4`);
  const srtRel = subtitleRelForBurn;
  const fontsDirForAss =
    useAss && bundledNewsShortFontsDirExists()
      ? path.join(projectRoot(), "assets", "fonts", "news-shorts")
      : undefined;
  const subtitleBurnFilter = subtitlesFilterWithOptionalFontsdir(srtRel, fontsDirForAss);

  /** Output length follows voiceover (and scene timeline), padded to match. */
  const ABS_MAX_SEC = 600;

  const backdropRel = input.backgroundVideoRel?.trim();
  const cameraOverlayRelIn = input.cameraOverlayRel?.trim();
  const videoRecordLayout = normalizeVideoRecordLayout(input.videoRecordLayout);
  const videoRecordCirclePosition = normalizeVideoRecordCirclePosition(input.videoRecordCirclePosition);
  let bgVideoAbs = "";
  let camOverlayAbs = "";
  let dualComposite = false;
  /** Single-stream motion rel (for circle + still heuristic). */
  let singleMotionBgRel = "";

  if (
    backdropRel &&
    cameraOverlayRelIn &&
    motionBackdropRelLooksLikeCameraRecording(cameraOverlayRelIn) &&
    !motionBackdropRelLooksLikeCameraRecording(backdropRel)
  ) {
    dualComposite = true;
    try {
      assertCrossContentBackdropRel(backdropRel);
      assertCrossContentBackdropRel(cameraOverlayRelIn);
      bgVideoAbs = await resolveVideoAssetAbs(backdropRel);
      camOverlayAbs = await resolveVideoAssetAbs(cameraOverlayRelIn);
    } catch {
      throw new Error(
        "Backdrop or camera overlay video missing or invalid — check Background (before render) paths and your saved camera recording, then build again.",
      );
    }
  } else if (backdropRel) {
    singleMotionBgRel = backdropRel;
    try {
      assertCrossContentBackdropRel(backdropRel);
      bgVideoAbs = await resolveVideoAssetAbs(backdropRel);
    } catch {
      throw new Error(
        "Background video missing or invalid — re-save your video upload, render scenes with video background, then build again.",
      );
    }
  }

  let circleBgImageAbs = "";
  let halfBottomImageAbs = "";
  const cirImgRel = input.backgroundImageRel?.trim();
  if (cirImgRel && videoRecordLayout === "circle") {
    try {
      assertCrossContentBackdropRel(cirImgRel);
      circleBgImageAbs = path.normalize(path.join(outputDir(), ...cirImgRel.split("/")));
      await fs.access(circleBgImageAbs);
    } catch {
      throw new Error(
        "Background image not found for circle layout — upload under Background (before render) or fix the path.",
      );
    }
  }
  if (
    cirImgRel &&
    videoRecordLayout === "half" &&
    !dualComposite &&
    singleMotionBgRel &&
    motionBackdropRelLooksLikeCameraRecording(singleMotionBgRel)
  ) {
    try {
      assertCrossContentBackdropRel(cirImgRel);
      const abs = path.normalize(path.join(outputDir(), ...cirImgRel.split("/")));
      await fs.access(abs);
      halfBottomImageAbs = abs;
    } catch {
      halfBottomImageAbs = "";
    }
  }

  const useVideoAudio = Boolean(input.useVideoAudio && bgVideoAbs);
  if (useVideoAudio) {
    const hasAudio = await probeHasAudioStream(bgVideoAbs);
    if (!hasAudio) {
      throw new Error(
        "Background video has no audio track. Record with microphone enabled, or turn off “Use video audio” and use TTS or a voice recording.",
      );
    }
  }

  const ap = input.audioPath?.trim();
  if (!useVideoAudio && !ap) {
    throw new Error("audioPath is required when not using video audio");
  }

  const audioIn = ap ? (path.isAbsolute(ap) ? ap : path.resolve(projectRoot(), ap)) : "";
  const backingMusic = resolveBackingMusic(input.backingMusic);
  if (backingMusic) {
    await fs.access(backingMusic.abs);
  }

  let audioDur = sceneSum;
  try {
    if (useVideoAudio) {
      audioDur = await probeMediaDurationSec(bgVideoAbs);
    } else {
      audioDur = await probeMediaDurationSec(audioIn);
    }
  } catch {
    /* probe failed — assume similar to scene timing */
  }

  const rawTarget = Math.max(sceneSum, audioDur);
  const targetDur = Math.min(ABS_MAX_SEC, Math.max(0.1, rawTarget));
  const targetStr = targetDur.toFixed(3);
  const padVideoSec = Math.max(0, targetDur - sceneSum);
  const padStr = padVideoSec.toFixed(3);
  /** Use full audio up to output length (no shorter than timeline). */
  const audioTake = Math.min(audioDur, targetDur);
  const audioTakeStr = audioTake.toFixed(3);

  const burn = input.burnSubtitles !== false;

  const metaTitle = input.seoTitle.replace(/[=;\r\n]/g, " ").slice(0, 250);
  const metaDesc = `${input.format.replace(/-/g, " ")} · ${BRAND_MARK}`
    .replace(/[=;\r\n]/g, " ")
    .slice(0, 250);

  if (bgVideoAbs) {
    const { args: fgArgs, filterComplex: fgFc, n } = buildForegroundRgbaChain(scenes, ow, oh);

    let fgChain = `${fgFc};[vcat]trim=duration=${targetStr},setpts=PTS-STARTPTS[vtrimfg]`;
    if (padVideoSec > 0.0005) {
      fgChain += `;[vtrimfg]tpad=stop_mode=clone:stop_duration=${padStr}[vfg]`;
    } else {
      fgChain += `;[vtrimfg]format=rgba[vfg]`;
    }

    /** Runway / uploads under “Background (before render)” (not `camera-record`) always scale to full 1080×1920. */
    const singleStreamBackdropIsFileNotCamera =
      !dualComposite &&
      Boolean(singleMotionBgRel && !motionBackdropRelLooksLikeCameraRecording(singleMotionBgRel));
    const layoutForBackdropFilter: VideoRecordLayout = singleStreamBackdropIsFileNotCamera
      ? "full"
      : videoRecordLayout;

    /**
     * Half layout splits a **single camera-record** stream only. Dual, Runway/upload backdrops, and full/circle camera
     * use full-frame slides on top of the composited background.
     */
    const overlayOnBgFor = (bgLabel: string) =>
      dualComposite || singleStreamBackdropIsFileNotCamera || videoRecordLayout !== "half"
        ? `[vfg]format=yuva420p[vfa];[${bgLabel}][vfa]overlay=0:0:format=auto:shortest=0[vov]`
        : `[vfg]format=rgba[vfg_rgba];[vfg_rgba]crop=${ow}:${halfSlideH}:0:${halfSlideH}[vfg_crop];[vfg_crop]format=yuva420p[vfa];[${bgLabel}][vfa]overlay=0:${halfSlideH}:format=auto:shortest=0[vov]`;

    let mapVideo = "vov";

    const useCircleStill =
      !dualComposite &&
      videoRecordLayout === "circle" &&
      Boolean(circleBgImageAbs) &&
      Boolean(singleMotionBgRel) &&
      motionBackdropRelLooksLikeCameraRecording(singleMotionBgRel);

    const appendCameraFullReadabilityDim = (chain: string, outLabel: { current: string }): string => {
      const singleCam =
        !dualComposite &&
        Boolean(singleMotionBgRel && motionBackdropRelLooksLikeCameraRecording(singleMotionBgRel));
      if (!singleCam || layoutForBackdropFilter !== "full") return chain;
      const next = "bgread";
      const c = `${chain};[${outLabel.current}]eq=brightness=-0.165:saturation=0.89[${next}]`;
      outLabel.current = next;
      return c;
    };

    const appendSport365BackdropVividBoost = (chain: string, outLabel: { current: string }): string => {
      if (input.format !== "planet-football-table" || !singleStreamBackdropIsFileNotCamera) return chain;
      const next = "bgvivid";
      const c = `${chain};[${outLabel.current}]eq=brightness=0.045:saturation=1.08[${next}]`;
      outLabel.current = next;
      return c;
    };

    if (useVideoAudio) {
      const bgIdx = n;
      let bgChain: string;
      const tailInputs: string[] = [];
      const bgStreamLabel: { current: string } = { current: "bg" };
      if (dualComposite) {
        const camIdx = n + 1;
        bgChain = buildDualBackdropAndCameraPipChain(
          bgIdx,
          camIdx,
          targetStr,
          videoRecordCirclePosition,
          ow,
          oh,
        );
      } else if (useCircleStill) {
        bgChain = buildCircleBackgroundWithImageChain(
          bgIdx,
          n + 1,
          targetStr,
          videoRecordCirclePosition,
          ow,
          oh,
        );
        tailInputs.push(
          "-loop",
          "1",
          "-t",
          targetStr,
          "-i",
          circleBgImageAbs,
        );
      } else if (halfBottomImageAbs) {
        tailInputs.push(
          "-loop",
          "1",
          "-t",
          targetStr,
          "-i",
          halfBottomImageAbs,
        );
        bgChain = buildHalfBackgroundCameraPlusBottomStillChain(bgIdx, n + 1, targetStr, ow, oh);
      } else {
        bgChain = buildBackgroundVideoFilterChain(
          bgIdx,
          targetStr,
          layoutForBackdropFilter,
          videoRecordCirclePosition,
          ow,
          oh,
        );
        bgChain = appendSport365BackdropVividBoost(bgChain, bgStreamLabel);
        bgChain = appendCameraFullReadabilityDim(bgChain, bgStreamLabel);
      }
      let vChain = `${fgChain};${bgChain};${overlayOnBgFor(bgStreamLabel.current)}`;
      if (burn) {
        vChain += `;[vov]${subtitleBurnFilter}[vout]`;
        mapVideo = "vout";
      }
      const hasTailInput = tailInputs.length > 0;
      const musicIdx = backingMusic ? n + (dualComposite ? 2 : hasTailInput ? 2 : 1) : undefined;
      const audioChain = buildPrimaryPlusMusicAudioChain({
        primaryIdx: bgIdx,
        musicIdx,
        targetDur,
        audioTakeStr,
        primaryIsClipAudio: true,
        music: backingMusic,
      });
      const filterComplex = `${vChain};${audioChain}`;
      const args = dualComposite
        ? [
            ...fgArgs,
            "-stream_loop",
            "-1",
            "-i",
            bgVideoAbs,
            "-stream_loop",
            "-1",
            "-i",
            camOverlayAbs,
            ...(backingMusic
              ? [...(backingMusic.loop ? ["-stream_loop", "-1"] : []), "-i", backingMusic.abs]
              : []),
            "-filter_complex",
            filterComplex,
            "-map",
            `[${mapVideo}]`,
            "-map",
            "[outa]",
            "-t",
            targetStr,
            "-r",
            "30",
            ...ffmpegMp4VideoEncodeArgs(),
            "-c:a",
            "aac",
            "-metadata",
            `title=${metaTitle}`,
            "-metadata",
            `description=${metaDesc}`,
            "-metadata",
            `encoder=${BRAND_ENCODER}`,
            videoPath,
          ]
        : [
            ...fgArgs,
            "-stream_loop",
            "-1",
            "-i",
            bgVideoAbs,
            ...tailInputs,
            ...(backingMusic
              ? [...(backingMusic.loop ? ["-stream_loop", "-1"] : []), "-i", backingMusic.abs]
              : []),
            "-filter_complex",
            filterComplex,
            "-map",
            `[${mapVideo}]`,
            "-map",
            "[outa]",
            "-t",
            targetStr,
            "-r",
            "30",
            ...ffmpegMp4VideoEncodeArgs(),
            "-c:a",
            "aac",
            "-metadata",
            `title=${metaTitle}`,
            "-metadata",
            `description=${metaDesc}`,
            "-metadata",
            `encoder=${BRAND_ENCODER}`,
            videoPath,
          ];
      await runFfmpeg(args);
    } else {
      const audioIdx = n;
      const bgIdx = n + 1;
      const camIdx = dualComposite ? n + 2 : null;
      let bgChain: string;
      const tailInputs: string[] = [];
      const bgStreamLabel: { current: string } = { current: "bg" };
      if (dualComposite && camIdx != null) {
        bgChain = buildDualBackdropAndCameraPipChain(
          bgIdx,
          camIdx,
          targetStr,
          videoRecordCirclePosition,
          ow,
          oh,
        );
      } else if (useCircleStill) {
        bgChain = buildCircleBackgroundWithImageChain(
          bgIdx,
          n + 2,
          targetStr,
          videoRecordCirclePosition,
          ow,
          oh,
        );
        tailInputs.push(
          "-loop",
          "1",
          "-t",
          targetStr,
          "-i",
          circleBgImageAbs,
        );
      } else if (halfBottomImageAbs) {
        tailInputs.push(
          "-loop",
          "1",
          "-t",
          targetStr,
          "-i",
          halfBottomImageAbs,
        );
        bgChain = buildHalfBackgroundCameraPlusBottomStillChain(bgIdx, n + 2, targetStr, ow, oh);
      } else {
        bgChain = buildBackgroundVideoFilterChain(
          bgIdx,
          targetStr,
          layoutForBackdropFilter,
          videoRecordCirclePosition,
          ow,
          oh,
        );
        bgChain = appendSport365BackdropVividBoost(bgChain, bgStreamLabel);
        bgChain = appendCameraFullReadabilityDim(bgChain, bgStreamLabel);
      }
      let vChain = `${fgChain};${bgChain};${overlayOnBgFor(bgStreamLabel.current)}`;
      mapVideo = "vov";
      if (burn) {
        vChain += `;[vov]${subtitleBurnFilter}[vout]`;
        mapVideo = "vout";
      }
      const hasTailInput = tailInputs.length > 0;
      const musicIdx = backingMusic ? n + (dualComposite ? 3 : hasTailInput ? 3 : 2) : undefined;
      const audioChain = buildPrimaryPlusMusicAudioChain({
        primaryIdx: audioIdx,
        musicIdx,
        targetDur,
        audioTakeStr,
        primaryIsClipAudio: false,
        music: backingMusic,
      });
      const filterComplex = `${vChain};${audioChain}`;
      const args = dualComposite
        ? [
            ...fgArgs,
            "-i",
            audioIn,
            "-stream_loop",
            "-1",
            "-i",
            bgVideoAbs,
            "-stream_loop",
            "-1",
            "-i",
            camOverlayAbs,
            ...(backingMusic
              ? [...(backingMusic.loop ? ["-stream_loop", "-1"] : []), "-i", backingMusic.abs]
              : []),
            "-filter_complex",
            filterComplex,
            "-map",
            `[${mapVideo}]`,
            "-map",
            "[outa]",
            "-t",
            targetStr,
            "-r",
            "30",
            ...ffmpegMp4VideoEncodeArgs(),
            "-c:a",
            "aac",
            "-metadata",
            `title=${metaTitle}`,
            "-metadata",
            `description=${metaDesc}`,
            "-metadata",
            `encoder=${BRAND_ENCODER}`,
            videoPath,
          ]
        : [
            ...fgArgs,
            "-i",
            audioIn,
            "-stream_loop",
            "-1",
            "-i",
            bgVideoAbs,
            ...tailInputs,
            ...(backingMusic
              ? [...(backingMusic.loop ? ["-stream_loop", "-1"] : []), "-i", backingMusic.abs]
              : []),
            "-filter_complex",
            filterComplex,
            "-map",
            `[${mapVideo}]`,
            "-map",
            "[outa]",
            "-t",
            targetStr,
            "-r",
            "30",
            ...ffmpegMp4VideoEncodeArgs(),
            "-c:a",
            "aac",
            "-metadata",
            `title=${metaTitle}`,
            "-metadata",
            `description=${metaDesc}`,
            "-metadata",
            `encoder=${BRAND_ENCODER}`,
            videoPath,
          ];
      await runFfmpeg(args);
    }
  } else {
    const { args: ffArgs, filterComplex: baseFc, audioInputIndex } = buildImageChain(scenes, ow, oh);

    let vChain = `${baseFc};[vcat]trim=duration=${targetStr},setpts=PTS-STARTPTS[vtrim]`;
    let mapVideo = "vtrim";
    if (padVideoSec > 0.0005) {
      vChain += `;[vtrim]tpad=stop_mode=clone:stop_duration=${padStr}[vpad]`;
      mapVideo = "vpad";
    }
    if (burn) {
      vChain += `;[${mapVideo}]${subtitleBurnFilter}[vout]`;
      mapVideo = "vout";
    }

    const musicIdx = backingMusic ? audioInputIndex + 1 : undefined;
    const audioChain = buildPrimaryPlusMusicAudioChain({
      primaryIdx: audioInputIndex,
      musicIdx,
      targetDur,
      audioTakeStr,
      primaryIsClipAudio: false,
      music: backingMusic,
    });
    const filterComplex = `${vChain};${audioChain}`;

    const args = [
      ...ffArgs,
      "-i",
      audioIn,
      ...(backingMusic
        ? [...(backingMusic.loop ? ["-stream_loop", "-1"] : []), "-i", backingMusic.abs]
        : []),
      "-filter_complex",
      filterComplex,
      "-map",
      `[${mapVideo}]`,
      "-map",
      "[outa]",
      "-t",
      targetStr,
      "-r",
      "30",
      ...ffmpegMp4VideoEncodeArgs(),
      "-c:a",
      "aac",
      "-metadata",
      `title=${metaTitle}`,
      "-metadata",
      `description=${metaDesc}`,
      "-metadata",
      `encoder=${BRAND_ENCODER}`,
      videoPath,
    ];

    await runFfmpeg(args);
  }

  await appendManifest({
    id: input.contentId,
    format: input.format,
    createdAt: new Date().toISOString(),
    video: path.relative(outputDir(), videoPath),
    subtitles: path.relative(outputDir(), assPath ?? srtPath),
    images: scenes.map((s) => path.relative(outputDir(), s.imagePath)),
    seoTitle: input.seoTitle,
    seoSlug: input.seoSlug,
    ...(input.seoDownloadFile?.trim()
      ? { seoDownloadFile: input.seoDownloadFile.trim() }
      : {}),
    keywords: input.searchKeywords,
    ...(input.buildMode ? { buildMode: input.buildMode } : {}),
  });

  await upsertLibraryMetadata(input.contentId, {
    title: input.seoTitle,
    keywords: input.searchKeywords,
  });

  return { videoPath, srtPath, ...(assPath ? { assPath } : {}), concatPath };
}

async function appendManifest(entry: ManifestEntry) {
  const p = assetsManifestPath();
  let list: ManifestEntry[] = [];
  try {
    const raw = await fs.readFile(p, "utf-8");
    list = JSON.parse(raw) as ManifestEntry[];
  } catch {
    list = [];
  }
  list.unshift(entry);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(list, null, 2), "utf-8");
}
