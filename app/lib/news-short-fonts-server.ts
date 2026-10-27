/**
 * Node-only: bundled font directory checks + FFmpeg subtitle filter (uses `fs`).
 * Do not import from client components — use `./news-short-fonts` for shared types/options.
 */

import fs from "fs";
import path from "path";
import { projectRoot } from "@/app/lib/paths";
import { NEWS_SHORT_BUNDLED_FONT_FILES } from "@/app/lib/news-short-fonts";

const BUNDLED_DIR = path.join(projectRoot(), "assets", "fonts", "news-shorts");

export function bundledNewsShortFontsDirExists(): boolean {
  try {
    for (const f of NEWS_SHORT_BUNDLED_FONT_FILES) {
      if (!fs.existsSync(path.join(BUNDLED_DIR, f))) return false;
    }
    return fs.statSync(BUNDLED_DIR).isDirectory();
  } catch {
    return false;
  }
}

/** Prepare path for FFmpeg filter (forward slashes; escape drive colon on Windows). */
function ffmpegPathForSubtitleFilter(p: string): string {
  const norm = p.replace(/\\/g, "/");
  return norm.replace(/^([A-Za-z]):/, "$1\\:");
}

/**
 * FFmpeg `subtitles` filter argument; use bundled fontsdir when ASS + files exist.
 */
export function subtitlesFilterWithOptionalFontsdir(
  subtitleFileRelFromProjectRoot: string,
  fontsDirAbs?: string,
): string {
  const sub = ffmpegPathForSubtitleFilter(subtitleFileRelFromProjectRoot);
  if (fontsDirAbs && bundledNewsShortFontsDirExists()) {
    const fd = ffmpegPathForSubtitleFilter(fontsDirAbs);
    return `subtitles=${sub}:fontsdir=${fd}:charenc=UTF-8`;
  }
  return `subtitles=${sub}:charenc=UTF-8`;
}

/** Serverless hosts have no system fonts. Never silently render captionless video. */
export function requireNewsShortFontsDir(): string {
  if (!bundledNewsShortFontsDirExists()) {
    throw new Error("Caption fonts are missing from this worker. Include assets/fonts/news-shorts/*.ttf before rebuilding.");
  }
  return BUNDLED_DIR;
}

/** Fail before paid narration when this host cannot draw the bundled caption font. */
export async function assertCaptionRenderer(): Promise<void> {
  const { spawnSync } = await import("child_process");
  const { ffmpegBinary } = await import("@/app/features/video/ffmpeg-utils");
  const { buildNewsShortAss } = await import("@/app/features/content/news-short-ass");
  const { tmpdir } = await import("os");
  const dir = fs.mkdtempSync(path.join(tmpdir(), "caption-check-"));
  try {
    const file = path.join(dir, "check.ass");
    fs.writeFileSync(file, buildNewsShortAss([{startSec:0,endSec:1,headline:"CAPTION CHECK",subline:"",highlightWords:[]}], {fontSize:54,panelColor:"#000000",highlightColor:"#ffffff",textBoxWidthPct:86,playResX:1920,playResY:1080}));
    const filter = subtitlesFilterWithOptionalFontsdir(file, requireNewsShortFontsDir());
    const result = spawnSync(ffmpegBinary(), ["-f","lavfi","-i","color=black:s=1920x1080:d=0.1","-vf",filter,"-frames:v","1","-f","rawvideo","-pix_fmt","gray","pipe:1"], {timeout:15000,maxBuffer:4*1024*1024});
    const bright = result.stdout?.reduce((n:number,b:number) => n + (b>100 ? 1 : 0),0) ?? 0;
    if (result.status !== 0 || bright < 500) {
      const detail = result.stderr?.toString().split("\n").filter(l => /fontselect|font provider|Error opening memory font/.test(l)).slice(-3).join(" ").slice(0,500);
      throw new Error(`Caption renderer check failed before narration. ${detail || "No visible caption pixels."}`);
    }
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
}
