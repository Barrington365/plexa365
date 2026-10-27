import { describe, expect, it } from "vitest";
import { mergeLibraryVideoCatalog } from "@/app/lib/library-video-catalog";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { parseApiJson } from "@/app/lib/parse-api-json";

const eddie: ManifestEntry = {
  id: "news-eddie",
  format: "news-shorts",
  createdAt: "2026-10-27T11:00:00.000Z",
  video: "video/news-eddie-short.mp4",
  subtitles: "subtitles/news-eddie.srt",
  images: [],
};

describe("mergeLibraryVideoCatalog", () => {
  it("keeps a blob MP4 visible when the worker disk and manifest are empty", () => {
    const catalog = mergeLibraryVideoCatalog({
      manifest: [],
      diskVideos: [],
      blobVideos: [{ rel: "video/news-1793101127041-short.mp4", mtimeMs: Date.parse("2026-10-27T11:40:00.000Z") }],
    });
    expect(catalog.videos.map((video) => video.rel)).toEqual(["video/news-1793101127041-short.mp4"]);
    expect(catalog.manifest).toHaveLength(1);
    expect(catalog.manifest[0]).toMatchObject({
      id: "news-1793101127041",
      format: "news-shorts",
      video: "video/news-1793101127041-short.mp4",
      createdAt: "2026-10-27T11:40:00.000Z",
    });
  });

  it("does not invent a saved time when the blob has no upload time", () => {
    const catalog = mergeLibraryVideoCatalog({
      manifest: [],
      diskVideos: [],
      blobVideos: [{ rel: "video/news-1-short.mp4", mtimeMs: 0 }],
    });
    expect(catalog.manifest[0]?.createdAt).toBe("");
    expect(catalog.videos).toHaveLength(1);
  });

  it("does not duplicate a build that is already in the durable manifest", () => {
    const catalog = mergeLibraryVideoCatalog({
      manifest: [eddie],
      diskVideos: [],
      blobVideos: [{ rel: "video/news-eddie-short.mp4", mtimeMs: 10 }],
    });
    expect(catalog.manifest).toHaveLength(1);
    expect(catalog.manifest[0]?.seoTitle).toBeUndefined();
    expect(catalog.videos).toHaveLength(1);
  });

  it("merges the same file from disk and blob once", () => {
    const catalog = mergeLibraryVideoCatalog({
      manifest: [],
      diskVideos: [{ rel: "video/news-1-short.mp4", mtimeMs: 5 }],
      blobVideos: [{ rel: "video/news-1-short.mp4", mtimeMs: 9 }],
    });
    expect(catalog.videos).toEqual([{ rel: "video/news-1-short.mp4", mtimeMs: 9 }]);
    expect(catalog.manifest).toHaveLength(1);
  });
});

describe("parseApiJson", () => {
  it("reports an HTML gateway response instead of a JSON syntax error", async () => {
    const res = new Response("<!DOCTYPE html><html><title>Timeout</title><body>502</body></html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    await expect(parseApiJson(res)).rejects.toThrow(/HTML instead of JSON \(HTTP 502: Timeout\)/);
  });
});
