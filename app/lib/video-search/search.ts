import { getServerSecretAsync } from "@/app/lib/server-secrets";
import { parseLoopFeedPreviewItems } from "@/app/lib/data-studio/loop-feed-preview";
import { toLoopTopicContentUrl } from "@/app/lib/data-studio/loop-feed";
import { fetchYouTubeMetadata } from "@/app/lib/youtube-script/metadata";
import { canonicalYouTubeUrl, extractYouTubeVideoId } from "@/app/lib/youtube-script/utils";
import { formatDuration, landscapeLabel, landscapeStatus, type VideoCandidate } from "@/app/lib/video-search/candidates";
import { readFootageRights } from "@/app/lib/video-search/store";
import loopFeedTeamsCatalog from "@/data/loop-feed-teams.catalog.json";

const STOP = new Set(["with", "from", "this", "that", "interview", "press", "conference", "video", "videos"]);

type SearchResponse = {
  results: VideoCandidate[];
  notice: string;
  searchedAt?: string;
};

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

function candidateFrom(input: Omit<VideoCandidate, "durationLabel" | "landscapeLabel" | "rightsStatus"> & { rightsStatus?: VideoCandidate["rightsStatus"] }): VideoCandidate {
  return {
    ...input,
    durationLabel: formatDuration(input.durationSeconds),
    landscapeLabel: landscapeLabel(input.landscape),
    rightsStatus: input.rightsStatus ?? "pending",
  };
}

async function withRights(rows: VideoCandidate[]): Promise<VideoCandidate[]> {
  const next: VideoCandidate[] = [];
  for (const row of rows) {
    const rights = await readFootageRights(row.videoId);
    next.push({ ...row, rightsStatus: rights?.status ?? "pending" });
  }
  return next;
}

async function youtubeKeywordSearch(query: string, apiKey: string): Promise<{ rows: VideoCandidate[]; unavailable: boolean }> {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("type", "video");
  endpoint.searchParams.set("q", query.slice(0, 120));
  endpoint.searchParams.set("maxResults", "10");
  endpoint.searchParams.set("videoEmbeddable", "true");
  endpoint.searchParams.set("safeSearch", "moderate");
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint);
  if (!response.ok) return { rows: [], unavailable: true };
  const data = (await response.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> } }> };
  const ids = (data.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  const durations = new Map<string, number>();
  if (ids.length) {
    const details = new URL("https://www.googleapis.com/youtube/v3/videos");
    details.searchParams.set("part", "contentDetails");
    details.searchParams.set("id", ids.join(","));
    details.searchParams.set("key", apiKey);
    const detailResponse = await fetch(details);
    if (detailResponse.ok) {
      const detailData = (await detailResponse.json()) as { items?: Array<{ id?: string; contentDetails?: { duration?: string } }> };
      for (const item of detailData.items ?? []) {
        const seconds = isoDuration(item.contentDetails?.duration);
        if (item.id && seconds != null) durations.set(item.id, seconds);
      }
    }
  }
  const rows = (data.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title?.trim();
    if (!videoId || !title) return [];
    const url = canonicalYouTubeUrl(videoId);
    const landscape = landscapeStatus({ url, title });
    return [candidateFrom({
      videoId,
      url,
      title,
      creator: item.snippet?.channelTitle?.trim() || "Unknown creator",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url,
      durationSeconds: durations.get(videoId),
      landscape,
      discovery: "youtube",
      matchText: title,
    })];
  });
  return { rows, unavailable: false };
}

