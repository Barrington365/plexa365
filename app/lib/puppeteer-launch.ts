import fs from "fs";
import path from "path";
import type { LaunchOptions } from "puppeteer";
import { isNetlifyHostedLambdaRuntime } from "@/app/lib/netlify-hosted-runtime";

/**
 * Next's `server-only` package throws when a Netlify function evaluates it, which
 * aborts the News Shorts background worker before the job can leave "pending".
 * This file is only imported from server routes and functions.
 */
if (typeof window !== "undefined") {
  throw new Error("Puppeteer launch can only run on the server.");
}

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MAC_CHROMIUM = "/Applications/Chromium.app/Contents/MacOS/Chromium";

/**
 * Cursor/sandbox runs can point Puppeteer at a temp cache with no downloaded browser.
 * Pin cache to the real home directory before the puppeteer module resolves paths.
 */
export function normalizePuppeteerCacheDir(): void {
  if (process.env.PUPPETEER_CACHE_DIR) return;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    process.env.PUPPETEER_CACHE_DIR = path.join(home, ".cache", "puppeteer");
  }
}

const DEFAULT_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--font-render-hinting=none",
] as const;

/**
 * Linux serverless / Netlify: no system Chrome at `/opt/google/chrome`; use Sparticuz
 * (same pattern as [Netlify guidance](https://github.com/Sparticuz/chromium/issues/24#issuecomment-1414107620)).
 */
export async function resolvePuppeteerLaunchOptions(): Promise<LaunchOptions> {
  const argsFallback = [...DEFAULT_ARGS];
  const envExe = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envExe && fs.existsSync(envExe)) {
    return { headless: true, executablePath: envExe, args: argsFallback };
  }
  if (process.platform === "darwin") {
    if (fs.existsSync(MAC_CHROME)) {
      return { headless: true, executablePath: MAC_CHROME, args: argsFallback };
    }
    if (fs.existsSync(MAC_CHROMIUM)) {
      return { headless: true, executablePath: MAC_CHROMIUM, args: argsFallback };
    }
  }
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
        : "",
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        return { headless: true, executablePath: p, args: argsFallback };
      }
    }
  }

  if (isNetlifyHostedLambdaRuntime()) {
    try {
      const chromiumMod = await import("@sparticuz/chromium");
      const Chromium = chromiumMod.default;
      if (Chromium) {
        const { defaultArgs } = await import("puppeteer");
        Chromium.setGraphicsMode = false;
        const executablePath = await Chromium.executablePath();
        if (executablePath) {
          const mergedArgs = defaultArgs({ args: Chromium.args, headless: "shell" });
          return {
            args: mergedArgs,
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
            executablePath,
            headless: "shell",
          };
        }
      }
    } catch {
      /* fall through to channel/chrome */
    }
  }

  normalizePuppeteerCacheDir();
  return { headless: true, channel: "chrome", args: argsFallback };
}

export async function loadPuppeteer() {
  normalizePuppeteerCacheDir();
  const mod = await import("puppeteer");
  return mod.default;
}
