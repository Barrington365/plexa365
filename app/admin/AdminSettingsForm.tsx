"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/app/components/Panel";
import { R365Button } from "@/app/components/R365Button";

type Status = {
  elevenlabs: { configured: boolean };
  openai: { configured: boolean };
  deepseek: { configured: boolean };
  aiProvider?: {
    defaultProvider: "openai" | "deepseek";
    enableDeepseek: boolean;
    deepseekModel: string;
    deepseekKeySource?: "admin" | "environment" | "none";
  };
  deepseekApiKeyMasked?: string;
  runwayml: { configured: boolean };
  higgsfield: { configured: boolean };
  restream: { configured: boolean };
  mux: { configured: boolean };
  muxWebhook: { configured: boolean };
  daily?: { configured: boolean };
  livepeer: { configured: boolean };
  apify: { configured: boolean };
  youtube?: { configured: boolean; source?: "admin" | "environment" | "none" };
  youtubeApiKeyMasked?: string;
  supabase: { configured: boolean };
  supabaseUrlHost: string;
  supabaseServiceRoleKeyMasked?: string;
  elevenlabsApiKeyMasked?: string;
  openaiApiKeyMasked?: string;
  runwaymlApiKeyMasked?: string;
  restreamClientIdMasked?: string;
  restreamClientSecretMasked?: string;
  muxTokenIdMasked?: string;
  muxTokenSecretMasked?: string;
  muxWebhookSigningSecretMasked?: string;
  dailyApiKeyMasked?: string;
  livepeerApiKeyMasked?: string;
  apifyApiTokenMasked?: string;
  apifyYoutubeTranscriptActorId: string;
  apifyYoutubeTranscriptLanguage: string;
  apifyYoutubeTranscriptTimeoutSeconds: string;
  ffmpegPath: string;
  openaiTtsVoice: string;
  openaiTtsModel: string;
  openaiImageModel: string;
  higgsfieldApiKeyMasked?: string;
  higgsfieldApiSecretMasked?: string;
  higgsfieldImageEditEndpoint: string;
  elevenlabsVoiceId: string;
  elevenlabsModel: string;
  updatedAt: string | null;
  adminTokenRequired: boolean;
};

type AiUsageProvider = {
  provider: "openai" | "elevenlabs" | "claude" | "deepseek";
  label: string;
  state: "ready" | "missing_key" | "permission_required" | "provider_error" | "unsupported";
  summary: string;
  dashboardUrl: string;
  metrics?: Array<{ label: string; value: string }>;
  error?: string;
};

