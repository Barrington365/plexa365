import { contentIdFromVideoFilename, type ManifestEntry } from "./asset-manifest";

export type LibraryVideoFile = {
  rel: string;
  mtimeMs: number;
};

function normaliseRel(rel: string): string {
  return rel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function createdAtMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryForSavedVideo(video: LibraryVideoFile): ManifestEntry {
  const id = contentIdFromVideoFilename(video.rel) ?? video.rel.replace(/^video\//, "").replace(/\.mp4$/i, "");
  return {
    id,
    format: id.startsWith("news-") ? "news-shorts" : "video",
    createdAt: video.mtimeMs > 0 ? new Date(video.mtimeMs).toISOString() : "",
    video: video.rel,
    subtitles: "",
    images: [],
  };
}

/**
 * Builds and Videos come from the durable manifest plus every saved MP4.
 * A completed encode is not a library row until its file or manifest entry is in this catalog.
 */
export function mergeLibraryVideoCatalog(input: {
  manifest: ManifestEntry[];
  diskVideos: LibraryVideoFile[];
  blobVideos: LibraryVideoFile[];
}): { manifest: ManifestEntry[]; videos: LibraryVideoFile[] } {
  const byRel = new Map<string, LibraryVideoFile>();
  for (const file of [...input.diskVideos, ...input.blobVideos]) {
    const rel = normaliseRel(file.rel);
    if (!rel.startsWith("video/") || !rel.toLowerCase().endsWith(".mp4")) continue;
    const current = byRel.get(rel);
    if (!current || file.mtimeMs > current.mtimeMs) byRel.set(rel, { rel, mtimeMs: file.mtimeMs });
  }
  const videos = [...byRel.values()].sort((a, b) => b.mtimeMs - a.mtimeMs || a.rel.localeCompare(b.rel));

  const referenced = new Set<string>();
  for (const row of input.manifest) {
    const video = normaliseRel(row.video || "");
    const edited = normaliseRel(row.editedVideo || "");
    if (video) referenced.add(video);
    if (edited) referenced.add(edited);
  }
  const recovered = videos.filter((video) => !referenced.has(video.rel)).map(entryForSavedVideo);
  const manifest = [...input.manifest, ...recovered].sort((a, b) => {
    const delta = createdAtMs(b.createdAt) - createdAtMs(a.createdAt);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
  return { manifest, videos };
}

