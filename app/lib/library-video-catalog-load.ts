import fs from "fs/promises";
import path from "path";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { readStoredManifest } from "@/app/lib/asset-manifest-store";
import { mergeLibraryVideoCatalog, type LibraryVideoFile } from "@/app/lib/library-video-catalog";
import { outputVideoDir } from "@/app/lib/paths";
import { listPersistedVideoOutputRels } from "@/app/lib/video-blob-assets";

async function listDiskVideos(): Promise<LibraryVideoFile[]> {
  const videos: LibraryVideoFile[] = [];
  try {
    const dir = outputVideoDir();
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".mp4")) continue;
      const stat = await fs.stat(path.join(dir, file));
      videos.push({ rel: `video/${file}`, mtimeMs: stat.mtimeMs });
    }
  } catch {
    /* output/video is empty on a fresh Lambda */
  }
  return videos;
}

export async function loadLibraryVideoCatalog(): Promise<{ manifest: ManifestEntry[]; videos: LibraryVideoFile[] }> {
  const [manifest, diskVideos, blobVideos] = await Promise.all([
    readStoredManifest(),
    listDiskVideos(),
    listPersistedVideoOutputRels(),
  ]);
  return mergeLibraryVideoCatalog({ manifest, diskVideos, blobVideos });
}
