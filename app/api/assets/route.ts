import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { loadLibraryVideoCatalog } from "@/app/lib/library-video-catalog-load";
import { outputDir, outputImagesDir } from "@/app/lib/paths";
import { scanBackdropVideoRels } from "@/app/lib/scan-backdrop-videos";

export async function GET() {
  try {
    const catalog = await loadLibraryVideoCatalog();
    const manifest = catalog.manifest;
    const videos = catalog.videos;

    const backdropVideos = await scanBackdropVideoRels();

    const imageFolders: string[] = [];
    try {
      const dir = outputImagesDir();
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) imageFolders.push(path.join("images", e.name));
      }
    } catch {
      /* empty */
    }

    return NextResponse.json({
      manifest,
      videos: videos.sort((a, b) => b.mtimeMs - a.mtimeMs || a.rel.localeCompare(b.rel)).map((item) => item.rel),
      backdropVideos,
      imageFolders,
      outputRoot: outputDir(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
