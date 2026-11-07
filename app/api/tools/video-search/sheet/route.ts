import { NextResponse } from "next/server";
import { searchVideos } from "@/app/lib/video-search/search";
import { HOLLYWOODBETS_STORIES, selectStoryCandidates } from "@/app/lib/video-search/stories";
import type { VideoCandidate } from "@/app/lib/video-search/candidates";

export const dynamic = "force-dynamic";

export async function POST() {
  const stories = [];
  for (const story of HOLLYWOODBETS_STORIES) {
    const found: VideoCandidate[] = [];
    let notice = "";
    let searchedAt: string | undefined;
    // This fixed rundown keeps the editorial order of its reviewed footage.
    // Refresh each candidate's metadata and rights when rebuilding the sheet.
    if (story.reviewedVideoIds) {
      const checks = await Promise.allSettled(story.reviewedVideoIds.map(videoId =>
        searchVideos({ url: `https://www.youtube.com/watch?v=${videoId}` })
      ));
      for (const check of checks) {
        if (check.status === "fulfilled") {
          found.push(...check.value.results.filter(row => row.landscape !== "vertical"));
        }
      }
      stories.push({ ...story, notice: "Editorial shortlist. Check rights before use.", searchedAt: new Date().toISOString(), candidates: found });
      continue;
    }
    for (const query of story.queries) {
      const search = await searchVideos({ query });
      found.push(...search.results);
      notice = search.notice;
      searchedAt = search.searchedAt ?? searchedAt;
    }
    const candidates = selectStoryCandidates(found, story.requiredTerms, 5);
    stories.push({
      ...story,
      notice,
      searchedAt,
      candidates,
    });
  }
  return NextResponse.json({
    project: "Hollywoodbets LIVE",
    narration: "unchanged",
    timeline: "unchanged",
    stories,
  });
}