type AiUsageResponse = {
  ok?: boolean;
  days?: number;
  generatedAt?: string;
  providers?: AiUsageProvider[];
  error?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[#1f2d26] bg-[#0a0e0c] px-3 py-2 text-sm text-white placeholder:text-slate-600";

export function AdminSettingsForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [defaultAiProvider, setDefaultAiProvider] = useState<"openai" | "deepseek">("openai");
  const [enableDeepseek, setEnableDeepseek] = useState(false);
  const [runwaymlApiKey, setRunwaymlApiKey] = useState("");
  const [restreamClientId, setRestreamClientId] = useState("");
  const [restreamClientSecret, setRestreamClientSecret] = useState("");
  const [muxTokenId, setMuxTokenId] = useState("");
  const [muxTokenSecret, setMuxTokenSecret] = useState("");
  const [muxWebhookSigningSecret, setMuxWebhookSigningSecret] = useState("");
  const [dailyApiKey, setDailyApiKey] = useState("");
  const [livepeerApiKey, setLivepeerApiKey] = useState("");
  const [apifyApiToken, setApifyApiToken] = useState("");
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState("");
  const [apifyYoutubeTranscriptActorId, setApifyYoutubeTranscriptActorId] = useState("apilabs/youtube-caption-transcription-scraper");
  const [apifyYoutubeTranscriptLanguage, setApifyYoutubeTranscriptLanguage] = useState("en");
  const [apifyYoutubeTranscriptTimeoutSeconds, setApifyYoutubeTranscriptTimeoutSeconds] = useState("90");
  const [elevenlabsKeyDirty, setElevenlabsKeyDirty] = useState(false);
  const [openaiKeyDirty, setOpenaiKeyDirty] = useState(false);
  const [deepseekKeyDirty, setDeepseekKeyDirty] = useState(false);
  const [runwayKeyDirty, setRunwayKeyDirty] = useState(false);
  const [restreamIdDirty, setRestreamIdDirty] = useState(false);
  const [restreamSecretDirty, setRestreamSecretDirty] = useState(false);
  const [muxIdDirty, setMuxIdDirty] = useState(false);
  const [muxSecretDirty, setMuxSecretDirty] = useState(false);
  const [muxWebhookDirty, setMuxWebhookDirty] = useState(false);
  const [dailyKeyDirty, setDailyKeyDirty] = useState(false);
  const [livepeerKeyDirty, setLivepeerKeyDirty] = useState(false);
  const [apifyTokenDirty, setApifyTokenDirty] = useState(false);
  const [youtubeKeyDirty, setYoutubeKeyDirty] = useState(false);
  const [supabaseUrlDirty, setSupabaseUrlDirty] = useState(false);
  const [supabaseKeyDirty, setSupabaseKeyDirty] = useState(false);
  const [ffmpegPath, setFfmpegPath] = useState("");
  const [openaiTtsVoice, setOpenaiTtsVoice] = useState("");
  const [openaiTtsModel, setOpenaiTtsModel] = useState("");
  const [openaiImageModel, setOpenaiImageModel] = useState("");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState("");
  const [elevenlabsModel, setElevenlabsModel] = useState("");
  const [clearElevenlabsKey, setClearElevenlabsKey] = useState(false);
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [clearDeepseekKey, setClearDeepseekKey] = useState(false);
  const [clearRunwaymlKey, setClearRunwaymlKey] = useState(false);
  const [clearRestreamKeys, setClearRestreamKeys] = useState(false);
  const [clearMuxKeys, setClearMuxKeys] = useState(false);
  const [clearMuxWebhookSecret, setClearMuxWebhookSecret] = useState(false);
  const [clearDailyApiKey, setClearDailyApiKey] = useState(false);
  const [clearLivepeerKey, setClearLivepeerKey] = useState(false);
  const [clearApifyApiToken, setClearApifyApiToken] = useState(false);
  const [clearYoutubeKey, setClearYoutubeKey] = useState(false);
  const [clearSupabase, setClearSupabase] = useState(false);
  const [clearFfmpegPath, setClearFfmpegPath] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openaiCheckBusy, setOpenaiCheckBusy] = useState(false);
  const [openaiCheckMessage, setOpenaiCheckMessage] = useState<string | null>(null);
  const [deepseekCheckBusy, setDeepseekCheckBusy] = useState(false);
  const [deepseekCheckMessage, setDeepseekCheckMessage] = useState<string | null>(null);
  const [elevenlabsCheckBusy, setElevenlabsCheckBusy] = useState(false);
  const [elevenlabsCheckMessage, setElevenlabsCheckMessage] = useState<string | null>(null);
  const [runwayCheckBusy, setRunwayCheckBusy] = useState(false);
  const [runwayCheckMessage, setRunwayCheckMessage] = useState<string | null>(null);
  const [higgsfieldApiKey, setHiggsfieldApiKey] = useState("");
  const [higgsfieldApiSecret, setHiggsfieldApiSecret] = useState("");
  const [higgsfieldImageEditEndpoint, setHiggsfieldImageEditEndpoint] = useState("");
  const [higgsfieldKeyDirty, setHiggsfieldKeyDirty] = useState(false);
  const [higgsfieldSecretDirty, setHiggsfieldSecretDirty] = useState(false);
  const [clearHiggsfieldKeys, setClearHiggsfieldKeys] = useState(false);
  const [clearHiggsfieldImageEndpoint, setClearHiggsfieldImageEndpoint] = useState(false);
  const [higgsfieldCheckBusy, setHiggsfieldCheckBusy] = useState(false);
  const [higgsfieldCheckMessage, setHiggsfieldCheckMessage] = useState<string | null>(null);
  const [restreamCheckBusy, setRestreamCheckBusy] = useState(false);
  const [restreamCheckMessage, setRestreamCheckMessage] = useState<string | null>(null);
  const [muxCheckBusy, setMuxCheckBusy] = useState(false);
  const [muxCheckMessage, setMuxCheckMessage] = useState<string | null>(null);
  const [dailyCheckBusy, setDailyCheckBusy] = useState(false);
  const [dailyCheckMessage, setDailyCheckMessage] = useState<string | null>(null);
  const [livepeerCheckBusy, setLivepeerCheckBusy] = useState(false);
  const [livepeerCheckMessage, setLivepeerCheckMessage] = useState<string | null>(null);
  const [apifyCheckBusy, setApifyCheckBusy] = useState(false);
  const [apifyCheckMessage, setApifyCheckMessage] = useState<string | null>(null);
  const [supabaseCheckBusy, setSupabaseCheckBusy] = useState(false);
  const [supabaseCheckMessage, setSupabaseCheckMessage] = useState<string | null>(null);
  const [elevenlabsLastCheckAt, setElevenlabsLastCheckAt] = useState<string | null>(null);
  const [elevenlabsLastCheckOk, setElevenlabsLastCheckOk] = useState<boolean | null>(null);
  const [captionCheckBusy, setCaptionCheckBusy] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState(
    "Write one punchy social caption for F1 race results in under 20 words.",
  );
  const [captionResult, setCaptionResult] = useState<string | null>(null);
  const [aiUsageBusy, setAiUsageBusy] = useState(false);
  const [aiUsage, setAiUsage] = useState<AiUsageResponse | null>(null);
  const [aiUsageError, setAiUsageError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Status | null> => {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load settings");
      return null;
    }
    const next = data as Status;
    setStatus(next);
    setFfmpegPath(data.ffmpegPath || "");
    setOpenaiTtsVoice(data.openaiTtsVoice || "");
    setOpenaiTtsModel(data.openaiTtsModel || "");
    setOpenaiImageModel(data.openaiImageModel || "");
    setHiggsfieldImageEditEndpoint(data.higgsfieldImageEditEndpoint || "");
    setElevenlabsVoiceId(data.elevenlabsVoiceId || "");
    setElevenlabsModel(data.elevenlabsModel || "");
    setApifyYoutubeTranscriptActorId(data.apifyYoutubeTranscriptActorId || "apilabs/youtube-caption-transcription-scraper");
    setApifyYoutubeTranscriptLanguage(data.apifyYoutubeTranscriptLanguage || "en");
    setApifyYoutubeTranscriptTimeoutSeconds(data.apifyYoutubeTranscriptTimeoutSeconds || "90");
    setDefaultAiProvider(data.aiProvider?.defaultProvider === "deepseek" ? "deepseek" : "openai");
    setEnableDeepseek(Boolean(data.aiProvider?.enableDeepseek));
    setDeepseekModel(data.aiProvider?.deepseekModel || "deepseek-chat");
    setElevenlabsKeyDirty(false);
    setOpenaiKeyDirty(false);
    setDeepseekKeyDirty(false);
    setRunwayKeyDirty(false);
    setHiggsfieldKeyDirty(false);
    setHiggsfieldSecretDirty(false);
    setRestreamIdDirty(false);
    setRestreamSecretDirty(false);
    setMuxIdDirty(false);
    setMuxSecretDirty(false);
    setMuxWebhookDirty(false);
    setDailyKeyDirty(false);
    setLivepeerKeyDirty(false);
    setApifyTokenDirty(false);
    setSupabaseUrlDirty(false);
    setSupabaseKeyDirty(false);
    return next;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const nextElevenlabs = elevenlabsApiKey.trim();
      const nextOpenAi = openaiApiKey.trim();
      const nextDeepseek = deepseekApiKey.trim();
      const nextRunway = runwaymlApiKey.trim();
      const nextHiggsfieldKey = higgsfieldApiKey.trim();
      const nextHiggsfieldSecret = higgsfieldApiSecret.trim();
      const nextRestreamId = restreamClientId.trim();
      const nextRestreamSecret = restreamClientSecret.trim();
      const nextMuxId = muxTokenId.trim();
      const nextMuxSecret = muxTokenSecret.trim();
      const nextMuxWebhook = muxWebhookSigningSecret.trim();
      const nextDailyApiKey = dailyApiKey.trim();
      const nextLivepeer = livepeerApiKey.trim();
      const nextApifyToken = apifyApiToken.trim();
      const nextYoutubeKey = youtubeApiKey.trim();
      const nextSupabaseUrl = supabaseUrl.trim();
      const nextSupabaseServiceRoleKey = supabaseServiceRoleKey.trim();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          elevenlabsApiKey: elevenlabsKeyDirty ? nextElevenlabs || undefined : undefined,
          openaiApiKey: openaiKeyDirty ? nextOpenAi || undefined : undefined,
          deepseekApiKey: deepseekKeyDirty ? nextDeepseek || undefined : undefined,
          deepseekModel: deepseekModel.trim() || undefined,
          defaultAiProvider,
          enableDeepseek,
          runwaymlApiKey: runwayKeyDirty ? nextRunway || undefined : undefined,
          restreamClientId: restreamIdDirty ? nextRestreamId || undefined : undefined,
          restreamClientSecret: restreamSecretDirty ? nextRestreamSecret || undefined : undefined,
          muxTokenId: muxIdDirty ? nextMuxId || undefined : undefined,
          muxTokenSecret: muxSecretDirty ? nextMuxSecret || undefined : undefined,
          muxWebhookSigningSecret: muxWebhookDirty ? nextMuxWebhook || undefined : undefined,
          dailyApiKey: dailyKeyDirty ? nextDailyApiKey || undefined : undefined,
          livepeerApiKey: livepeerKeyDirty ? nextLivepeer || undefined : undefined,
          apifyApiToken: apifyTokenDirty ? nextApifyToken || undefined : undefined,
          youtubeApiKey: youtubeKeyDirty ? nextYoutubeKey || undefined : undefined,
          supabaseUrl: supabaseUrlDirty ? nextSupabaseUrl || undefined : undefined,
          supabaseServiceRoleKey: supabaseKeyDirty ? nextSupabaseServiceRoleKey || undefined : undefined,
          apifyYoutubeTranscriptActorId: apifyYoutubeTranscriptActorId.trim() || undefined,
          apifyYoutubeTranscriptLanguage: apifyYoutubeTranscriptLanguage.trim() || undefined,
          apifyYoutubeTranscriptTimeoutSeconds: apifyYoutubeTranscriptTimeoutSeconds.trim() || undefined,
          ffmpegPath: ffmpegPath.trim() || undefined,
          openaiTtsVoice: openaiTtsVoice.trim() || undefined,
          openaiTtsModel: openaiTtsModel.trim() || undefined,
          openaiImageModel: openaiImageModel.trim() || undefined,
          higgsfieldApiKey: higgsfieldKeyDirty ? nextHiggsfieldKey || undefined : undefined,
          higgsfieldApiSecret: higgsfieldSecretDirty ? nextHiggsfieldSecret || undefined : undefined,
          higgsfieldImageEditEndpoint: higgsfieldImageEditEndpoint.trim() || undefined,
          elevenlabsVoiceId: elevenlabsVoiceId.trim() || undefined,
          elevenlabsModel: elevenlabsModel.trim() || undefined,
          clearElevenlabsKey,
          clearOpenaiKey,
          clearDeepseekKey,
          clearRunwaymlKey,
          clearRestreamKeys,
          clearMuxKeys,
          clearMuxWebhookSecret,
          clearDailyApiKey,
          clearLivepeerKey,
          clearApifyApiToken,
          clearYoutubeKey,
          clearSupabase,
          clearFfmpegPath,
          clearHiggsfieldKeys,
          clearHiggsfieldImageEndpoint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const refreshed = await load();
      if (!refreshed) throw new Error("Saved but failed to re-read settings.");
      if (!clearElevenlabsKey && nextElevenlabs && !refreshed.elevenlabs.configured) {
        throw new Error("ElevenLabs key save could not be verified.");
      }
      if (!clearOpenaiKey && nextOpenAi && !refreshed.openai.configured) {
        throw new Error("OpenAI key save could not be verified.");
      }
      if (!clearDeepseekKey && nextDeepseek && !refreshed.deepseek.configured) {
        throw new Error("DeepSeek key save could not be verified.");
      }
      if (!clearRunwaymlKey && nextRunway && !refreshed.runwayml.configured) {
        throw new Error("Runway API secret save could not be verified.");
      }
      if (
        !clearHiggsfieldKeys &&
        higgsfieldKeyDirty &&
        higgsfieldSecretDirty &&
        nextHiggsfieldKey &&
        nextHiggsfieldSecret &&
        !refreshed.higgsfield?.configured
      ) {
        throw new Error("Higgsfield API key + secret save could not be verified.");
      }
      if (!clearDailyApiKey && nextDailyApiKey && !refreshed.daily?.configured) {
        throw new Error("Daily API key save could not be verified.");
      }
      if (!clearApifyApiToken && nextApifyToken && !refreshed.apify.configured) {
        throw new Error("Apify token save could not be verified.");
      }
      if (!clearYoutubeKey && nextYoutubeKey && !refreshed.youtube?.configured) {
        throw new Error("YouTube API key save could not be verified.");
      }
      if (
        !clearSupabase &&
        (supabaseUrlDirty || supabaseKeyDirty) &&
        (nextSupabaseUrl || nextSupabaseServiceRoleKey) &&
        !refreshed.supabase?.configured
      ) {
        throw new Error("Supabase save could not be verified — set both project URL and service role key.");
      }
      setMessage("Saved to admin settings. Keys are now stored and active for the next build.");
      setElevenlabsApiKey("");
      setOpenaiApiKey("");
      setDeepseekApiKey("");
      setRunwaymlApiKey("");
      setHiggsfieldApiKey("");
      setHiggsfieldApiSecret("");
      setRestreamClientId("");
      setRestreamClientSecret("");
      setMuxTokenId("");
      setMuxTokenSecret("");
      setMuxWebhookSigningSecret("");
      setDailyApiKey("");
      setLivepeerApiKey("");
      setApifyApiToken("");
      setYoutubeApiKey("");
      setSupabaseUrl("");
      setSupabaseServiceRoleKey("");
      setElevenlabsKeyDirty(false);
      setOpenaiKeyDirty(false);
      setDeepseekKeyDirty(false);
      setRunwayKeyDirty(false);
      setHiggsfieldKeyDirty(false);
      setHiggsfieldSecretDirty(false);
      setRestreamIdDirty(false);
      setRestreamSecretDirty(false);
      setMuxIdDirty(false);
      setMuxSecretDirty(false);
      setMuxWebhookDirty(false);
      setDailyKeyDirty(false);
      setLivepeerKeyDirty(false);
      setApifyTokenDirty(false);
      setYoutubeKeyDirty(false);
      setSupabaseUrlDirty(false);
      setSupabaseKeyDirty(false);
      setClearElevenlabsKey(false);
      setClearOpenaiKey(false);
      setClearDeepseekKey(false);
      setClearRunwaymlKey(false);
      setClearRestreamKeys(false);
      setClearMuxKeys(false);
      setClearMuxWebhookSecret(false);
      setClearDailyApiKey(false);
      setClearLivepeerKey(false);
      setClearApifyApiToken(false);
      setClearYoutubeKey(false);
      setClearSupabase(false);
      setClearFfmpegPath(false);
      setClearHiggsfieldKeys(false);
      setClearHiggsfieldImageEndpoint(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const testOpenAiConnection = async () => {
    setOpenaiCheckBusy(true);
    setOpenaiCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/openai-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          openaiApiKey: openaiApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; modelCount?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "OpenAI connection failed");
      setOpenaiCheckMessage(
        `OpenAI connected. API key is valid (${data.modelCount ?? 0} models listed).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "OpenAI connection failed");
    } finally {
      setOpenaiCheckBusy(false);
    }
  };

  const testDeepSeekConnection = async () => {
    setDeepseekCheckBusy(true);
    setDeepseekCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/deepseek-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          deepseekApiKey: deepseekKeyDirty ? deepseekApiKey.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "DeepSeek connection failed");
      setDeepseekCheckMessage("DeepSeek connected. API key is valid.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "DeepSeek connection failed");
    } finally {
      setDeepseekCheckBusy(false);
    }
  };

  const testElevenLabsConnection = async () => {
    setElevenlabsCheckBusy(true);
    setElevenlabsCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/elevenlabs-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          elevenlabsApiKey: elevenlabsApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        voicesReadOk?: boolean;
        ttsOk?: boolean;
        defaultVoiceCount?: number;
        labelledDefaultCount?: number;
        voiceIdTested?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "ElevenLabs check failed");
      setElevenlabsCheckMessage(
        `ElevenLabs connected. voices_read and TTS passed (${data.labelledDefaultCount ?? 0}/${data.defaultVoiceCount ?? 0} defaults labelled, test voice ${data.voiceIdTested ?? "default"}).`,
      );
      setElevenlabsLastCheckOk(true);
      setElevenlabsLastCheckAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ElevenLabs check failed");
      setElevenlabsLastCheckOk(false);
      setElevenlabsLastCheckAt(new Date().toISOString());
    } finally {
      setElevenlabsCheckBusy(false);
    }
  };

  const testRunwayConnection = async () => {
    setRunwayCheckBusy(true);
    setRunwayCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/runway-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          runwaymlApiKey: runwaymlApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        creditBalance?: number | null;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Runway connection failed");
      const bal =
        data.creditBalance === null || data.creditBalance === undefined
          ? "unknown"
          : String(data.creditBalance);
      setRunwayCheckMessage(`Runway connected. API secret is valid (credit balance: ${bal}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Runway connection failed");
    } finally {
      setRunwayCheckBusy(false);
    }
  };

  const testHiggsfieldConnection = async () => {
    setHiggsfieldCheckBusy(true);
    setHiggsfieldCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/higgsfield-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          higgsfieldApiKey: higgsfieldApiKey.trim() || undefined,
          higgsfieldApiSecret: higgsfieldApiSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Higgsfield connection failed");
      setHiggsfieldCheckMessage(data.detail ?? "Higgsfield credentials accepted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Higgsfield connection failed");
    } finally {
      setHiggsfieldCheckBusy(false);
    }
  };

  const testRestreamCredentials = async () => {
    setRestreamCheckBusy(true);
    setRestreamCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/restream-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          restreamClientId: restreamClientId.trim() || undefined,
          restreamClientSecret: restreamClientSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Restream check failed");
      setRestreamCheckMessage(data.message ?? "Restream credentials look valid.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restream check failed");
    } finally {
      setRestreamCheckBusy(false);
    }
  };

  const testMuxTokens = async () => {
    setMuxCheckBusy(true);
    setMuxCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/mux-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          muxTokenId: muxTokenId.trim() || undefined,
          muxTokenSecret: muxTokenSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Mux check failed");
      setMuxCheckMessage(data.message ?? "Mux tokens are valid.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mux check failed");
    } finally {
      setMuxCheckBusy(false);
    }
  };

  const testLivepeerKey = async () => {
    setLivepeerCheckBusy(true);
    setLivepeerCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/livepeer-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          livepeerApiKey: livepeerApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Livepeer check failed");
      setLivepeerCheckMessage(data.message ?? "Livepeer API key is valid.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Livepeer check failed");
    } finally {
      setLivepeerCheckBusy(false);
    }
  };

  const testDailyKey = async () => {
    setDailyCheckBusy(true);
    setDailyCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/daily-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          dailyApiKey: dailyApiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; roomCount?: number | null; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Daily check failed");
      setDailyCheckMessage(`${data.message ?? "Daily API key is valid."} Rooms visible: ${data.roomCount ?? "unknown"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Daily check failed");
    } finally {
      setDailyCheckBusy(false);
    }
  };

  const testApifyConnection = async () => {
    setApifyCheckBusy(true);
    setApifyCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/apify-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          apifyApiToken: apifyApiToken.trim() || undefined,
          apifyYoutubeTranscriptActorId: apifyYoutubeTranscriptActorId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; username?: string; actorId?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Apify connection failed");
      setApifyCheckMessage(
        `Apify connected${data.username ? ` as ${data.username}` : ""}. Transcript actor reachable: ${data.actorId ?? apifyYoutubeTranscriptActorId}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apify connection failed");
    } finally {
      setApifyCheckBusy(false);
    }
  };

  const testSupabaseConnection = async () => {
    setSupabaseCheckBusy(true);
    setSupabaseCheckMessage(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/supabase-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          supabaseUrl: supabaseUrl.trim() || undefined,
          supabaseServiceRoleKey: supabaseServiceRoleKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; host?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Supabase connection failed");
      setSupabaseCheckMessage(`Supabase reachable${data.host ? ` (${data.host})` : ""}. Table rss_feeds is queryable.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Supabase connection failed");
    } finally {
      setSupabaseCheckBusy(false);
    }
  };

  const testCaptionGeneration = async () => {
    setCaptionCheckBusy(true);
    setCaptionResult(null);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/openai-caption-check", {
        method: "POST",
        headers,
        body: JSON.stringify({
          adminToken: tok || undefined,
          openaiApiKey: openaiApiKey.trim() || undefined,
          prompt: captionPrompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; caption?: string; error?: string; model?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Caption generation failed");
      setCaptionResult(data.caption ?? "");
      setOpenaiCheckMessage(`OpenAI caption generation passed (${data.model ?? "model"}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Caption generation failed");
    } finally {
      setCaptionCheckBusy(false);
    }
  };

  const loadAiUsage = async () => {
    setAiUsageBusy(true);
    setAiUsageError(null);
    try {
      const headers: Record<string, string> = {};
      const tok = adminToken.trim();
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch("/api/admin/ai-usage?days=30", { headers, cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as AiUsageResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "AI usage dashboard could not load");
      setAiUsage(data);
    } catch (e) {
      setAiUsageError(e instanceof Error ? e.message : "AI usage dashboard could not load");
    } finally {
      setAiUsageBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Panel title="API keys & tools">
        <p className="text-sm text-slate-400">
          Values are stored server-side. Local development uses{" "}
          <code className="text-slate-500">data/local/admin-settings.json</code>; Netlify uses Netlify Blobs.
          Environment variables in <code className="text-slate-500">.env.local</code> still override these when set.
        </p>
        {status && (
          <ul className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <li>
              ElevenLabs:{" "}
              <span className={status.elevenlabs.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.elevenlabs.configured ? "key on file" : "not set"}
              </span>
            </li>
            <li>
              OpenAI:{" "}
              <span className={status.openai.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.openai.configured ? "key on file" : "not set"}
              </span>
            </li>
            <li>
              DeepSeek:{" "}
              <span className={status.deepseek.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.deepseek.configured
                  ? status.aiProvider?.deepseekKeySource === "environment"
                    ? "key (environment)"
                    : "key on file"
                  : "not set"}
                {status.aiProvider?.enableDeepseek ? " · enabled" : ""}
              </span>
            </li>
            <li>
              Runway:{" "}
              <span className={status.runwayml.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.runwayml.configured ? "secret on file" : "not set"}
              </span>
            </li>
            <li>
              Higgsfield:{" "}
              <span className={status.higgsfield.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.higgsfield.configured ? "key + secret on file" : "not set"}
              </span>
            </li>
            <li>
              Restream:{" "}
              <span className={status.restream.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.restream.configured ? "client id + secret" : "not set"}
              </span>
            </li>
            <li>
              Mux:{" "}
              <span className={status.mux.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.mux.configured ? "token id + secret" : "not set"}
              </span>
            </li>
            <li>
              Mux webhook:{" "}
              <span className={status.muxWebhook.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.muxWebhook.configured ? "signing secret (Live Control)" : "not set"}
              </span>
            </li>
            <li>
              Daily:{" "}
              <span className={status.daily?.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.daily?.configured ? "key on file" : "not set"}
              </span>
            </li>
            <li>
              Livepeer:{" "}
              <span className={status.livepeer.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.livepeer.configured ? "key on file" : "optional"}
              </span>
            </li>
            <li>
              Apify:{" "}
              <span className={status.apify.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.apify.configured ? "token on file" : "not set"}
              </span>
            </li>
            <li>
              Supabase:{" "}
              <span className={status.supabase.configured ? "text-[#22c55e]" : "text-slate-600"}>
                {status.supabase.configured
                  ? status.supabaseUrlHost
                    ? `URL + key (${status.supabaseUrlHost})`
                    : "URL + key on file"
                  : "not set"}
              </span>
            </li>
            {status.updatedAt && <li>Updated {new Date(status.updatedAt).toLocaleString()}</li>}
          </ul>
        )}
      </Panel>

      <Panel title="Supabase (RSS Import Builder)">
        <p className="text-sm text-slate-400">
          Paste your Supabase <strong className="text-slate-200">Project URL</strong> and the{" "}
          <strong className="text-slate-200">service_role</strong> secret (the long JWT labelled &quot;service_role&quot; in
          API settings — <strong className="text-slate-200">not</strong> the <code className="text-slate-300">anon</code>{" "}
          key). The service role bypasses Row Level Security for server routes — keep it server-side only; it is never sent
          to browsers. Free-tier projects work.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          If your Supabase project is <strong className="text-slate-200">connected to GitHub</strong>, that link is for
          syncing migrations and config from your repository into Supabase. This app still needs the URL and service role
          here so server routes (RSS Import Builder, cron) can talk to the database at runtime — it does not use your GitHub
          token for that.
        </p>
        <p className="mt-3 rounded-lg border border-amber-800/25 bg-amber-100 p-3 text-xs leading-5 text-slate-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-50">
          <strong className="font-bold text-slate-950 dark:text-amber-100">First-time setup:</strong> you must create the RSS tables in this Supabase
          project once. Open <strong className="font-bold text-slate-950 dark:text-amber-100">Supabase → SQL Editor</strong>, copy the full script from{" "}
          <code className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-slate-800 ring-1 ring-amber-300/80 dark:bg-black/30 dark:text-amber-100 dark:ring-amber-600/50">
            supabase/migrations/20260207120000_rss_import_builder.sql
          </code>{" "}
          in this repository, paste, and <strong className="font-bold text-slate-950 dark:text-amber-100">Run</strong>. If you see &quot;rss_feeds&quot; / schema
          cache errors, that migration has not been applied to this project yet. If you see <strong className="font-bold text-slate-950 dark:text-amber-100">row-level security</strong> when creating a feed, paste the <strong className="font-bold text-slate-950 dark:text-amber-100">service_role</strong> key (not anon) and run{" "}
          <code className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-slate-800 ring-1 ring-amber-300/80 dark:bg-black/30 dark:text-amber-100 dark:ring-amber-600/50">
            supabase/migrations/20260209140000_rss_builder_privileges.sql
          </code>{" "}
          once.
        </p>
        {status?.supabase.configured && (
          <p className="mt-3 text-xs text-slate-500">
            Stored project host:{" "}
            <span className="font-mono text-slate-300">{status.supabaseUrlHost || "(unknown)"}</span>
            {status.supabaseServiceRoleKeyMasked ? (
              <>
                {" "}
                · Service role: <span className="font-mono text-slate-400">{status.supabaseServiceRoleKeyMasked}</span>
              </>
            ) : null}
          </p>
        )}
        <div className="mt-4 space-y-4">
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Project URL
            <input
              type="url"
              className={inputClass}
              value={supabaseUrl}
              onChange={(e) => {
                setSupabaseUrlDirty(true);
                setSupabaseUrl(e.target.value);
              }}
              placeholder="https://your-project-ref.supabase.co (no /rest/v1/)"
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Service role secret
            <input
              type="password"
              className={inputClass}
              value={supabaseServiceRoleKey}
              onChange={(e) => {
                setSupabaseKeyDirty(true);
                setSupabaseServiceRoleKey(e.target.value);
              }}
              placeholder="Paste service_role key (not anon)"
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <R365Button variant="ghost" onClick={() => void testSupabaseConnection()} disabled={supabaseCheckBusy}>
              {supabaseCheckBusy ? "Testing Supabase…" : "Test Supabase connection"}
            </R365Button>
          </div>
          {supabaseCheckMessage ? <p className="text-xs text-emerald-400">{supabaseCheckMessage}</p> : null}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={clearSupabase}
              onChange={(e) => {
                setClearSupabase(e.target.checked);
              }}
            />
            Remove stored Supabase URL and service role key
          </label>
        </div>
      </Panel>

      <Panel title="AI provider API keys">
        <div className="mb-4 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
          <p className="text-sm font-semibold text-white">Secrets are write-only</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Leave a field unchanged to keep the existing stored value. Paste a new key to replace it, or tick remove to
            clear the stored secret. Environment variables still override saved admin settings.
          </p>
        </div>
        <div className="space-y-4">
          {status?.adminTokenRequired && (
            <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">Admin token</p>
                  <p className="mt-1 text-xs text-slate-500">Required before protected settings can be saved.</p>
                </div>
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs font-bold text-amber-200">
                  Required
                </span>
              </div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                ADMIN_TOKEN
                <input
                  type="password"
                  className={inputClass}
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Same as ADMIN_TOKEN in .env.local"
                  autoComplete="off"
                />
              </label>
            </div>
          )}
          <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">ElevenLabs</p>
                <p className="mt-1 text-xs text-slate-500">Voice generation and audio narration.</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Live uses Netlify <code className="text-slate-400">ELEVENLABS_API_KEY</code> first when set.
                </p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${status?.elevenlabs.configured ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]" : "border-slate-700 bg-slate-900/40 text-slate-500"}`}>
                {status?.elevenlabs.configured ? "Key on file" : "Not set"}
              </span>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              ELEVENLABS_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearElevenlabsKey
                    ? ""
                    : elevenlabsApiKey || (elevenlabsKeyDirty ? "" : (status?.elevenlabsApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setElevenlabsKeyDirty(true);
                  setElevenlabsApiKey(e.target.value);
                }}
                placeholder={status?.elevenlabs.configured ? "Leave blank to keep existing, or enter new key" : "sk_…"}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearElevenlabsKey}
                onChange={(e) => setClearElevenlabsKey(e.target.checked)}
              />
              Remove stored ElevenLabs key
            </label>
            <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
              <p className="text-[11px] normal-case text-slate-400">
                Manage keys and usage in ElevenLabs without exposing secret values in this panel.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <a
                  className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open ElevenLabs API keys →
                </a>
                <a
                  className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                  href="https://elevenlabs.io/app/billing"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open ElevenLabs usage / billing →
                </a>
              </div>
              <div className="mt-3">
                <R365Button variant="ghost" onClick={() => void testElevenLabsConnection()} disabled={elevenlabsCheckBusy}>
                  {elevenlabsCheckBusy ? "Testing ElevenLabs…" : "Test ElevenLabs key"}
                </R365Button>
              </div>
              {elevenlabsCheckMessage && (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{elevenlabsCheckMessage}</p>
              )}
              {elevenlabsLastCheckAt && (
                <p
                  className={`mt-1 text-[11px] normal-case ${
                    elevenlabsLastCheckOk ? "text-[#22c55e]" : "text-amber-300"
                  }`}
                >
                  Last ElevenLabs check: {elevenlabsLastCheckOk ? "PASS" : "FAIL"} at{" "}
                  {new Date(elevenlabsLastCheckAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">OpenAI</p>
                <p className="mt-1 text-xs text-slate-500">AI generation, rewrite, captions, article creation and testing.</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${status?.openai.configured ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]" : "border-slate-700 bg-slate-900/40 text-slate-500"}`}>
                {status?.openai.configured ? "Key on file" : "Not set"}
              </span>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              OPENAI_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearOpenaiKey
                    ? ""
                    : openaiApiKey || (openaiKeyDirty ? "" : (status?.openaiApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setOpenaiKeyDirty(true);
                  setOpenaiApiKey(e.target.value);
                }}
                placeholder={status?.openai.configured ? "Leave blank to keep existing, or enter new key" : "sk-…"}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={clearOpenaiKey} onChange={(e) => setClearOpenaiKey(e.target.checked)} />
              Remove stored OpenAI key
            </label>
            <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
              <p className="text-[11px] normal-case text-slate-400">
                Manage keys in OpenAI platform, then test connection here before saving.
              </p>
              <a
                className="mt-2 inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                href="https://platform.openai.com/settings/organization/api-keys?utm_source=chatgpt.com"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open OpenAI API keys →
              </a>
              <div className="mt-3">
                <R365Button variant="ghost" onClick={() => void testOpenAiConnection()} disabled={openaiCheckBusy}>
                  {openaiCheckBusy ? "Testing OpenAI…" : "Test OpenAI connection"}
                </R365Button>
              </div>
              <div className="mt-3 space-y-2">
                <label className="block text-[11px] font-semibold normal-case text-slate-500">
                  Caption test prompt
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={captionPrompt}
                    onChange={(e) => setCaptionPrompt(e.target.value)}
                    placeholder="Write one punchy social caption for F1 race results in under 20 words."
                  />
                </label>
                <R365Button variant="ghost" onClick={() => void testCaptionGeneration()} disabled={captionCheckBusy}>
                  {captionCheckBusy ? "Generating caption…" : "Test caption generation"}
                </R365Button>
                {captionResult && (
                  <div className="rounded-md border border-[#1f2d26] bg-[#0f1512] p-2">
                    <p className="text-[11px] normal-case text-slate-400">Generated caption preview:</p>
                    <p className="mt-1 text-sm normal-case text-white">{captionResult}</p>
                  </div>
                )}
              </div>
              {openaiCheckMessage && <p className="mt-2 text-xs normal-case text-[#22c55e]">{openaiCheckMessage}</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">DeepSeek</p>
                <p className="mt-1 text-xs text-slate-500">
                  Optional low-cost AI processing layer. Routing is off until you enable it — OpenAI remains the premium
                  editorial layer.
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                  status?.deepseek.configured
                    ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]"
                    : "border-slate-700 bg-slate-900/40 text-slate-500"
                }`}
              >
                {status?.deepseek.configured ? "Key on file" : "Not set"}
              </span>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              DEEPSEEK_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearDeepseekKey
                    ? ""
                    : deepseekApiKey || (deepseekKeyDirty ? "" : (status?.deepseekApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setDeepseekKeyDirty(true);
                  setDeepseekApiKey(e.target.value);
                }}
                placeholder={status?.deepseek.configured ? "••••••••  enter new key to replace" : "sk-…"}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={clearDeepseekKey} onChange={(e) => setClearDeepseekKey(e.target.checked)} />
              Remove stored DeepSeek key
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-slate-500">
                DEEPSEEK_MODEL
                <input
                  className={inputClass}
                  value={deepseekModel}
                  onChange={(e) => setDeepseekModel(e.target.value)}
                  placeholder="deepseek-chat"
                />
              </label>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                DEFAULT_AI_PROVIDER
                <select
                  className={inputClass}
                  value={defaultAiProvider}
                  onChange={(e) => setDefaultAiProvider(e.target.value as "openai" | "deepseek")}
                >
                  <option value="openai">openai</option>
                  <option value="deepseek">deepseek</option>
                </select>
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={enableDeepseek} onChange={(e) => setEnableDeepseek(e.target.checked)} />
              Enable DeepSeek processing layer (ENABLE_DEEPSEEK)
            </label>
            <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
              <p className="text-[11px] normal-case text-slate-400">
                OpenAI-compatible API at <code className="text-slate-500">https://api.deepseek.com</code>. Save settings
                after entering a key, then test before enabling routing.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <a
                  className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                  href="https://platform.deepseek.com/api_keys"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open DeepSeek API keys →
                </a>
                <a
                  className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                  href="https://platform.deepseek.com/usage"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open DeepSeek usage →
                </a>
                <a
                  className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                  href="https://api-docs.deepseek.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  DeepSeek API docs →
                </a>
              </div>
              <div className="mt-3">
                <R365Button variant="ghost" onClick={() => void testDeepSeekConnection()} disabled={deepseekCheckBusy}>
                  {deepseekCheckBusy ? "Testing DeepSeek…" : "Test DeepSeek key"}
                </R365Button>
              </div>
              {deepseekCheckMessage ? (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{deepseekCheckMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">Runway</p>
                <p className="mt-1 text-xs text-slate-500">Image/video generation and creative media workflows.</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${status?.runwayml.configured ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]" : "border-slate-700 bg-slate-900/40 text-slate-500"}`}>
                {status?.runwayml.configured ? "Secret on file" : "Not set"}
              </span>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              RUNWAYML_API_SECRET
              <input
                type="password"
                className={inputClass}
                value={
                  clearRunwaymlKey
                    ? ""
                    : runwaymlApiKey || (runwayKeyDirty ? "" : (status?.runwaymlApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setRunwayKeyDirty(true);
                  setRunwaymlApiKey(e.target.value);
                }}
                placeholder={status?.runwayml.configured ? "Leave blank to keep existing, or enter new secret" : "key_…"}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearRunwaymlKey}
                onChange={(e) => setClearRunwaymlKey(e.target.checked)}
              />
              Remove stored Runway secret
            </label>
            <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
              <p className="text-[11px] normal-case text-slate-400">
                Create a key in the Runway developer portal (org → API keys). Keys start with{" "}
                <code className="text-slate-500">key_</code>. Use{" "}
                <code className="text-slate-500">RUNWAYML_API_SECRET</code> in{" "}
                <code className="text-slate-500">.env.local</code> to override stored settings.
              </p>
              <a
                className="mt-2 inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                href="https://dev.runwayml.com/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open Runway developer portal →
              </a>
              <div className="mt-3">
                <R365Button variant="ghost" onClick={() => void testRunwayConnection()} disabled={runwayCheckBusy}>
                  {runwayCheckBusy ? "Testing Runway…" : "Test Runway connection"}
                </R365Button>
              </div>
              {runwayCheckMessage && (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{runwayCheckMessage}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#1f2d26] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">Higgsfield</p>
                <p className="mt-1 text-xs text-slate-500">
                  AI image edit (Tools → AI Image Editor). Uses{" "}
                  <code className="text-slate-500">HF_CREDENTIALS</code> or separate HF keys.
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${status?.higgsfield.configured ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]" : "border-slate-700 bg-slate-900/40 text-slate-500"}`}
              >
                {status?.higgsfield.configured ? "Keys on file" : "Not set"}
              </span>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              HF_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearHiggsfieldKeys
                    ? ""
                    : higgsfieldApiKey ||
                      (higgsfieldKeyDirty ? "" : (status?.higgsfieldApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setHiggsfieldKeyDirty(true);
                  setHiggsfieldApiKey(e.target.value);
                }}
                placeholder={
                  status?.higgsfield.configured
                    ? "Leave blank to keep existing, or paste new key id"
                    : "Key id from Higgsfield Cloud"
                }
                autoComplete="off"
              />
            </label>
            <label className="mt-2 block text-xs font-semibold uppercase text-slate-500">
              HF_API_SECRET
              <input
                type="password"
                className={inputClass}
                value={
                  clearHiggsfieldKeys
                    ? ""
                    : higgsfieldApiSecret ||
                      (higgsfieldSecretDirty ? "" : (status?.higgsfieldApiSecretMasked ?? ""))
                }
                onChange={(e) => {
                  setHiggsfieldSecretDirty(true);
                  setHiggsfieldApiSecret(e.target.value);
                }}
                placeholder={
                  status?.higgsfield.configured
                    ? "Leave blank to keep existing, or paste new secret"
                    : "API secret"
                }
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearHiggsfieldKeys}
                onChange={(e) => setClearHiggsfieldKeys(e.target.checked)}
              />
              Remove stored Higgsfield key + secret
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              HIGGSFIELD_IMAGE_EDIT_ENDPOINT (optional)
              <input
                type="text"
                className={inputClass}
                value={higgsfieldImageEditEndpoint}
                onChange={(e) => setHiggsfieldImageEditEndpoint(e.target.value)}
                placeholder="flux-pro/kontext/max/text-to-image"
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearHiggsfieldImageEndpoint}
                onChange={(e) => setClearHiggsfieldImageEndpoint(e.target.checked)}
              />
              Clear stored endpoint override (defaults apply)
            </label>
            <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
              <p className="text-[11px] normal-case text-slate-400">
                Create credentials at{" "}
                <a className="text-[#22c55e] hover:underline" href="https://cloud.higgsfield.ai/" target="_blank" rel="noreferrer noopener">
                  cloud.higgsfield.ai
                </a>
                . Source images must be reachable over HTTPS (production URL or tunnel); localhost URLs will not work
                for remote fetch.
              </p>
              <p className="mt-2 text-[11px] normal-case text-slate-500">
                &quot;Test&quot; calls status for a fake job id: <strong className="text-slate-400">404 means your keys worked</strong> (no job,
                no charge). Only 401/403 mean invalid credentials.
              </p>
              <a
                className="mt-2 inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                href="https://docs.higgsfield.ai/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Higgsfield API docs →
              </a>
              <div className="mt-3">
                <R365Button variant="ghost" onClick={() => void testHiggsfieldConnection()} disabled={higgsfieldCheckBusy}>
                  {higgsfieldCheckBusy ? "Testing Higgsfield…" : "Test Higgsfield credentials"}
                </R365Button>
              </div>
              {higgsfieldCheckMessage && (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{higgsfieldCheckMessage}</p>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="YouTube Data API">
        <p className="text-sm text-slate-400">
          Used by Video Search &amp; Import for keyword search. Save the key here or set the server variable YOUTUBE_API_KEY.
          The stored value stays on the server. This form shows only whether it is configured.
        </p>
        <label className="mt-3 block text-xs font-semibold text-slate-300">
          YouTube Data API key
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={youtubeKeyDirty ? youtubeApiKey : (status?.youtubeApiKeyMasked ?? "")}
            placeholder={status?.youtube?.configured ? "Configured" : "Not configured"}
            onChange={(e) => {
              setYoutubeKeyDirty(true);
              setYoutubeApiKey(e.target.value);
            }}
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={clearYoutubeKey} onChange={(e) => setClearYoutubeKey(e.target.checked)} />
          Remove stored YouTube key
        </label>
        <p className="mt-2 text-xs text-slate-500">
          {status?.youtube?.configured
            ? `Configured from ${status.youtube.source === "environment" ? "the server environment" : "admin settings"}.`
            : "Not configured. Keyword search stays closed until a key is saved."}
        </p>
      </Panel>

      <Panel title="YouTube transcript import (Apify)">
        <p className="text-sm text-slate-400">
          Used by Tools → YouTube Script Importer after owned-channel YouTube captions are unavailable. Environment
          variables still override these stored values.
        </p>
        <div className="mt-3 rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
          <p className="text-xs font-semibold text-slate-300">
            Default actor: Youtube Caption &amp; Transcript Scraper - Bulk, Rich, Precise
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Actor ID: <code>apilabs/youtube-caption-transcription-scraper</code>
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
              href="https://apify.com/apilabs/youtube-caption-transcription-scraper"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open default Apify actor →
            </a>
            <a
              className="inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
              href="https://console.apify.com/settings/integrations"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open Apify integrations →
            </a>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-xs font-semibold uppercase text-slate-500">
            APIFY_API_TOKEN
            <input
              type="password"
              className={inputClass}
              value={
                clearApifyApiToken
                  ? ""
                  : apifyApiToken || (apifyTokenDirty ? "" : (status?.apifyApiTokenMasked ?? ""))
              }
              onChange={(e) => {
                setApifyTokenDirty(true);
                setApifyApiToken(e.target.value);
              }}
              placeholder={status?.apify.configured ? "••••••••  enter new token to replace" : "apify_api_…"}
              autoComplete="off"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearApifyApiToken}
                onChange={(e) => setClearApifyApiToken(e.target.checked)}
              />
              Remove stored Apify token
            </label>
            <div className="mt-3">
              <R365Button variant="ghost" onClick={() => void testApifyConnection()} disabled={apifyCheckBusy}>
                {apifyCheckBusy ? "Testing Apify…" : "Test Apify token"}
              </R365Button>
              {apifyCheckMessage ? (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{apifyCheckMessage}</p>
              ) : null}
            </div>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID
            <input
              className={inputClass}
              value={apifyYoutubeTranscriptActorId}
              onChange={(e) => setApifyYoutubeTranscriptActorId(e.target.value)}
              placeholder="apilabs/youtube-caption-transcription-scraper"
            />
            <p className="mt-1 text-[11px] normal-case text-slate-500">
              Default: <code>apilabs/youtube-caption-transcription-scraper</code>
            </p>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase text-slate-500">
              APIFY_YOUTUBE_TRANSCRIPT_LANGUAGE
              <input
                className={inputClass}
                value={apifyYoutubeTranscriptLanguage}
                onChange={(e) => setApifyYoutubeTranscriptLanguage(e.target.value)}
                placeholder="en"
              />
            </label>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              APIFY_YOUTUBE_TRANSCRIPT_TIMEOUT_SECONDS
              <input
                className={inputClass}
                value={apifyYoutubeTranscriptTimeoutSeconds}
                onChange={(e) => setApifyYoutubeTranscriptTimeoutSeconds(e.target.value)}
                placeholder="90"
              />
            </label>
          </div>
        </div>
      </Panel>

      <Panel title="Live streaming & Live Control keys (Restream · Mux · optional Livepeer)">
        <p className="text-sm text-slate-400">
          <strong className="text-slate-300">Primary store for Live Control:</strong> save here (same file as other
          API keys). Redirect URL for Restream OAuth apps:{" "}
          <code className="text-slate-500">https://yourdomain.com/api/integrations/restream/callback</code> — Mux
          webhooks: <code className="text-slate-500">/api/webhooks/mux</code>. Env vars override stored values when
          set.
        </p>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Restream</p>
            <a
              className="mt-1 inline-flex text-[11px] text-[#22c55e] hover:underline"
              href="https://restream.io"
              target="_blank"
              rel="noreferrer noopener"
            >
              restream.io → Developer / Apps
            </a>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              RESTREAM_CLIENT_ID
              <input
                type="password"
                className={inputClass}
                value={
                  clearRestreamKeys
                    ? ""
                    : restreamClientId ||
                      (restreamIdDirty ? "" : (status?.restreamClientIdMasked ?? ""))
                }
                onChange={(e) => {
                  setRestreamIdDirty(true);
                  setRestreamClientId(e.target.value);
                }}
                placeholder={status?.restream.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              RESTREAM_CLIENT_SECRET
              <input
                type="password"
                className={inputClass}
                value={
                  clearRestreamKeys
                    ? ""
                    : restreamClientSecret ||
                      (restreamSecretDirty ? "" : (status?.restreamClientSecretMasked ?? ""))
                }
                onChange={(e) => {
                  setRestreamSecretDirty(true);
                  setRestreamClientSecret(e.target.value);
                }}
                placeholder={status?.restream.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearRestreamKeys}
                onChange={(e) => setClearRestreamKeys(e.target.checked)}
              />
              Remove stored Restream credentials
            </label>
            <div className="mt-3">
              <R365Button variant="ghost" onClick={() => void testRestreamCredentials()} disabled={restreamCheckBusy}>
                {restreamCheckBusy ? "Testing Restream…" : "Test Restream credentials"}
              </R365Button>
              {restreamCheckMessage ? (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{restreamCheckMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Mux</p>
            <a
              className="mt-1 inline-flex text-[11px] text-[#22c55e] hover:underline"
              href="https://mux.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              mux.com → Settings → Access tokens (Video read + write)
            </a>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Use the <strong className="text-slate-400">Access Token</strong> ID and secret from the same Mux
              environment (dev vs production are different). A 401 from “Test Mux tokens” means that pair was
              rejected — check for swapped fields, extra quotes in <code className="text-slate-500">.env</code>, or a
              Signing Key mistaken for the token secret.
            </p>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              MUX_TOKEN_ID
              <input
                type="password"
                className={inputClass}
                value={
                  clearMuxKeys ? "" : muxTokenId || (muxIdDirty ? "" : (status?.muxTokenIdMasked ?? ""))
                }
                onChange={(e) => {
                  setMuxIdDirty(true);
                  setMuxTokenId(e.target.value);
                }}
                placeholder={status?.mux.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              MUX_TOKEN_SECRET
              <input
                type="password"
                className={inputClass}
                value={
                  clearMuxKeys
                    ? ""
                    : muxTokenSecret || (muxSecretDirty ? "" : (status?.muxTokenSecretMasked ?? ""))
                }
                onChange={(e) => {
                  setMuxSecretDirty(true);
                  setMuxTokenSecret(e.target.value);
                }}
                placeholder={status?.mux.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              MUX_WEBHOOK_SIGNING_SECRET (Live Control webhooks)
              <input
                type="password"
                className={inputClass}
                value={
                  clearMuxWebhookSecret
                    ? ""
                    : muxWebhookSigningSecret ||
                      (muxWebhookDirty ? "" : (status?.muxWebhookSigningSecretMasked ?? ""))
                }
                onChange={(e) => {
                  setMuxWebhookDirty(true);
                  setMuxWebhookSigningSecret(e.target.value);
                }}
                placeholder={status?.muxWebhook?.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              From Mux dashboard → Webhooks → your endpoint signing secret. Required in production to verify{" "}
              <code className="text-slate-500">POST /api/webhooks/mux</code>.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={clearMuxKeys} onChange={(e) => setClearMuxKeys(e.target.checked)} />
              Remove stored Mux tokens
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearMuxWebhookSecret}
                onChange={(e) => setClearMuxWebhookSecret(e.target.checked)}
              />
              Remove stored Mux webhook signing secret
            </label>
            <div className="mt-3">
              <R365Button variant="ghost" onClick={() => void testMuxTokens()} disabled={muxCheckBusy}>
                {muxCheckBusy ? "Testing Mux…" : "Test Mux tokens"}
              </R365Button>
              {muxCheckMessage ? <p className="mt-2 text-xs normal-case text-[#22c55e]">{muxCheckMessage}</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Daily video rooms</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Used for Audio with Guests shared camera rooms. Planet Sport Studio will use Daily for live video while keeping audio recording separate.
            </p>
            <a
              className="mt-2 inline-flex text-[11px] text-[#22c55e] hover:underline"
              href="https://docs.daily.co/guides/create-and-manage-rooms-with-the-rest-api"
              target="_blank"
              rel="noreferrer noopener"
            >
              Daily REST API docs →
            </a>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              DAILY_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearDailyApiKey
                    ? ""
                    : dailyApiKey || (dailyKeyDirty ? "" : (status?.dailyApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setDailyKeyDirty(true);
                  setDailyApiKey(e.target.value);
                }}
                placeholder={status?.daily?.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearDailyApiKey}
                onChange={(e) => setClearDailyApiKey(e.target.checked)}
              />
              Remove stored Daily API key
            </label>
            <div className="mt-3">
              <R365Button variant="ghost" onClick={() => void testDailyKey()} disabled={dailyCheckBusy}>
                {dailyCheckBusy ? "Testing Daily…" : "Test Daily key"}
              </R365Button>
              {dailyCheckMessage ? (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{dailyCheckMessage}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-[#1f2d26] bg-[#0a0e0c] p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Livepeer (optional)</p>
            <p className="mt-1 text-[11px] text-slate-500">Not required for v1 — alternative live provider.</p>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              LIVEPEER_API_KEY
              <input
                type="password"
                className={inputClass}
                value={
                  clearLivepeerKey
                    ? ""
                    : livepeerApiKey || (livepeerKeyDirty ? "" : (status?.livepeerApiKeyMasked ?? ""))
                }
                onChange={(e) => {
                  setLivepeerKeyDirty(true);
                  setLivepeerApiKey(e.target.value);
                }}
                placeholder={status?.livepeer.configured ? "••••••••" : ""}
                autoComplete="off"
              />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearLivepeerKey}
                onChange={(e) => setClearLivepeerKey(e.target.checked)}
              />
              Remove stored Livepeer key
            </label>
            <div className="mt-3">
              <R365Button variant="ghost" onClick={() => void testLivepeerKey()} disabled={livepeerCheckBusy}>
                {livepeerCheckBusy ? "Testing Livepeer…" : "Test Livepeer key"}
              </R365Button>
              {livepeerCheckMessage ? (
                <p className="mt-2 text-xs normal-case text-[#22c55e]">{livepeerCheckMessage}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="AI billing & usage">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-400">
              Read-only provider usage checks for quota, spend and permission issues. OpenAI and ElevenLabs are connected
              through provider APIs; Claude and DeepSeek are staged for follow-up connectors.
            </p>
            {aiUsage?.generatedAt ? (
              <p className="mt-2 text-xs text-slate-500">
                Last refreshed {new Date(aiUsage.generatedAt).toLocaleString()} · {aiUsage.days ?? 30} day window
              </p>
            ) : null}
          </div>
          <R365Button variant="ghost" onClick={() => void loadAiUsage()} disabled={aiUsageBusy}>
            {aiUsageBusy ? "Loading usage…" : "Refresh usage"}
          </R365Button>
        </div>
        {aiUsageError ? <p className="mt-3 text-xs font-semibold text-amber-300">{aiUsageError}</p> : null}
        <div className="mt-4 grid gap-3">
          {(aiUsage?.providers ?? [
            {
              provider: "openai",
              label: "OpenAI",
              state: status?.openai.configured ? "permission_required" : "missing_key",
              summary: status?.openai.configured ? "Refresh usage to check organization cost and token data." : "No OpenAI key is configured.",
              dashboardUrl: "https://platform.openai.com/usage",
            },
            {
              provider: "elevenlabs",
              label: "ElevenLabs",
              state: status?.elevenlabs.configured ? "permission_required" : "missing_key",
              summary: status?.elevenlabs.configured ? "Refresh usage to check subscription and character limits." : "No ElevenLabs key is configured.",
              dashboardUrl: "https://elevenlabs.io/app/usage",
            },
            {
              provider: "claude",
              label: "Claude",
              state: "unsupported",
              summary: "Planned connector. Requires Anthropic Admin API access for usage and cost reports.",
              dashboardUrl: "https://console.anthropic.com/settings/usage",
            },
            {
              provider: "deepseek",
              label: "DeepSeek",
              state: status?.deepseek.configured ? "permission_required" : "missing_key",
              summary: status?.deepseek.configured
                ? "Key configured. Usage dashboard available; in-app usage logging records Plexa AI calls."
                : "No DeepSeek key is configured.",
              dashboardUrl: "https://platform.deepseek.com/usage",
            },
          ] as AiUsageProvider[]).map((provider) => (
            <div key={provider.provider} className="rounded-xl border border-[#1f2d26] bg-[#0a0e0c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{provider.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{provider.summary}</p>
                  {provider.error ? <p className="mt-1 text-[11px] text-amber-300">{provider.error}</p> : null}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${
                    provider.state === "ready"
                      ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]"
                      : provider.state === "unsupported"
                        ? "border-slate-700 bg-slate-900/40 text-slate-400"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {provider.state.replace(/_/g, " ")}
                </span>
              </div>
              {provider.metrics?.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {provider.metrics.map((metric) => (
                    <div key={`${provider.provider}-${metric.label}`} className="rounded-lg border border-[#1f2d26] bg-black/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-100">{metric.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <a
                className="mt-3 inline-flex text-[11px] font-semibold normal-case text-[#22c55e] hover:underline"
                href={provider.dashboardUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open {provider.label} usage dashboard →
              </a>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Voice & FFmpeg options">
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase text-slate-500">
            FFmpeg path (optional)
            <input
              className={inputClass}
              value={ffmpegPath}
              onChange={(e) => setFfmpegPath(e.target.value)}
              placeholder="/opt/homebrew/bin/ffmpeg"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={clearFfmpegPath}
                onChange={(e) => setClearFfmpegPath(e.target.checked)}
              />
              Remove stored FFmpeg path (fall back to auto-detect)
            </label>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            OpenAI TTS voice / model
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <input
                className={inputClass}
                value={openaiTtsVoice}
                onChange={(e) => setOpenaiTtsVoice(e.target.value)}
                placeholder="nova"
              />
              <input
                className={inputClass}
                value={openaiTtsModel}
                onChange={(e) => setOpenaiTtsModel(e.target.value)}
                placeholder="tts-1"
              />
            </div>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            OpenAI image model (text-to-image)
            <input
              className={inputClass}
              value={openaiImageModel}
              onChange={(e) => setOpenaiImageModel(e.target.value)}
              placeholder="gpt-image-1 (default if empty)"
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Override with{" "}
              <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-slate-400">OPENAI_IMAGE_MODEL</code> env.
              Use the exact model id your OpenAI project exposes (e.g.{" "}
              <code className="font-mono text-slate-400">gpt-image-1</code>,{" "}
              <code className="font-mono text-slate-400">dall-e-2</code>).
            </span>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            ElevenLabs voice ID / model
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <input
                className={inputClass}
                value={elevenlabsVoiceId}
                onChange={(e) => setElevenlabsVoiceId(e.target.value)}
                placeholder="Default from env or ElevenLabs UI"
              />
              <input
                className={inputClass}
                value={elevenlabsModel}
                onChange={(e) => setElevenlabsModel(e.target.value)}
                placeholder="eleven_multilingual_v2"
              />
            </div>
          </label>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <R365Button onClick={() => void save()} disabled={busy}>
          Save settings
        </R365Button>
        <R365Button variant="ghost" onClick={() => void load()} disabled={busy}>
          Reload
        </R365Button>
      </div>
      {message && <p className="text-sm text-[#22c55e]">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
