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

export function includeSamVoice<T extends ElevenLabsCatalogVoice>(voices: T[]): T[] {
  const hasSam = voices.some((voice) => {
    const name = voice.name.trim().toLowerCase();
    return name === "sam" || voice.voice_id === SAM_ELEVENLABS_VOICE.voice_id;
  });
  if (hasSam) return voices;
  return [...voices, SAM_ELEVENLABS_VOICE as T];
}
