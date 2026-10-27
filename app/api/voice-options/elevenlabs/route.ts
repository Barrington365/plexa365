import { NextResponse } from "next/server";
import { includeSamVoice, SAM_ELEVENLABS_VOICE } from "@/app/lib/elevenlabs-voice-catalog";
import { getServerSecretAsync } from "@/app/lib/server-secrets";

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  description?: string;
  category?: string;
  labels?: Record<string, string>;
  is_default?: boolean;
};

function isLabelled(v: ElevenLabsVoice): boolean {
  return Boolean(v.labels && Object.keys(v.labels).length > 0);
}

function isMyVoice(v: ElevenLabsVoice): boolean {
  const c = String(v.category ?? "").toLowerCase();
  return (
    c === "cloned" ||
    c === "generated" ||
    c === "professional" ||
    c === "fine_tuned" ||
    c === "custom" ||
    c === "instant"
  );
}

function toVoiceResponse(v: ElevenLabsVoice) {
  return {
    ...v,
    groupLabel: groupLabelForVoice(v),
  };
}

function buildDiagnostics(voices: ElevenLabsVoice[]) {
  const labelled = voices.filter(isLabelled);
  const unlabelled = voices.filter((v) => !isLabelled(v));
  const mine = voices.filter(isMyVoice);
  return {
    totalDefaults: voices.length,
    labelledDefaults: labelled.length,
    unlabelledDefaults: unlabelled.length,
    unlabelledVoiceNames: unlabelled.map((v) => v.name).slice(0, 50),
    myVoicesCount: mine.length,
  };
}

function groupLabelForVoice(v: ElevenLabsVoice): string {
  if (isMyVoice(v)) return "My voices";
  const gender = String(v.labels?.gender ?? "").toLowerCase().trim();
  if (gender === "female") return "Female";
  if (gender === "male") return "Male";
  if (v.category === "premade" || v.is_default) return "Unspecified";
  return "Other";
}

const FALLBACK_DEFAULTS: ElevenLabsVoice[] = [
  { voice_id: "9BWtsMINqrJLrRacOk9x", name: "Aria", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
  { voice_id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
  { voice_id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
  { voice_id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", category: "premade", is_default: true, labels: { gender: "male", accent: "Australian" } },
  { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "premade", is_default: true, labels: { gender: "male", accent: "British" } },
  { voice_id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "SAz9YHcvj6GT2YYXdXww", name: "River", category: "premade", is_default: true, labels: { gender: "neutral", accent: "American" } },
  SAM_ELEVENLABS_VOICE,
  { voice_id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", category: "premade", is_default: true, labels: { gender: "female", accent: "Swedish" } },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "premade", is_default: true, labels: { gender: "female", accent: "British" } },
  { voice_id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
  { voice_id: "bIHbv24MWmeRgasZH58o", name: "Will", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
  { voice_id: "cjVigY5qzO86Huf0OWal", name: "Eric", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "iP95p4xoKVk53GoZ742B", name: "Chris", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", category: "premade", is_default: true, labels: { gender: "male", accent: "British" } },
  { voice_id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", category: "premade", is_default: true, labels: { gender: "female", accent: "British" } },
  { voice_id: "pqHfZKP75CvOlQylNhV4", name: "Bill", category: "premade", is_default: true, labels: { gender: "male", accent: "American" } },
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (legacy)", category: "premade", is_default: true, labels: { gender: "female", accent: "American" } },
];

type VoiceListPage = {
  voices?: ElevenLabsVoice[];
  has_more?: boolean;
  next_page_token?: string | null;
};

async function fetchVoicePage(url: string, key: string): Promise<VoiceListPage> {
  const res = await fetch(url, {
    headers: { "xi-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) return { voices: [] };
  const data = (await res.json()) as VoiceListPage;
  return {
    voices: Array.isArray(data.voices) ? data.voices : [],
    has_more: data.has_more === true,
    next_page_token: data.next_page_token ?? null,
  };
}

function addVoices(seen: Set<string>, voices: ElevenLabsVoice[], batch: ElevenLabsVoice[] | undefined) {
  for (const voice of batch ?? []) {
    const id = String(voice.voice_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    voices.push(voice);
  }
}

async function fetchAvailableVoices(key: string): Promise<ElevenLabsVoice[]> {
  const seen = new Set<string>();
  const voices: ElevenLabsVoice[] = [];

  let pageToken: string | null = null;
  for (let page = 0; page < 8; page += 1) {
    const url = new URL("https://api.elevenlabs.io/v2/voices");
    url.searchParams.set("page_size", "100");
    url.searchParams.set("sort", "name");
    url.searchParams.set("sort_direction", "asc");
    url.searchParams.set("include_total_count", "false");
    if (pageToken) url.searchParams.set("next_page_token", pageToken);
    const pageData = await fetchVoicePage(url.toString(), key);
    addVoices(seen, voices, pageData.voices);
    if (!pageData.has_more || !pageData.next_page_token) break;
    pageToken = pageData.next_page_token;
  }

  const samSearch = new URL("https://api.elevenlabs.io/v2/voices");
  samSearch.searchParams.set("search", "Sam");
  samSearch.searchParams.set("page_size", "100");
  samSearch.searchParams.set("include_total_count", "false");
  const samPage = await fetchVoicePage(samSearch.toString(), key);
  addVoices(seen, voices, samPage.voices);

  const legacy = await fetchVoicePage("https://api.elevenlabs.io/v1/voices?show_legacy=true", key);
  addVoices(seen, voices, legacy.voices);

  return voices;
}

export async function GET() {
  const key = await getServerSecretAsync("ELEVENLABS_API_KEY");
  if (!key) {
    const diagnostics = buildDiagnostics(FALLBACK_DEFAULTS);
    return NextResponse.json({
      voices: FALLBACK_DEFAULTS.map(toVoiceResponse),
      diagnostics,
      source: "fallback",
      status: "missing_key",
    });
  }

  try {
    const raw = await fetchAvailableVoices(key);
    /** Every voice the API key can use — premade library plus your cloned / generated / professional voices. */
    const all = raw.filter((v) => String(v.voice_id ?? "").trim() && String(v.name ?? "").trim());
    const sortForUi = (voices: ElevenLabsVoice[]) =>
      [...voices].sort((a, b) => {
        const ma = isMyVoice(a);
        const mb = isMyVoice(b);
        if (ma !== mb) return ma ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const sourceVoices = all.length > 0 ? sortForUi(includeSamVoice(all)) : FALLBACK_DEFAULTS;
    const diagnostics = buildDiagnostics(sourceVoices);
    return NextResponse.json({
      voices: sourceVoices.map(toVoiceResponse),
      diagnostics,
      source: all.length > 0 ? "elevenlabs" : "fallback",
      status: "ok",
    });
  } catch {
    const diagnostics = buildDiagnostics(FALLBACK_DEFAULTS);
    return NextResponse.json({
      voices: FALLBACK_DEFAULTS.map(toVoiceResponse),
      diagnostics,
      source: "fallback",
      status: "network_error",
    });
  }
}
