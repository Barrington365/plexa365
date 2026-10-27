import { NextResponse } from "next/server";
import {
  ACCOUNT_VOICE_TYPES,
  groupLabelForAccountVoice,
  includeSamVoice,
  PREMADE_FALLBACK_VOICES,
  reduceAccountVoicePages,
  type AccountVoicePage,
} from "@/app/lib/elevenlabs-voice-catalog";
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

type VoiceListPage = {
  voices?: ElevenLabsVoice[];
  has_more?: boolean;
  next_page_token?: string | null;
};

const VOICE_PAGE_LIMIT = 20;

function voiceListUrl(voiceType: string | null, pageToken: string | null): string {
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("sort", "name");
  url.searchParams.set("sort_direction", "asc");
  url.searchParams.set("include_total_count", "false");
  if (voiceType) url.searchParams.set("voice_type", voiceType);
  if (pageToken) url.searchParams.set("next_page_token", pageToken);
  return url.toString();
}

async function fetchAccountVoicePages(key: string): Promise<AccountVoicePage[]> {
  const pages: AccountVoicePage[] = [];
  const types: Array<string | null> = [null, ...ACCOUNT_VOICE_TYPES];
  for (const voiceType of types) {
    let pageToken: string | null = null;
    for (let page = 0; page < VOICE_PAGE_LIMIT; page += 1) {
      const res = await fetch(voiceListUrl(voiceType, pageToken), {
        headers: { "xi-api-key": key },
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        pages.push({ voiceType, status: res.status, voices: [], hasMore: false });
        return pages;
      }
      if (!res.ok) {
        pages.push({ voiceType, status: res.status, voices: [], hasMore: false });
        break;
      }
      const data = (await res.json()) as VoiceListPage;
      const voices = Array.isArray(data.voices) ? data.voices : [];
      const hasMore = data.has_more === true && Boolean(data.next_page_token);
      pages.push({
        voiceType,
        status: res.status,
        voices,
        hasMore,
        truncated: hasMore && page === VOICE_PAGE_LIMIT - 1,
      });
      if (!hasMore) break;
      pageToken = data.next_page_token ?? null;
    }
  }

  const legacy = await fetch("https://api.elevenlabs.io/v1/voices?show_legacy=true", {
    headers: { "xi-api-key": key },
    cache: "no-store",
  });
  if (legacy.status === 401 || legacy.status === 403) {
    pages.push({ voiceType: "legacy", status: legacy.status, voices: [], hasMore: false });
    return pages;
  }
  if (!legacy.ok) {
    pages.push({ voiceType: "legacy", status: legacy.status, voices: [], hasMore: false });
  } else {
    const data = (await legacy.json()) as VoiceListPage;
    pages.push({
      voiceType: "legacy",
      status: legacy.status,
      voices: Array.isArray(data.voices) ? data.voices : [],
      hasMore: false,
    });
  }
  return pages;
}

function unavailableResponse(status: "missing_key" | "network_error" | "auth_failed" | "empty") {
  return NextResponse.json({
    voices: [],
    diagnostics: {
      totalDefaults: 0,
      labelledDefaults: 0,
      unlabelledDefaults: 0,
      unlabelledVoiceNames: [],
      myVoicesCount: 0,
      accountVoiceCount: 0,
      truncated: false,
      voiceTypes: [],
    },
    source: "unavailable",
    status,
    catalogueNote:
      "Only voices returned for this ElevenLabs account are listed. Voices in the public library stay off this list until they are added to the account.",
  });
}

export async function GET() {
  const key = await getServerSecretAsync("ELEVENLABS_API_KEY");
  if (!key) return unavailableResponse("missing_key");

  try {
    const pages = await fetchAccountVoicePages(key);
    const account = reduceAccountVoicePages(pages);
    if (account.status === "auth_failed") return unavailableResponse("auth_failed");
    const accountListed = includeSamVoice(account.voices);
    const usingFallback = account.voices.length === 0;
    const listed = (usingFallback ? includeSamVoice(PREMADE_FALLBACK_VOICES) : accountListed).map((voice) => ({
      ...voice,
      groupLabel: "groupLabel" in voice && voice.groupLabel ? voice.groupLabel : groupLabelForAccountVoice(voice, null),
    }));
    const requestStatuses = pages.map((page) => ({
      voiceType: page.voiceType ?? "all",
      status: page.status,
      count: page.voices.length,
    }));
    const diagnostics = {
      ...buildDiagnostics(listed),
      accountVoiceCount: account.voices.length,
      truncated: account.truncated,
      voiceTypes: account.voiceTypes,
      requestStatuses,
    };
    return NextResponse.json({
      voices: listed.map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        description: voice.description,
        category: voice.category,
        labels: voice.labels,
        is_default: voice.is_default,
        groupLabel: voice.groupLabel,
        accountVoiceType: "accountVoiceType" in voice ? voice.accountVoiceType : undefined,
      })),
      diagnostics,
      source: usingFallback ? "fallback" : "elevenlabs",
      status: usingFallback ? "fallback" : "ok",
      catalogueNote: usingFallback
        ? "The connected account voice request did not return a catalogue. This is the premade fallback, including Sam. It is not every voice available to the account."
        : "These are the voices the connected account returned. Premade Sam stays listed when that response omits him. The rest of the public library is not listed.",
    });
  } catch {
    return unavailableResponse("network_error");
  }
}
