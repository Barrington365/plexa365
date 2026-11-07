import type { VideoCandidate } from "@/app/lib/video-search/candidates";

export type HollywoodbetsStory = {
  id: string;
  brand: string;
  article: string;
  subjects: string[];
  queries: string[];
  reviewedVideoIds?: string[];
  requiredTerms: string[];
};

/** Naomi Carter's existing rundown. Searching these stories does not edit the project. */
export const HOLLYWOODBETS_STORIES: HollywoodbetsStory[] = [
  {
    id: "teamtalk-shaw",
    brand: "TEAMtalk",
    reviewedVideoIds: ["6V2KLxPi-uI", "IvMNfbrtEg4", "LI9vkI7O1Bs", "qlfJ_9qRE7M", "-OUDNoqSr2I"],
    article: "Manchester United, Fabrizio Romano, January striker search and Luke Shaw",
    subjects: ["Manchester United", "Fabrizio Romano", "Luke Shaw"],
    queries: ["Manchester United Fabrizio Romano January striker Luke Shaw 2026 November", "Manchester United January striker transfer plans November 2026", "Luke Shaw interview Manchester United"],
    requiredTerms: ["romano", "shaw", "striker", "january"],
  },
  {
    id: "football365-rice",
    brand: "Football365",
    reviewedVideoIds: ["nCmB5mx3BGk", "c-t6NawbrkY", "E5a6tWdxXw4", "1I9sQdoOUkc", "9pm0Mv8WVz4"],
    article: "Arsenal, Mikel Arteta, Declan Rice and Slavia Prague",
    subjects: ["Arsenal", "Mikel Arteta", "Declan Rice", "Slavia Prague"],
    queries: ["Slavia Prague Arsenal 1-2 highlights Declan Rice", "Arteta Rice 90 minutes Slavia Arsenal Champions League", "Mikel Arteta press conference Slavia Prague"],
    requiredTerms: ["arteta", "rice", "slavia", "1-2", "2-1"],
  },
  {
    id: "planetf1-lawson",
    brand: "PlanetF1",
    reviewedVideoIds: ["fR0wPksSJ3s", "TiMAhzNr_UI", "DRLDTkFlnh0", "BRGmt0Pugek", "yduTPs-RdmI"],
    article: "Liam Lawson, Racing Bulls and Karun Chandhok",
    subjects: ["Liam Lawson", "Racing Bulls", "Karun Chandhok"],
    queries: ["Liam Lawson Racing Bulls interview", "Karun Chandhok Liam Lawson", "Liam Lawson Racing Bulls 2027 seat interview future"],
    requiredTerms: ["lawson", "chandhok", "racing bulls", "2027"],
  },
];

const PRIORITY_SOURCES = [
  "manchester united",
  "arsenal",
  "fabrizio romano",
  "sky sports",
  "tnt sports",
  "bbc sport",
  "premier league",
  "cbs sports",
  "formula 1",
  "visa cash app rb",
];

export function storyRelevance(row: Pick<VideoCandidate, "title" | "creator" | "matchText">, requiredTerms: string[]): number {
  const haystack = `${row.title} ${row.creator} ${row.matchText ?? ""}`.toLowerCase();
  return requiredTerms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? 1 : 0), 0);
}

export function isPrioritySource(creator: string): boolean {
  const name = creator.trim().toLowerCase();
  return PRIORITY_SOURCES.some((brand) => name === brand || name.startsWith(`${brand} `));
}

/** Official channels, broadcasters, interviews and direct title matches rank first. Duration is not a landscape signal. */
export function candidateRank(row: Pick<VideoCandidate, "title" | "creator" | "matchText" | "landscape" | "durationSeconds">, requiredTerms: string[]): number {
  const title = row.title.toLowerCase();
  const extra = `${row.creator} ${row.matchText ?? ""}`.toLowerCase();
  let score = 0;
  for (const term of requiredTerms) {
    const needle = term.toLowerCase();
    if (title.includes(needle)) score += 5;
    else if (extra.includes(needle)) score += 1;
  }
  const titleHits = requiredTerms.filter((term) => title.includes(term.toLowerCase())).length;
  if (titleHits >= 2) score += 6;
  if (isPrioritySource(row.creator)) score += 4;
  if (/\b(interview|interveiw|press conference|post-race|post race)\b/i.test(row.title)) score += 3;
  if (row.landscape === "verified") score += 2;
  if (/\b(blasts|pranks?|watchalong|compilation|trivia|quiz)\b/i.test(row.title)) score -= 18;
  if (row.durationSeconds != null && row.durationSeconds < 15) score -= 6;
  if (requiredTerms.includes("slavia") && /europa league|0-4|1-1/i.test(title)) score -= 30;
  return score;
}

export function selectStoryCandidates(rows: VideoCandidate[], requiredTerms: string[], limit = 5): VideoCandidate[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (row.landscape === "vertical" || seen.has(row.videoId)) return false;
      seen.add(row.videoId);
      return storyRelevance(row, requiredTerms) > 0;
    })
    .sort((a, b) => candidateRank(b, requiredTerms) - candidateRank(a, requiredTerms) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
