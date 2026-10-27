export type VoiceStyle = "Journalist" | "Punchy Tips" | "Calm / Studio" | "Fast Picks";
export type DeliveryStyle = "Smooth" | "Balanced" | "Fast";
export type ToneStyle = "Neutral" | "Confident" | "Urgent";
export type VoiceProviderPreference = "auto" | "elevenlabs" | "openai";
export type VoicePreset =
  | "Racing365 - British - Commentator"
  | "Female - Clean"
  | "Female - Energetic"
  | "Male - Broadcast"
  | "Male - Deep";

/** All presets shown in the voice settings dropdown (order = display order). */
export const VOICE_PRESET_OPTIONS: readonly VoicePreset[] = [
  "Racing365 - British - Commentator",
  "Female - Clean",
  "Female - Energetic",
  "Male - Broadcast",
  "Male - Deep",
];

export type VoiceoverVersions = {
  versionA: string;
  versionB: string;
  versionC: string;
};

export type ElevenlabsVoiceOption = {
  voiceId: string;
  name: string;
  description?: string;
  category?: string;
  groupLabel?: string;
  accountVoiceType?: string;
  labels?: Record<string, string>;
};

export type CreatorProfileOption = {
  id: string;
  name: string;
  brand: string;
  sports: string[];
  styleNotes: string;
  articleGuidelines?: string;
  exampleTitles: string[];
};
