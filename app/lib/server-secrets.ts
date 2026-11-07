import fs from "fs";
import path from "path";
import { getStore } from "@netlify/blobs";
import { projectRoot } from "@/app/lib/paths";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";

export type AdminStoredSettings = {
  elevenlabsApiKey?: string;
  openaiApiKey?: string;
  /** Runway developer API secret (same value as RUNWAYML_API_SECRET). */
  runwaymlApiKey?: string;
  /** Restream OAuth app (Developer → Apps). */
  restreamClientId?: string;
  restreamClientSecret?: string;
  /** Mux access token (Settings → Access Tokens). */
  muxTokenId?: string;
  muxTokenSecret?: string;
  /** Mux webhook signing secret (dashboard → webhooks) — optional but recommended for production. */
  muxWebhookSigningSecret?: string;
  /** Daily REST API key for Guest Room video calls. */
  dailyApiKey?: string;
  /** Optional alternative live provider. */
  livepeerApiKey?: string;
  apifyApiToken?: string;
  /** YouTube Data API v3 key. Server only. Maps YOUTUBE_API_KEY. */
  youtubeApiKey?: string;
  apifyYoutubeTranscriptActorId?: string;
  apifyYoutubeTranscriptLanguage?: string;
  apifyYoutubeTranscriptTimeoutSeconds?: string;
  ffmpegPath?: string;
  openaiTtsVoice?: string;
  openaiTtsModel?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModel?: string;
  /** Supabase project URL (Dashboard → Settings → API → Project URL). */
  supabaseUrl?: string;
  /** Service role secret — server only; powers RSS Import Builder. */
  supabaseServiceRoleKey?: string;
  deeplApiKey?: string;
  deeplApiUrl?: string;
  languageProviderMode?: "openai" | "deepl" | "deepl-openai";
  languageOpenaiModel?: string;
  /** DeepSeek API key (maps DEEPSEEK_API_KEY). */
  deepseekApiKey?: string;
  /** Default LLM provider for Plexa AI routing (openai | deepseek). */
  defaultAiProvider?: "openai" | "deepseek";
  /** Enable DeepSeek as the low-cost processing layer. */
  enableDeepseek?: boolean;
  /** DeepSeek chat model (default deepseek-chat). */
  deepseekModel?: string;
  /** Default model for `/api/openai/text-to-image` (e.g. gpt-image-1, dall-e-2). Override with OPENAI_IMAGE_MODEL env. */
  openaiImageModel?: string;
  /** Higgsfield Cloud API key id (maps HF_API_KEY when stored in admin). */
  higgsfieldApiKey?: string;
  /** Higgsfield Cloud API secret (maps HF_API_SECRET when stored in admin). */
  higgsfieldApiSecret?: string;
  /**
   * Model path under platform.higgsfield.ai (e.g. flux-pro/kontext/max/text-to-image).
   * Override with HIGGSFIELD_IMAGE_EDIT_ENDPOINT env.
   */
  higgsfieldImageEditEndpoint?: string;
  updatedAt?: string;
};

const LOCAL_DIR = path.join(projectRoot(), "data", "local");
const SETTINGS_FILE = path.join(LOCAL_DIR, "admin-settings.json");
const BLOB_STORE_NAME = "plexa-admin-settings";
const BLOB_STORE_KEY = "admin-settings.json";

function ensureDir() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

export function readStoredSettings(): AdminStoredSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw) as AdminStoredSettings;
  } catch {
    return {};
  }
}

export async function readStoredSettingsAsync(): Promise<AdminStoredSettings> {
  if (shouldUseNetlifyBlobStore()) {
    try {
      const data = (await getStore(BLOB_STORE_NAME).get(BLOB_STORE_KEY, { type: "json" })) as AdminStoredSettings | null;
      return data ?? {};
    } catch {
      return {};
    }
  }

  return readStoredSettings();
}

