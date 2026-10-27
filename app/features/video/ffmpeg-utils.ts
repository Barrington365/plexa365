import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { isNetlifyHostedLambdaRuntime, usesEphemeralOutputRootRuntime } from "@/app/lib/netlify-hosted-runtime";
import { projectRoot } from "@/app/lib/paths";
import { getServerSecret } from "@/app/lib/server-secrets";

/**
 * Resolution order: FFMPEG_BIN → FFMPEG_PATH → `command -v` (augmented PATH) → common install paths
 * → bundled `ffmpeg-static` (npm) → bare "ffmpeg" (local dev only).
 * GUI-launched Node often lacks Homebrew on PATH; the bundled binary avoids ENOENT.
 */
const FALLBACK_PATHS = [
  "/opt/homebrew/bin/ffmpeg", // Apple Silicon Homebrew
  "/usr/local/bin/ffmpeg", // Intel Homebrew / some installs
  "/opt/local/bin/ffmpeg", // MacPorts
  "/usr/bin/ffmpeg", // Linux / some macOS
];

const HOSTING_FFMPEG_MISSING =
  "FFmpeg binary not found in hosting environment. Ensure ffmpeg-static is installed at build time (npm run install-ffmpeg-static).";

let cachedBin: string | null = null;

export type FfmpegResolutionDebug = {
  platform: NodeJS.Platform;
  cwd: string;
  cachedBin: string | null;
  envPath: {
    present: boolean;
    value: string;
    isAbsolute: boolean;
    exists: boolean;
  };
  envBin: {
    present: boolean;
    value: string;
    exists: boolean;
  };
  commandV: string | null;
  fallbackPaths: Array<{ path: string; exists: boolean }>;
  ffmpegStatic: {
    value: string | null;
    exists: boolean;
  };
  selected: string;
  selectedExists: boolean;
};

function augmentedPathEnv(): string {
  const extra = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin"];
  return [...extra, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
}

function isHostedRuntime(): boolean {
  return isNetlifyHostedLambdaRuntime() || usesEphemeralOutputRootRuntime();
}

function ensureExecutableBin(binPath: string): string {
  if (!path.isAbsolute(binPath) || !fs.existsSync(binPath)) return binPath;
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
    return binPath;
  } catch {
    if (!isHostedRuntime()) return binPath;
    const tmpBin = path.join(os.tmpdir(), "plexa-ffmpeg");
    try {
      if (!fs.existsSync(tmpBin)) {
        fs.copyFileSync(binPath, tmpBin);
        fs.chmodSync(tmpBin, 0o755);
      }
      return tmpBin;
    } catch {
      return binPath;
    }
  }
}

function resolveCandidateBin(candidate: string): string | null {
  if (!candidate) return null;
  if (path.isAbsolute(candidate)) {
    return fs.existsSync(candidate) ? ensureExecutableBin(candidate) : null;
  }
  if (candidate !== "ffmpeg") return candidate;
  return null;
}

/** Find ffmpeg the same way a login shell would, after prepending standard install dirs */
function resolveViaCommandV(): string | null {
  if (process.platform === "win32") {
    const r = spawnSync("where.exe", ["ffmpeg"], {
      encoding: "utf-8",
      env: { ...process.env, PATH: augmentedPathEnv() },
      windowsHide: true,
    });
    const line = r.stdout?.split(/\r?\n/).find((l) => l.trim());
    if (line && fs.existsSync(line.trim())) return ensureExecutableBin(line.trim());
    return null;
  }

  const r = spawnSync("sh", ["-c", "command -v ffmpeg"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: augmentedPathEnv() },
  });
  if (r.error || r.status !== 0) return null;
  const found = r.stdout?.trim();
  if (!found) return null;
  return fs.existsSync(found) ? ensureExecutableBin(found) : null;
}

function resolveFfmpegBinaryUncached(): string {
  const fromBinEnv = process.env.FFMPEG_BIN?.trim();
  const binFromEnv = fromBinEnv ? resolveCandidateBin(fromBinEnv) : null;
  if (binFromEnv) return binFromEnv;

  const fromEnv = getServerSecret("FFMPEG_PATH")?.trim();
  if (fromEnv) {
    const resolved = resolveCandidateBin(fromEnv);
    if (resolved) return resolved;
  }

  const viaShell = resolveViaCommandV();
  if (viaShell) return viaShell;

  for (const p of FALLBACK_PATHS) {
    if (fs.existsSync(p)) return ensureExecutableBin(p);
  }

  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ensureExecutableBin(ffmpegStatic);
  }

  if (isHostedRuntime()) {
    throw new Error(HOSTING_FFMPEG_MISSING);
  }

  return "ffmpeg";
}

export function ffmpegBinary(): string {
  if (cachedBin) return cachedBin;
  cachedBin = resolveFfmpegBinaryUncached();
  return cachedBin;
}

export function assertFfmpegAvailable(): void {
  resetFfmpegBinaryCache();
  ffmpegBinary();
}

