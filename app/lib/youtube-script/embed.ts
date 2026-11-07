export function youtubeEmbedUrl(videoId: string, range?: { startSeconds?: number; endSeconds?: number }): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`);
  const start = range?.startSeconds;
  const end = range?.endSeconds;
  if (typeof start === "number" && Number.isFinite(start) && start > 0) url.searchParams.set("start", String(Math.floor(start)));
  if (typeof end === "number" && Number.isFinite(end) && end > 0) url.searchParams.set("end", String(Math.floor(end)));
  return url.toString();
}
