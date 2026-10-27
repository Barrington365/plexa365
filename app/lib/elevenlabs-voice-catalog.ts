export type ElevenLabsCatalogVoice = {
  voice_id: string;
  name: string;
  description?: string;
  category?: string;
  labels?: Record<string, string>;
  is_default?: boolean;
};

/** Public ElevenLabs premade voice. Legacy library lists often omit it. */
export const SAM_ELEVENLABS_VOICE: ElevenLabsCatalogVoice = {
  voice_id: "yoZ06aMxZJJ28mfd3POQ",
  name: "Sam",
  category: "premade",
  is_default: true,
  labels: { gender: "male", accent: "American", age: "young", use_case: "narration" },
};

/** Voice types the connected account can be entitled to. The public shared library is not included. */
export const ACCOUNT_VOICE_TYPES = ["personal", "workspace", "saved", "default", "non-default"] as const;

export type AccountVoicePage = {
  voiceType: string | null;
  status: number;
  voices: ElevenLabsCatalogVoice[];
  hasMore: boolean;
  truncated?: boolean;
};

export type AccountVoice = ElevenLabsCatalogVoice & {
  accountVoiceType?: string;
  groupLabel: string;
};

function isAccountOwned(voice: ElevenLabsCatalogVoice, voiceType: string | null): boolean {
  if (voiceType === "personal" || voiceType === "workspace" || voiceType === "saved") return true;
  const category = String(voice.category ?? "").toLowerCase();
  return (
    category === "cloned" ||
    category === "generated" ||
    category === "professional" ||
    category === "fine_tuned" ||
    category === "custom" ||
    category === "instant"
  );
}

export function groupLabelForAccountVoice(voice: ElevenLabsCatalogVoice, voiceType: string | null): string {
  if (isAccountOwned(voice, voiceType)) return "My voices";
  const gender = String(voice.labels?.gender ?? "").toLowerCase().trim();
  if (gender === "female") return "Female";
  if (gender === "male") return "Male";
  if (voice.category === "premade" || voice.is_default) return "Unspecified";
  return "Other";
}

/**
 * Combine every page the account API returned. Voices that were not in those pages are left out.
 * The first page that names a voice keeps its type, so a saved voice is not reclassified as a generic premade.
 */
export function reduceAccountVoicePages(pages: AccountVoicePage[]): {
  voices: AccountVoice[];
  status: "ok" | "auth_failed" | "empty";
  truncated: boolean;
  voiceTypes: string[];
} {
  if (pages.some((page) => page.status === 401 || page.status === 403)) {
    return { voices: [], status: "auth_failed", truncated: false, voiceTypes: [] };
  }
  const seen = new Set<string>();
  const voices: AccountVoice[] = [];
  const voiceTypes: string[] = [];
  let truncated = false;
  for (const page of pages) {
    if (page.truncated) truncated = true;
    const typeLabel = page.voiceType ?? "all";
    if (!voiceTypes.includes(typeLabel)) voiceTypes.push(typeLabel);
    for (const voice of page.voices) {
      const id = String(voice.voice_id ?? "").trim();
      const name = String(voice.name ?? "").trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      voices.push({
        ...voice,
        voice_id: id,
        name,
        accountVoiceType: page.voiceType ?? undefined,
        groupLabel: groupLabelForAccountVoice(voice, page.voiceType),
      });
    }
  }
  voices.sort((a, b) => {
    const mineA = a.groupLabel === "My voices";
    const mineB = b.groupLabel === "My voices";
    if (mineA !== mineB) return mineA ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    voices,
    status: voices.length > 0 ? "ok" : "empty",
    truncated,
    voiceTypes,
  };
}

export type ListedVoice = {
  voiceId: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

/** Hide rows for the current search. The selected voice stays visible so the control does not drop it. */
export function filterListedVoices<T extends ListedVoice>(
  voices: T[],
  options: { search?: string; useCase?: string; selectedId?: string },
): T[] {
  const search = options.search?.trim().toLowerCase() ?? "";
  const useCase = options.useCase?.trim() ?? "";
  return voices.filter((voice) => {
    if (options.selectedId && voice.voiceId === options.selectedId) return true;
    if (useCase && useCase !== "All" && voice.labels?.use_case?.trim() !== useCase) return false;
    if (!search) return true;
    const haystack = [voice.name, voice.category, voice.voiceId, voice.labels?.accent, voice.labels?.use_case]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

/** Premade IDs used when the account voice request returns nothing. This is not the account catalogue. */
export const PREMADE_FALLBACK_VOICES: ElevenLabsCatalogVoice[] = [
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

export function includeSamVoice<T extends ElevenLabsCatalogVoice>(voices: T[]): T[] {
  const hasSam = voices.some((voice) => {
    const name = voice.name.trim().toLowerCase();
    return name === "sam" || voice.voice_id === SAM_ELEVENLABS_VOICE.voice_id;
  });
  if (hasSam) return voices;
  return [...voices, SAM_ELEVENLABS_VOICE as T];
}
