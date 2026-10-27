import fs from "fs/promises";
import path from "path";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { readStoredManifest, writeStoredManifest } from "@/app/lib/asset-manifest-store";
import { deleteVoiceRecordingsForContentId } from "@/app/lib/editor-upload";
import { deleteVideoBlobAsset } from "@/app/lib/video-blob-assets";
import {
  editorUploadDir,
  libraryBackgroundImagesDir,
  outputDir,
  outputImagesDir,
  outputVideoDir,
} from "@/app/lib/paths";

export type { ManifestEntry } from "@/app/lib/asset-manifest";
export { contentIdFromVideoFilename } from "@/app/lib/asset-manifest";

function underOutput(abs: string): boolean {
  const root = path.resolve(outputDir());
  return abs === root || abs.startsWith(root + path.sep);
}

export type DeleteBuildOptions = {
  contentId: string;
  /**
   * When set (manifest row delete), only removes that row. On-disk assets are removed only if no
   * other manifest entry still uses this `contentId`. Omit for “video folder” delete: all manifest
   * rows for `contentId` are removed and assets are always deleted.
   */
  createdAt?: string;
};

/** Remove manifest row(s) and optionally on-disk assets for `contentId` (manifest `id`). */
export async function deleteBuildByContentId(
  contentId: string,
  options?: Pick<DeleteBuildOptions, "createdAt">,
): Promise<{ deleted: string[] }> {
  return deleteBuild({ contentId, ...options });
}

export async function deleteBuild(opts: DeleteBuildOptions): Promise<{ deleted: string[] }> {
  const { contentId, createdAt } = opts;
  const deleted: string[] = [];
  const root = path.resolve(outputDir());

  if (!contentId || contentId.includes("..") || contentId.includes("/") || contentId.includes("\\")) {
    throw new Error("Invalid content id");
  }

  let removeFilesForContentId = !createdAt;

  try {
    const list = await readStoredManifest();
    let next: ManifestEntry[];
    if (createdAt?.trim()) {
      const ts = createdAt.trim();
      next = list.filter((e) => !(e.id === contentId && e.createdAt === ts));
      removeFilesForContentId = !next.some((e) => e.id === contentId);
    } else {
      next = list.filter((e) => e.id !== contentId);
    }

    if (next.length !== list.length) {
      await writeStoredManifest(next);
      deleted.push("manifest");
    }
  } catch {
    /* no manifest */
  }

  if (!removeFilesForContentId) {
    return { deleted };
  }

  const tryFile = async (rel: string) => {
    const full = path.resolve(root, rel);
    if (!underOutput(full)) return;
    try {
      await fs.unlink(full);
      deleted.push(rel);
    } catch {
      /* missing */
    }
  };

  await tryFile(path.join("video", `${contentId}-short.mp4`));
  await tryFile(path.join("video", `${contentId}-short-edited.mp4`));
  await deleteVideoBlobAsset(path.join("video", `${contentId}-short.mp4`));
  await deleteVideoBlobAsset(path.join("video", `${contentId}-short-edited.mp4`));
  await tryFile(path.join("subtitles", `${contentId}.srt`));
  await tryFile(`concat-${contentId}.txt`);

  const imgDir = path.join(outputImagesDir(), contentId);
  try {
    await fs.rm(imgDir, { recursive: true, force: true });
    deleted.push(`images/${contentId}/`);
  } catch {
    /* missing */
  }

  try {
    await fs.rm(editorUploadDir(contentId), { recursive: true, force: true });
    deleted.push(`uploads/${contentId}/`);
  } catch {
    /* missing */
  }

  try {
    await fs.rm(libraryBackgroundImagesDir(contentId), { recursive: true, force: true });
    deleted.push(`images/library/${contentId}/`);
  } catch {
    /* missing */
  }

  await deleteVoiceRecordingsForContentId(contentId);

  const orphanedVideos = await cleanOrphanVideoFiles();
  deleted.push(...orphanedVideos);

  return { deleted };
}

export async function cleanOrphanVideoFiles(): Promise<string[]> {
  const deleted: string[] = [];
  const keep = new Set<string>();
  const manifest = await readStoredManifest();

  for (const row of manifest) {
    const main = String(row.video ?? "").trim().replace(/^\/+/, "");
    if (main.startsWith("video/") && main.toLowerCase().endsWith(".mp4")) keep.add(main);
    const edited = String(row.editedVideo ?? "").trim().replace(/^\/+/, "");
    if (edited.startsWith("video/") && edited.toLowerCase().endsWith(".mp4")) keep.add(edited);
  }

  let files: string[] = [];
  try {
    files = await fs.readdir(outputVideoDir());
  } catch {
    return deleted;
  }

  for (const name of files) {
    if (!name.toLowerCase().endsWith(".mp4")) continue;
    const rel = path.join("video", name);
    if (keep.has(rel)) continue;
    try {
      await fs.unlink(path.join(outputVideoDir(), name));
      deleted.push(rel);
    } catch {
      /* ignore races/missing */
    }
  }

  return deleted;
}
