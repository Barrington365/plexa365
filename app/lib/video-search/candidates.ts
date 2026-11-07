export type LandscapeStatus = "verified" | "unverified" | "vertical";
export type VideoDiscovery = "youtube" | "loop-feed" | "url";

export type VideoCandidate = {
  videoId: string;
  url: string;
  title: string;
  creator: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  durationLabel: string;
  landscape: LandscapeStatus;
  landscapeLabel: string;
  rightsStatus: "approved" | "pending" | "rejected";
  discovery: VideoDiscovery;
  matchText?: string;
};

export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Duration not supplied";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

/** Pixel size is not available from a public YouTube search or oEmbed response. */
export function landscapeStatus(input: { url: string; title: string }): LandscapeStatus {
  const blob = `${input.url} ${input.title}`.toLowerCase();
  if (blob.includes("/shorts/") || blob.includes("#shorts")) return "vertical";
  return "unverified";
}

export function landscapeLabel(status: LandscapeStatus): string {
  if (status === "verified") return "Landscape verified";
  if (status === "vertical") return "Vertical";
  return "Landscape not verified";
}