function isoDuration(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

async function loopFeedSearch(query: string): Promise<VideoCandidate[]> {
  const catalog = loopFeedTeamsCatalog as { teams?: Array<{ name?: string; feedType?: string; topicUrl?: string; active?: boolean }> };
  const needle = query.toLowerCase();
  const topics = (catalog.teams ?? [])
    .filter((team) => team.active !== false && team.topicUrl && team.name && needle.includes(team.name.toLowerCase()))
    .sort((a, b) => Number(b.feedType === "match_videos") - Number(a.feedType === "match_videos"))
    .slice(0, 2);
  const words = tokens(query);
  const rows: VideoCandidate[] = [];
  for (const topic of topics) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const auth = process.env.LOOP_FEED_AUTHORIZATION?.trim();
      const headers: HeadersInit = { Accept: "application/json", "User-Agent": "plexa-video-search/1.0" };
      if (auth) headers.Authorization = auth;
      const topicUrl = new URL(toLoopTopicContentUrl(topic.topicUrl!));
      topicUrl.searchParams.set("limit", "50");
      const response = await fetch(topicUrl, { headers, cache: "no-store", signal: controller.signal });
      if (!response.ok) continue;
      const items = parseLoopFeedPreviewItems(await response.json(), topic.name ?? "Loop Feed", 50);
      for (const item of items) {
        if (!item.youtubeVideoId || item.youtubeVideoId.length !== 11) continue;
        const haystack = `${item.title} ${item.textPlain}`.toLowerCase();
        if (words.length && !words.some((word) => haystack.includes(word))) continue;
        const url = item.postUrl.startsWith("http") ? item.postUrl : canonicalYouTubeUrl(item.youtubeVideoId);
        rows.push(candidateFrom({
          videoId: item.youtubeVideoId,
          url,
          title: item.title,
          creator: item.channelName || topic.name || "Loop Feed",
          thumbnailUrl: item.thumbnailUrl,
          landscape: landscapeStatus({ url, title: item.title }),
          discovery: "loop-feed",
          matchText: item.textPlain,
        }));
      }
    } catch {
      /* One topic failing leaves the other sources available. */
    } finally {
      clearTimeout(timer);
    }
  }
  return rows;
}

function dedupe(rows: VideoCandidate[]): VideoCandidate[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.videoId)) return false;
    seen.add(row.videoId);
    return true;
  });
}

export async function searchVideos(input: { query?: string; url?: string }): Promise<SearchResponse> {
  const pasted = input.url?.trim() ?? "";
  const query = input.query?.trim() ?? "";
  if (!pasted && !query) return { results: [], notice: "Enter a keyword or paste a YouTube URL." };

  if (pasted) {
    const videoId = extractYouTubeVideoId(pasted);
    if (!videoId) return { results: [], notice: "That text is not a YouTube URL." };
    const meta = await fetchYouTubeMetadata(videoId);
    const landscape = landscapeStatus({ url: meta.url, title: meta.title });
    const [result] = await withRights([candidateFrom({
      videoId,
      url: meta.url,
      title: meta.title,
      creator: meta.channelName || "Unknown creator",
      thumbnailUrl: meta.thumbnailUrl,
      durationSeconds: meta.durationSeconds,
      landscape,
      discovery: "url",
    })]);
    return { results: result ? [result] : [], notice: "Metadata comes from the YouTube Script Importer. The video is not downloaded.", searchedAt: new Date().toISOString() };
  }

  const apiKey = await getServerSecretAsync("YOUTUBE_API_KEY");
  const loop = await loopFeedSearch(query);
  const youtube = apiKey ? await youtubeKeywordSearch(query, apiKey) : { rows: [], unavailable: false };
  const results = await withRights(dedupe([...loop, ...youtube.rows]).slice(0, 12));
  if (!results.length) {
    const notice = apiKey
      ? youtube.unavailable
        ? "The YouTube Data API did not return results. Loop Feed had no matching YouTube item. Nothing was downloaded."
        : "No matching videos were returned. Nothing was downloaded."
      : "YouTube keyword search needs YOUTUBE_API_KEY, or the same key saved in Admin provider settings. Loop Feed had no matching YouTube item. A pasted URL still works.";
    return { results: [], notice };
  }
  const notice = apiKey
    ? "Loop Feed matches come first when a catalog team is named. Further rows come from the YouTube Data API. Nothing is downloaded."
    : "YouTube keyword search needs YOUTUBE_API_KEY, or the same key saved in Admin provider settings. These rows are Loop Feed matches. A pasted URL still works.";
  return { results, notice, searchedAt: new Date().toISOString() };
}
