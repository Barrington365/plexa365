import { NextResponse } from "next/server";
import { assertAdminWrite } from "@/app/lib/admin-auth";
import {
  mergeStoredSettingsAsync,
  readStoredSettingsAsync,
  type AdminStoredSettings,
} from "@/app/lib/server-secrets";

type Body = {
  adminToken?: string;
  elevenlabsApiKey?: string;
  openaiApiKey?: string;
  runwaymlApiKey?: string;
  restreamClientId?: string;
  restreamClientSecret?: string;
  muxTokenId?: string;
  muxTokenSecret?: string;
  /** Mux webhook signing secret (Live Control POST /api/webhooks/mux). */
  muxWebhookSigningSecret?: string;
  dailyApiKey?: string;
  livepeerApiKey?: string;
  apifyApiToken?: string;
  youtubeApiKey?: string;
  apifyYoutubeTranscriptActorId?: string;
  apifyYoutubeTranscriptLanguage?: string;
  apifyYoutubeTranscriptTimeoutSeconds?: string;
  ffmpegPath?: string;
  openaiTtsVoice?: string;
  openaiTtsModel?: string;
  /** Images API model id (e.g. gpt-image-1). Env: OPENAI_IMAGE_MODEL */
  openaiImageModel?: string;
  higgsfieldApiKey?: string;
  higgsfieldApiSecret?: string;
  /** Path under platform.higgsfield.ai — env HIGGSFIELD_IMAGE_EDIT_ENDPOINT */
  higgsfieldImageEditEndpoint?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModel?: string;
  clearElevenlabsKey?: boolean;
  clearOpenaiKey?: boolean;
  clearRunwaymlKey?: boolean;
  clearFfmpegPath?: boolean;
  clearRestreamKeys?: boolean;
  clearMuxKeys?: boolean;
  clearMuxWebhookSecret?: boolean;
  clearDailyApiKey?: boolean;
  clearLivepeerKey?: boolean;
  clearApifyApiToken?: boolean;
  clearYoutubeKey?: boolean;
  clearSupabase?: boolean;
  clearHiggsfieldKeys?: boolean;
  clearHiggsfieldImageEndpoint?: boolean;
  deepseekApiKey?: string;
  deepseekModel?: string;
  defaultAiProvider?: "openai" | "deepseek";
  enableDeepseek?: boolean;
  clearDeepseekKey?: boolean;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
};

