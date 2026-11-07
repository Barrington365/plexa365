import { landscapeLabel, landscapeStatus, type LandscapeStatus, type VideoCandidate } from "@/app/lib/video-search/candidates";

/** A wider original frame is landscape. A taller one is portrait. A missing frame stays unknown. */
export function landscapeFromOriginalFrame(width: number, height: number): Exclude<LandscapeStatus, "unverified"> | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (height > width) return "vertical";
  if (width > height) return "verified";
  return null;
}

export function decideLandscape(input: {
  url: string;
  title: string;
  confirmedShort: boolean;
  frame: { width: number; height: number } | null;
}): LandscapeStatus {
  if (landscapeStatus({ url: input.url, title: input.title }) === "vertical" || input.confirmedShort) return "vertical";
  if (!input.frame) return "unverified";
  return landscapeFromOriginalFrame(input.frame.width, input.frame.height) ?? "unverified";
}

async function confirmedYouTubeShort(videoId: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "plexa-video-search/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      return (response.headers.get("location") ?? "").includes("/shorts/");
    }
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes(`rel="canonical" href="https://www.youtube.com/shorts/${videoId}"`);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the dimensions of a video rendition from YouTube's watch-page metadata. */
async function originalAspectFrame(videoId: string): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const metadata = html.match(/(?:var\s+)?ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!metadata) return null;
    const player = JSON.parse(metadata[1]);
    if (player.videoDetails?.videoId !== videoId || player.playabilityStatus?.status !== "OK") return null;
    const formats = player.streamingData?.adaptiveFormats ?? [];
    return formats.find((format: { mimeType?: string; width?: number; height?: number }) =>
      format.mimeType?.startsWith("video/") && Number(format.width) > 0 && Number(format.height) > 0
    ) ?? null;
  } catch {
    return null;
  }
}

export async function annotateLandscape(rows: VideoCandidate[]): Promise<VideoCandidate[]> {
  const measured = await Promise.all(rows.map(async (row) => {
    if (row.landscape === "vertical") return row;
    const [confirmedShort, frame] = await Promise.all([
      confirmedYouTubeShort(row.videoId),
      originalAspectFrame(row.videoId),
    ]);
    const landscape = decideLandscape({ url: row.url, title: row.title, confirmedShort, frame });
    return { ...row, landscape, landscapeLabel: landscapeLabel(landscape) };
  }));
  return measured;
}