export function ffmpegResolutionDebug(): FfmpegResolutionDebug {
  const fromEnv = getServerSecret("FFMPEG_PATH")?.trim() || "";
  const fromBinEnv = process.env.FFMPEG_BIN?.trim() || "";
  let selected = cachedBin ?? "ffmpeg";
  let selectedExists = path.isAbsolute(selected) ? fs.existsSync(selected) : false;
  try {
    selected = ffmpegBinary();
    selectedExists = path.isAbsolute(selected) ? fs.existsSync(selected) : false;
  } catch {
    selectedExists = false;
  }
  return {
    platform: process.platform,
    cwd: process.cwd(),
    cachedBin,
    envPath: {
      present: Boolean(fromEnv),
      value: fromEnv,
      isAbsolute: Boolean(fromEnv && path.isAbsolute(fromEnv)),
      exists: Boolean(fromEnv && path.isAbsolute(fromEnv) && fs.existsSync(fromEnv)),
    },
    envBin: {
      present: Boolean(fromBinEnv),
      value: fromBinEnv,
      exists: Boolean(fromBinEnv && path.isAbsolute(fromBinEnv) && fs.existsSync(fromBinEnv)),
    },
    commandV: resolveViaCommandV(),
    fallbackPaths: FALLBACK_PATHS.map((p) => ({ path: p, exists: fs.existsSync(p) })),
    ffmpegStatic: {
      value: ffmpegStatic || null,
      exists: Boolean(ffmpegStatic && fs.existsSync(ffmpegStatic)),
    },
    selected,
    selectedExists,
  };
}

/** Clear cache (e.g. tests) */
export function resetFfmpegBinaryCache() {
  cachedBin = null;
}

/**
 * libx264 tuning for MP4 exports: faster than the default `medium` preset; `+faststart` moves the moov atom
 * so players can begin playback sooner (better perceived load time).
 */
export const FFMPEG_LIBX264_MP4_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
] as const;

/** Faster encode on Netlify Lambdas — live builds can exceed default `fast` by several minutes. */
export const FFMPEG_LIBX264_MP4_ARGS_HOSTED = [
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
] as const;

export function ffmpegMp4VideoEncodeArgs(): readonly string[] {
  return isNetlifyHostedLambdaRuntime() ? FFMPEG_LIBX264_MP4_ARGS_HOSTED : FFMPEG_LIBX264_MP4_ARGS;
}

const HOSTED_FFMPEG_TIMEOUT_MS = 12 * 60 * 1000;

export function runFfmpeg(args: string[], options?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs =
    options?.timeoutMs ??
    (isNetlifyHostedLambdaRuntime() ? HOSTED_FFMPEG_TIMEOUT_MS : 0);

  return new Promise((resolve, reject) => {
    const bin = ffmpegBinary();
    const p = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: projectRoot(),
    });
    let err = "";
    p.stderr?.on("data", (c) => {
      err += c.toString();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        p.kill("SIGKILL");
        reject(
          new Error(
            `FFmpeg timed out after ${Math.round(timeoutMs / 60_000)} minutes. Try fewer scenes, shorter script, or disable motion backdrop for a faster build.`,
          ),
        );
      }, timeoutMs);
    }
    p.on("error", (e) => {
      if (timer) clearTimeout(timer);
      const errObj = e as NodeJS.ErrnoException;
      if (errObj.code === "ENOENT") {
        reject(
          new Error(
            `ffmpeg not found (${bin}). Run \`npm install\` (project includes ffmpeg-static) or set FFMPEG_PATH in .env.local to your binary (e.g. /opt/homebrew/bin/ffmpeg).`,
          ),
        );
        return;
      }
      reject(e);
    });
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0 && /fontselect: failed to find/i.test(err)) {
        const detail = err.split("\n").filter(l => /fontselect: failed to find/i.test(l)).slice(-2).join(" ").slice(0,400);
        reject(new Error(`Caption rendering failed: FFmpeg could not load a usable font. ${detail}`));
      } else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-1200)}`));
    });
  });
}

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/;

/**
 * Media duration in seconds via `ffmpeg -i` (works with bundled ffmpeg-static; no ffprobe required).
 */
export function probeMediaDurationSec(filePath: string): Promise<number> {
  const bin = ffmpegBinary();
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ["-hide_banner", "-nostdin", "-i", filePath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr?.on("data", (c) => {
      err += c.toString();
    });
    p.on("error", reject);
    p.on("close", () => {
      const m = err.match(DURATION_RE);
      if (!m) {
        reject(new Error("Could not read media duration (ffmpeg -i parse failed)"));
        return;
      }
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const sec = parseFloat(m[3]);
      const total = h * 3600 + min * 60 + sec;
      if (!Number.isFinite(total) || total <= 0) {
        reject(new Error("Invalid parsed duration"));
        return;
      }
      resolve(total);
    });
  });
}

/** True if ffmpeg reports an audio stream (e.g. camera clip with mic). */
export function probeHasAudioStream(filePath: string): Promise<boolean> {
  const bin = ffmpegBinary();
  return new Promise((resolve) => {
    const p = spawn(bin, ["-hide_banner", "-nostdin", "-i", filePath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr?.on("data", (c) => {
      err += c.toString();
    });
    p.on("error", () => resolve(false));
    p.on("close", () => {
      resolve(/Stream\s+#\d+:\d+(?:\([^)]*\))?:\s*Audio/i.test(err));
    });
  });
}
