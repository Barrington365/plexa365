export type VideoSearchBuildState = "Not Started" | "In Progress" | "Blocked" | "Complete";

export type VideoSearchBuildItem = {
  id: string;
  label: string;
  status: VideoSearchBuildState;
  note: string;
};

/** Phase 1 status. A row is Complete only after the check named in the note. */
export const VIDEO_SEARCH_BUILD_STATUS: VideoSearchBuildItem[] = [
  { id: "github", label: "GitHub review", status: "Complete", note: "yt-dlp stays a later option. Phase 1 does not add yt-dlp, yt-dlp-web, Video.js, or another FFmpeg." },
  { id: "tools", label: "Tools page", status: "Complete", note: "YouTube Video Download is now Video Search & Import." },
  { id: "search", label: "YouTube search", status: "Blocked", note: "Pasted URLs work. Keyword search reads YOUTUBE_API_KEY or Admin provider settings. Neither is configured on this server." },
  { id: "preview", label: "Video previews", status: "Complete", note: "Playback uses the existing youtubeEmbedUrl embed." },
  { id: "clip", label: "Clip editor", status: "Complete", note: "Start and end preview in the embed. FFmpeg arguments are prepared and not run against YouTube." },
  { id: "import", label: "Authorised MP4 import", status: "Blocked", note: "The button stays disabled until evidence, commercial use, editing, distribution, an approver, and a library MP4 are recorded." },
  { id: "library", label: "Media Library", status: "Complete", note: "Rights fields extend the existing library metadata index. No second library." },
  { id: "timeline", label: "Timeline integration", status: "Not Started", note: "Next stage, after Phase 1. Naomi's narration is unchanged." },
  { id: "agents", label: "Bob and Fiddle", status: "Not Started", note: "Next stage. Agents stay paused and cannot treat a public video as reusable." },
  { id: "hollywoodbets", label: "Hollywoodbets LIVE footage sheet", status: "Blocked", note: "Sheet checked 2026-11-07T13:51:45Z. Narration and timeline unchanged. Arsenal returned 3 pending Loop Feed videos. United and Formula 1 returned none until the YouTube key is configured." },
];
