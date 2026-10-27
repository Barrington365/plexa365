import { getServerSecretAsync } from "@/app/lib/server-secrets";
import { DummyAudioProvider } from "./dummy-audio-provider";
import { ElevenLabsAudioProvider } from "./elevenlabs-provider";
import { MacosSayAudioProvider } from "./macos-say-provider";
import { OpenAiTtsAudioProvider } from "./openai-tts-provider";
import type { AudioProvider, ResolvedVoiceTrack, VoiceProviderPreference, VoiceTrackOptions } from "./types";

let audioSingleton: AudioProvider | null = null;

/**
 * Voice priority: ElevenLabs → OpenAI TTS → macOS `say` (Darwin) → dummy/silent.
 * Set USE_MACOS_SAY=0 to skip local `say` and use dummy when no cloud keys.
 */
async function createDefaultAudioProvider(): Promise<AudioProvider> {
  if (await getServerSecretAsync("ELEVENLABS_API_KEY")) {
    return new ElevenLabsAudioProvider();
  }
  if (await getServerSecretAsync("OPENAI_API_KEY")) {
    return new OpenAiTtsAudioProvider();
  }
  if (process.platform === "darwin" && process.env.USE_MACOS_SAY !== "0") {
    return new MacosSayAudioProvider();
  }
  return new DummyAudioProvider();
}

export async function getAudioProvider(): Promise<AudioProvider> {
  if (!audioSingleton) {
    audioSingleton = await createDefaultAudioProvider();
  }
  return audioSingleton;
}

export function normalizeVoiceProviderPreference(value: unknown): VoiceProviderPreference {
  return value === "elevenlabs" || value === "openai" || value === "auto" ? value : "auto";
}

function fallbackReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 220);
}

async function resolveLocalFallbackProvider(): Promise<{ provider: AudioProvider; name: ResolvedVoiceTrack["provider"] }> {
  if (process.platform === "darwin" && process.env.USE_MACOS_SAY !== "0") {
    return { provider: new MacosSayAudioProvider(), name: "macos-say" };
  }
  return { provider: new DummyAudioProvider(), name: "dummy" };
}

export async function resolveVoiceTrackWithFallback(
  script: string,
  contentId: string,
  options?: VoiceTrackOptions & { providerPreference?: VoiceProviderPreference },
): Promise<ResolvedVoiceTrack> {
  const preference = options?.providerPreference ?? "auto";
  const hasElevenLabs = await getServerSecretAsync("ELEVENLABS_API_KEY");
  const hasOpenAi = await getServerSecretAsync("OPENAI_API_KEY");

  if (preference === "openai") {
    if (hasOpenAi) {
      return {
        audioPath: await new OpenAiTtsAudioProvider().resolveVoiceTrack(script, contentId, options),
        provider: "openai",
      };
    }
    const local = await resolveLocalFallbackProvider();
    return {
      audioPath: await local.provider.resolveVoiceTrack(script, contentId, options),
      provider: local.name,
      fallbackReason: "OpenAI TTS key is not configured.",
    };
  }

  if (preference === "elevenlabs") {
    return {
      audioPath: await new ElevenLabsAudioProvider().resolveVoiceTrack(script, contentId, options),
      provider: "elevenlabs",
    };
  }

  if (hasElevenLabs) {
    try {
      return {
        audioPath: await new ElevenLabsAudioProvider().resolveVoiceTrack(script, contentId, options),
        provider: "elevenlabs",
      };
    } catch (error) {
      if (options?.voiceId?.trim()) {
        throw new Error(
          `Selected ElevenLabs voice ${options.voiceId.trim()} is unavailable. ${fallbackReason(error)} Nothing else was generated.`,
        );
      }
      if (hasOpenAi) {
        return {
          audioPath: await new OpenAiTtsAudioProvider().resolveVoiceTrack(script, contentId, options),
          provider: "openai",
          fallbackReason: fallbackReason(error),
        };
      }
      throw error;
    }
  }

  if (options?.voiceId?.trim()) {
    throw new Error(
      `Selected ElevenLabs voice ${options.voiceId.trim()} cannot be used because the account is not connected. Nothing was generated.`,
    );
  }

  if (hasOpenAi) {
    return {
      audioPath: await new OpenAiTtsAudioProvider().resolveVoiceTrack(script, contentId, options),
      provider: "openai",
    };
  }

  const local = await resolveLocalFallbackProvider();
  return {
    audioPath: await local.provider.resolveVoiceTrack(script, contentId, options),
    provider: local.name,
  };
}

export function setAudioProvider(p: AudioProvider) {
  audioSingleton = p;
}

export function resetAudioProvider() {
  audioSingleton = null;
}

export type { AudioProvider, ResolvedVoiceTrack, VoiceProviderPreference, VoiceTrackOptions } from "./types";
export { DummyAudioProvider } from "./dummy-audio-provider";
export { ElevenLabsAudioProvider } from "./elevenlabs-provider";
export { OpenAiTtsAudioProvider } from "./openai-tts-provider";
export { MacosSayAudioProvider } from "./macos-say-provider";