export function writeStoredSettings(next: AdminStoredSettings): void {
  ensureDir();
  const payload: AdminStoredSettings = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

export async function writeStoredSettingsAsync(next: AdminStoredSettings): Promise<AdminStoredSettings> {
  const payload: AdminStoredSettings = {
    ...next,
    updatedAt: new Date().toISOString(),
  };

  if (shouldUseNetlifyBlobStore()) {
    await getStore(BLOB_STORE_NAME).setJSON(BLOB_STORE_KEY, payload);
    return payload;
  }

  writeStoredSettings(payload);
  return payload;
}

/** Merge partial updates; omit or empty string can clear a key when `clearKeys` lists it */
export function mergeStoredSettings(
  partial: Partial<AdminStoredSettings>,
  clearKeys: (keyof AdminStoredSettings)[] = [],
): AdminStoredSettings {
  const cur = readStoredSettings();
  const next = { ...cur };
  for (const k of clearKeys) {
    delete next[k];
  }
  for (const [k, v] of Object.entries(partial)) {
    const key = k as keyof AdminStoredSettings;
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    (next as Record<string, unknown>)[key] = v;
  }
  writeStoredSettings(next);
  return next;
}

export async function mergeStoredSettingsAsync(
  partial: Partial<AdminStoredSettings>,
  clearKeys: (keyof AdminStoredSettings)[] = [],
): Promise<AdminStoredSettings> {
  const cur = await readStoredSettingsAsync();
  const next = { ...cur };
  for (const k of clearKeys) {
    delete next[k];
  }
  for (const [k, v] of Object.entries(partial)) {
    const key = k as keyof AdminStoredSettings;
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    (next as Record<string, unknown>)[key] = v;
  }
  return writeStoredSettingsAsync(next);
}

function secretFileKey(envName: string): keyof AdminStoredSettings | undefined {
  const map: Record<string, keyof AdminStoredSettings> = {
    ELEVENLABS_API_KEY: "elevenlabsApiKey",
    OPENAI_API_KEY: "openaiApiKey",
    DEEPSEEK_API_KEY: "deepseekApiKey",
    RUNWAYML_API_SECRET: "runwaymlApiKey",
    FFMPEG_PATH: "ffmpegPath",
    RESTREAM_CLIENT_ID: "restreamClientId",
    RESTREAM_CLIENT_SECRET: "restreamClientSecret",
    MUX_TOKEN_ID: "muxTokenId",
    MUX_TOKEN_SECRET: "muxTokenSecret",
    MUX_WEBHOOK_SIGNING_SECRET: "muxWebhookSigningSecret",
    DAILY_API_KEY: "dailyApiKey",
    LIVEPEER_API_KEY: "livepeerApiKey",
    DEEPL_API_KEY: "deeplApiKey",
    DEEPL_API_URL: "deeplApiUrl",
    APIFY_API_TOKEN: "apifyApiToken",
    YOUTUBE_API_KEY: "youtubeApiKey",
    SUPABASE_URL: "supabaseUrl",
    SUPABASE_SERVICE_ROLE_KEY: "supabaseServiceRoleKey",
    OPENAI_IMAGE_MODEL: "openaiImageModel",
    HF_API_KEY: "higgsfieldApiKey",
    HF_API_SECRET: "higgsfieldApiSecret",
    HIGGSFIELD_IMAGE_EDIT_ENDPOINT: "higgsfieldImageEditEndpoint",
  };
  return map[envName];
}

/** Standard env name → process.env wins, then local JSON */
export function getServerSecret(envName: string): string | undefined {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const s = readStoredSettings();
  const fileKey = secretFileKey(envName);
  if (!fileKey) return undefined;
  const v = s[fileKey];
  return typeof v === "string" ? v.trim() : undefined;
}

export async function getServerSecretAsync(envName: string): Promise<string | undefined> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileKey = secretFileKey(envName);
  if (!fileKey) return undefined;
  const s = await readStoredSettingsAsync();
  const v = s[fileKey];
  return typeof v === "string" ? v.trim() : undefined;
}

export function getStoredVoiceOption(
  envName: string,
  fileKey: keyof AdminStoredSettings,
): string | undefined {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const s = readStoredSettings();
  const v = s[fileKey];
  return typeof v === "string" ? v.trim() : undefined;
}

export async function getStoredVoiceOptionAsync(
  envName: string,
  fileKey: keyof AdminStoredSettings,
): Promise<string | undefined> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const s = await readStoredSettingsAsync();
  const v = s[fileKey];
  return typeof v === "string" ? v.trim() : undefined;
}

export function settingsFilePath(): string {
  return SETTINGS_FILE;
}
