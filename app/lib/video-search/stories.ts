import type { VideoCandidate } from "@/app/lib/video-search/candidates";

export type HollywoodbetsStory = {
  id: string;
  brand: string;
  article: string;
  subjects: string[];
  queries: string[];
  requiredTerms: string[];
};

/** Naomi Carter's existing rundown. Searching these stories does not edit the project. */
export const HOLLYWOODBETS_STORIES: HollywoodbetsStory[] = [
  {
    id: "teamtalk-shaw",
    brand: "TEAMtalk",
    article: "Manchester United, Fabrizio Romano, January striker search and Luke Shaw",
    subjects: ["Manchester United", "Fabrizio Romano", "Luke Shaw"],
    queries: ["Fabrizio Romano Manchester United striker", "Luke Shaw Manchester United"],
    requiredTerms: ["romano", "shaw", "striker"],
  },
  {
    id: "football365-rice",
    brand: "Football365",
    article: "Arsenal, Mikel Arteta, Declan Rice and Slavia Prague",
    subjects: ["Arsenal", "Mikel Arteta", "Declan Rice", "Slavia Prague"],
    queries: ["Mikel Arteta Declan Rice Arsenal", "Arsenal Slavia Prague"],
    requiredTerms: ["arteta", "rice", "slavia"],
  },
  {
    id: "planetf1-lawson",
    brand: "PlanetF1",
    article: "Liam Lawson, Racing Bulls and Karun Chandhok",
    subjects: ["Liam Lawson", "Racing Bulls", "Karun Chandhok"],
    queries: ["Liam Lawson Racing Bulls", "Karun Chandhok Liam Lawson"],
    requiredTerms: ["lawson", "chandhok", "bulls"],
  },
];

export function storyRelevance(row: Pick<VideoCandidate, "title" | "creator" | "matchText">, requiredTerms: string[]): number {
  const haystack = `${row.title} ${row.creator} ${row.matchText ?? ""}`.toLowerCase();
  return requiredTerms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? 1 : 0), 0);
}

export function selectStoryCandidates(rows: VideoCandidate[], requiredTerms: string[], limit = 5): VideoCandidate[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (row.landscape === "vertical" || seen.has(row.videoId)) return false;
      seen.add(row.videoId);
      return storyRelevance(row, requiredTerms) > 0;
    })
    .sort((a, b) => storyRelevance(b, requiredTerms) - storyRelevance(a, requiredTerms) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