export async function GET() {
  const s = await readStoredSettingsAsync();
  const mask = (v: string | undefined) => (v && v.length > 0 ? true : false);
  const maskPreview = (v: string | undefined) => {
    const raw = (v ?? "").trim();
    if (!raw) return "";
    const suffix = raw.length > 6 ? raw.slice(-4) : "";
    return `${"•".repeat(Math.max(12, Math.min(40, raw.length)))}${suffix ? ` ${suffix}` : ""}`;
  };
  const restreamOk = Boolean(s.restreamClientId?.trim() && s.restreamClientSecret?.trim());
  const muxOk = Boolean(s.muxTokenId?.trim() && s.muxTokenSecret?.trim());
  const muxWebhookOk = Boolean(s.muxWebhookSigningSecret?.trim());
  const supabaseOk = Boolean(s.supabaseUrl?.trim() && s.supabaseServiceRoleKey?.trim());
  const higgsfieldOk = Boolean(s.higgsfieldApiKey?.trim() && s.higgsfieldApiSecret?.trim());
  const storedDeepseekKey = s.deepseekApiKey?.trim();
  const envDeepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const deepseekConfigured = Boolean(storedDeepseekKey || envDeepseekKey);
  const deepseekApiKeyMasked = storedDeepseekKey
    ? maskPreview(storedDeepseekKey)
    : envDeepseekKey
      ? `${"•".repeat(14)} (environment)`
      : "";
  const supabaseUrlHost = (() => {
    const raw = (s.supabaseUrl ?? "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).hostname;
    } catch {
      return "";
    }
  })();
  return NextResponse.json({
    elevenlabs: { configured: mask(s.elevenlabsApiKey) },
    openai: { configured: mask(s.openaiApiKey) },
    deepseek: { configured: deepseekConfigured },
    aiProvider: {
      defaultProvider: s.defaultAiProvider ?? process.env.DEFAULT_AI_PROVIDER?.trim() ?? "openai",
      enableDeepseek:
        typeof s.enableDeepseek === "boolean"
          ? s.enableDeepseek
          : process.env.ENABLE_DEEPSEEK?.trim().toLowerCase() === "true",
      deepseekModel: s.deepseekModel?.trim() || process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
      deepseekKeySource: storedDeepseekKey ? "admin" : envDeepseekKey ? "environment" : "none",
    },
    runwayml: { configured: mask(s.runwaymlApiKey) },
    restream: { configured: restreamOk },
    mux: { configured: muxOk },
    muxWebhook: { configured: muxWebhookOk },
    daily: { configured: mask(s.dailyApiKey) },
    livepeer: { configured: mask(s.livepeerApiKey) },
    apify: { configured: mask(s.apifyApiToken) },
    youtube: {
      configured: Boolean(s.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY?.trim()),
      source: s.youtubeApiKey?.trim() ? "admin" : process.env.YOUTUBE_API_KEY?.trim() ? "environment" : "none",
    },
    supabase: { configured: supabaseOk },
    higgsfield: { configured: higgsfieldOk },
    supabaseUrlHost,
    elevenlabsApiKeyMasked: maskPreview(s.elevenlabsApiKey),
    openaiApiKeyMasked: maskPreview(s.openaiApiKey),
    deepseekApiKeyMasked,
    runwaymlApiKeyMasked: maskPreview(s.runwaymlApiKey),
    restreamClientIdMasked: maskPreview(s.restreamClientId),
    restreamClientSecretMasked: maskPreview(s.restreamClientSecret),
    muxTokenIdMasked: maskPreview(s.muxTokenId),
    muxTokenSecretMasked: maskPreview(s.muxTokenSecret),
    muxWebhookSigningSecretMasked: maskPreview(s.muxWebhookSigningSecret),
    dailyApiKeyMasked: maskPreview(s.dailyApiKey),
    livepeerApiKeyMasked: maskPreview(s.livepeerApiKey),
    apifyApiTokenMasked: maskPreview(s.apifyApiToken),
    youtubeApiKeyMasked: s.youtubeApiKey?.trim()
      ? maskPreview(s.youtubeApiKey)
      : process.env.YOUTUBE_API_KEY?.trim()
        ? `${"•".repeat(14)} (environment)`
        : "",
    supabaseServiceRoleKeyMasked: maskPreview(s.supabaseServiceRoleKey),
    apifyYoutubeTranscriptActorId:
      s.apifyYoutubeTranscriptActorId?.trim() || "apilabs/youtube-caption-transcription-scraper",
    apifyYoutubeTranscriptLanguage: s.apifyYoutubeTranscriptLanguage?.trim() || "en",
    apifyYoutubeTranscriptTimeoutSeconds: s.apifyYoutubeTranscriptTimeoutSeconds?.trim() || "90",
    ffmpegPath: s.ffmpegPath?.trim() || "",
    openaiTtsVoice: s.openaiTtsVoice?.trim() || "",
    openaiTtsModel: s.openaiTtsModel?.trim() || "",
    openaiImageModel: s.openaiImageModel?.trim() || "",
    higgsfieldApiKeyMasked: maskPreview(s.higgsfieldApiKey),
    higgsfieldApiSecretMasked: maskPreview(s.higgsfieldApiSecret),
    higgsfieldImageEditEndpoint: s.higgsfieldImageEditEndpoint?.trim() || "",
    elevenlabsVoiceId: s.elevenlabsVoiceId?.trim() || "",
    elevenlabsModel: s.elevenlabsModel?.trim() || "",
    updatedAt: s.updatedAt || null,
    adminTokenRequired: Boolean(process.env.ADMIN_TOKEN?.trim()),
  });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const denied = assertAdminWrite(request, body.adminToken);
  if (denied) return denied;

  const clearKeys: (keyof AdminStoredSettings)[] = [];
  if (body.clearElevenlabsKey) clearKeys.push("elevenlabsApiKey");
  if (body.clearOpenaiKey) clearKeys.push("openaiApiKey");
  if (body.clearRunwaymlKey) clearKeys.push("runwaymlApiKey");
  if (body.clearFfmpegPath) clearKeys.push("ffmpegPath");
  if (body.clearRestreamKeys) {
    clearKeys.push("restreamClientId", "restreamClientSecret");
  }
  if (body.clearMuxKeys) {
    clearKeys.push("muxTokenId", "muxTokenSecret");
  }
  if (body.clearMuxWebhookSecret) {
    clearKeys.push("muxWebhookSigningSecret");
  }
  if (body.clearDailyApiKey) clearKeys.push("dailyApiKey");
  if (body.clearLivepeerKey) clearKeys.push("livepeerApiKey");
  if (body.clearApifyApiToken) clearKeys.push("apifyApiToken");
  if (body.clearYoutubeKey) clearKeys.push("youtubeApiKey");
  if (body.clearSupabase) clearKeys.push("supabaseUrl", "supabaseServiceRoleKey");
  if (body.clearHiggsfieldKeys) clearKeys.push("higgsfieldApiKey", "higgsfieldApiSecret");
  if (body.clearHiggsfieldImageEndpoint) clearKeys.push("higgsfieldImageEditEndpoint");
  if (body.clearDeepseekKey) clearKeys.push("deepseekApiKey");

  const partial: Partial<AdminStoredSettings> = {};
  if (body.elevenlabsApiKey?.trim()) partial.elevenlabsApiKey = body.elevenlabsApiKey.trim();
  if (body.openaiApiKey?.trim()) partial.openaiApiKey = body.openaiApiKey.trim();
  if (body.deepseekApiKey?.trim()) partial.deepseekApiKey = body.deepseekApiKey.trim();
  if (body.defaultAiProvider === "openai" || body.defaultAiProvider === "deepseek") {
    partial.defaultAiProvider = body.defaultAiProvider;
  }
  if (typeof body.enableDeepseek === "boolean") partial.enableDeepseek = body.enableDeepseek;
  if (body.deepseekModel?.trim()) partial.deepseekModel = body.deepseekModel.trim();
  if (body.runwaymlApiKey?.trim()) partial.runwaymlApiKey = body.runwaymlApiKey.trim();
  if (body.restreamClientId?.trim()) partial.restreamClientId = body.restreamClientId.trim();
  if (body.restreamClientSecret?.trim()) partial.restreamClientSecret = body.restreamClientSecret.trim();
  if (body.muxTokenId?.trim()) partial.muxTokenId = body.muxTokenId.trim();
  if (body.muxTokenSecret?.trim()) partial.muxTokenSecret = body.muxTokenSecret.trim();
  if (body.muxWebhookSigningSecret?.trim()) partial.muxWebhookSigningSecret = body.muxWebhookSigningSecret.trim();
  if (body.dailyApiKey?.trim()) partial.dailyApiKey = body.dailyApiKey.trim();
  if (body.livepeerApiKey?.trim()) partial.livepeerApiKey = body.livepeerApiKey.trim();
  if (body.apifyApiToken?.trim()) partial.apifyApiToken = body.apifyApiToken.trim();
  if (body.youtubeApiKey?.trim()) partial.youtubeApiKey = body.youtubeApiKey.trim();
  if (body.supabaseUrl?.trim()) partial.supabaseUrl = body.supabaseUrl.trim();
  if (body.supabaseServiceRoleKey?.trim()) partial.supabaseServiceRoleKey = body.supabaseServiceRoleKey.trim();
  if (body.apifyYoutubeTranscriptActorId?.trim()) partial.apifyYoutubeTranscriptActorId = body.apifyYoutubeTranscriptActorId.trim();
  if (body.apifyYoutubeTranscriptLanguage?.trim()) partial.apifyYoutubeTranscriptLanguage = body.apifyYoutubeTranscriptLanguage.trim();
  if (body.apifyYoutubeTranscriptTimeoutSeconds?.trim()) partial.apifyYoutubeTranscriptTimeoutSeconds = body.apifyYoutubeTranscriptTimeoutSeconds.trim();
  if (body.ffmpegPath?.trim()) partial.ffmpegPath = body.ffmpegPath.trim();
  if (body.openaiTtsVoice?.trim()) partial.openaiTtsVoice = body.openaiTtsVoice.trim();
  if (body.openaiTtsModel?.trim()) partial.openaiTtsModel = body.openaiTtsModel.trim();
  if (body.openaiImageModel?.trim()) partial.openaiImageModel = body.openaiImageModel.trim();
  if (body.higgsfieldApiKey?.trim()) partial.higgsfieldApiKey = body.higgsfieldApiKey.trim();
  if (body.higgsfieldApiSecret?.trim()) partial.higgsfieldApiSecret = body.higgsfieldApiSecret.trim();
  if (body.higgsfieldImageEditEndpoint?.trim()) partial.higgsfieldImageEditEndpoint = body.higgsfieldImageEditEndpoint.trim();
  if (body.elevenlabsVoiceId?.trim()) partial.elevenlabsVoiceId = body.elevenlabsVoiceId.trim();
  if (body.elevenlabsModel?.trim()) partial.elevenlabsModel = body.elevenlabsModel.trim();

  await mergeStoredSettingsAsync(partial, clearKeys);

  const { resetFfmpegBinaryCache } = await import("@/app/features/video/ffmpeg-utils");
  const { resetAudioProvider } = await import("@/app/features/audio");
  resetFfmpegBinaryCache();
  resetAudioProvider();

  return NextResponse.json({ ok: true });
}
