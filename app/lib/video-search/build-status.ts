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
  { id: "search", label: "YouTube search", status: "Complete", note: "Keyword search checked 2026-11-07T14:11:27Z after the YouTube Data API key was saved in Admin. The browser does not receive the key. Format checks use video rendition dimensions and exclude confirmed Shorts and portrait footage. Missing dimensions stay unverified." },
  { id: "preview", label: "Video previews", status: "Complete", note: "All 15 shortlisted previews played in Chrome with a decoded landscape frame. The sheet opens each candidate in the existing YouTube player." },
  { id: "clip", label: "Clip editor", status: "Complete", note: "Start and end preview in the embed. FFmpeg arguments are prepared and not run against YouTube." },
  { id: "import", label: "Authorised MP4 import", status: "Blocked", note: "All 15 test imports returned HTTP 403. Approval requires an authenticated Admin, licence evidence, commercial, editing and distribution rights, and the matching Library MP4." },
  { id: "library", label: "Media Library", status: "Complete", note: "Rights fields extend the existing library metadata index. No second library." },
  { id: "timeline", label: "Timeline integration", status: "Not Started", note: "Next stage, after Phase 1. Naomi's narration is unchanged." },
  { id: "agents", label: "Bob and Fiddle", status: "Not Started", note: "Next stage. Agents stay paused and cannot treat a public video as reusable." },
  { id: "hollywoodbets", label: "Hollywoodbets LIVE footage sheet", status: "Complete", note: "7 November 2026: five reviewed landscape previews per story. All 15 require rights approval. Secondary analysis and archive interviews provide context only." },
];
