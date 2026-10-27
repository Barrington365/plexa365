import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { buildNewsShortAss } from "@/app/features/content/news-short-ass";
import { styleTimedNewsShortCaptions } from "./news-short-timed-caption-style";
import { getNewsShortBrandTemplateDefinition } from "@/app/features/news-shorts/news-shorts-brand-templates";
import { assertCaptionRenderer, requireNewsShortFontsDir, subtitlesFilterWithOptionalFontsdir } from "./news-short-fonts-server";

const blobs = vi.hoisted(() => new Map<string, { data: ArrayBuffer; metadata: Record<string, string> }>());
vi.mock("./netlify-blob-json", () => ({ shouldUseNetlifyBlobStore: () => true }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({
  set: async (key: string, data: ArrayBuffer, opts: { metadata: Record<string, string> }) => { blobs.set(key, {data, metadata:opts.metadata}); },
  getWithMetadata: async (key: string) => blobs.get(key) ?? null,
}) }));
import { normaliseBuildSidecarRel, writeVideoBlobAsset, readVideoBlobAsset } from "./video-blob-assets";

describe("durable captions", () => {
  it.each(["teamtalk", "football365"])("burns white and brand-coloured pixels for %s timed narration", async (brand) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brand-caption-"));
    try {
      const file = path.join(dir, "captions.ass");
      const cues = styleTimedNewsShortCaptions([{startSec:0,endSec:1,text:"Reports suggest Chelsea may allow a"}], [{startSec:0,endSec:1,headline:"",subline:"",highlightWords:["Chelsea"]}]);
      await fs.writeFile(file, buildNewsShortAss(cues, {...getNewsShortBrandTemplateDefinition(brand)!.buildTemplate().style,playResX:1920,playResY:1080}));
      const result = spawnSync(ffmpeg!, ["-v","error","-f","lavfi","-i","color=black:s=1920x1080:d=1", "-vf",subtitlesFilterWithOptionalFontsdir(file, requireNewsShortFontsDir()),"-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","pipe:1"], {maxBuffer:8*1024*1024});
      expect(result.status, result.stderr.toString()).toBe(0);
      let white = 0, accent = 0;
      for (let i = 0; i < result.stdout.length; i += 3) {
        const [r,g,b] = result.stdout.subarray(i,i+3);
        if (r>220 && g>220 && b>220) white++;
        if (g>180 && r<100 && (brand === "teamtalk" ? b>120 && b<225 : b>210)) accent++;
      }
      expect(white).toBeGreaterThan(500);
      expect(accent).toBeGreaterThan(500);
    } finally { await fs.rm(dir, {recursive:true,force:true}); }
  });
  it("validates caption pixels before narration", async () => { await expect(assertCaptionRenderer()).resolves.toBeUndefined(); });
  it("round trips SRT, ASS and engine JSON independently of worker disk", async () => {
    for (const rel of ["subtitles/test.srt", "subtitles/test-short.ass", "video/test-short-engine.json"]) {
      await writeVideoBlobAsset(rel, Buffer.from("caption evidence"));
      const asset = await readVideoBlobAsset(rel);
      expect(asset?.bytes.toString()).toBe("caption evidence");
      expect(asset?.contentType).toMatch(/text\/plain|application\/json/);
      expect(blobs.get(rel)?.metadata.updatedAt).toMatch(/Z$/);
    }
  });
  it("rejects traversal and unrelated files", () => {
    for (const rel of ["subtitles/../secret.ass", "video/settings.json", "secrets/key.json", "subtitles/a/b.ass"]) {
      expect(normaliseBuildSidecarRel(rel)).toBeNull();
    }
  });
  it("burns visible pixels during cues and removes them outside cues", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "caption-burn-"));
    try {
      const file = path.join(dir, "captions.ass");
      await fs.writeFile(file, buildNewsShortAss([{startSec:0.2,endSec:0.8,headline:"SAM CAPTIONS VISIBLE",subline:"",highlightWords:[]}], {
        fontSize:54, lineHeight:1.05, panelColor:"#000000", highlightColor:"#00e8f0",textBoxWidthPct:86,playResX:1920,playResY:1080,
      }));
      const filter = subtitlesFilterWithOptionalFontsdir(file, requireNewsShortFontsDir());
      for (const [at, visible] of [[0.5,true],[1,false]] as const) {
        const result = spawnSync(ffmpeg!, ["-v","error","-f","lavfi","-i","color=black:s=1920x1080:d=1.2", "-vf",filter,"-ss",String(at),"-frames:v","1","-f","rawvideo","-pix_fmt","gray","pipe:1"], {maxBuffer:4*1024*1024});
        expect(result.status, result.stderr.toString()).toBe(0);
        const bright = result.stdout.reduce((n,b) => n + (b > 100 ? 1 : 0),0);
        expect(bright > 500).toBe(visible);
      }
    } finally { await fs.rm(dir, {recursive:true,force:true}); }
  });
});
