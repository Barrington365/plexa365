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
