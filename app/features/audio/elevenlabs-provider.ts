import { elevenLabsCaptionCues } from "@/app/lib/elevenlabs-caption-timing";
import fs from "fs/promises";
import path from "path";
import { outputAudioDir } from "@/app/lib/paths";
import { getServerSecretAsync, getStoredVoiceOptionAsync } from "@/app/lib/server-secrets";
import { applyAudioTempoInPlace } from "./audio-tempo";
import type { AudioProvider, VoiceTrackOptions } from "./types";

const DEFAULT_FEMALE_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
/** Premade male voice (Adam) — override with ELEVENLABS_VOICE_ID_MALE */
const DEFAULT_MALE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export class ElevenLabsAudioProvider implements AudioProvider {
  async resolveVoiceTrack(
    script: string,
    contentId: string,
    options?: VoiceTrackOptions,
  ): Promise<string> {
    const key = await getServerSecretAsync("ELEVENLABS_API_KEY");
    if (!key) {
      throw new Error("ELEVENLABS_API_KEY is required for ElevenLabs TTS");
    }

    const storedFemale =
      await getStoredVoiceOptionAsync("ELEVENLABS_VOICE_ID", "elevenlabsVoiceId") || DEFAULT_FEMALE_VOICE_ID;
    const voiceId =
      options?.voiceId?.trim() ||
      (options?.gender === "male"
        ? process.env.ELEVENLABS_VOICE_ID_MALE?.trim() || DEFAULT_MALE_VOICE_ID
        : options?.gender === "female"
          ? process.env.ELEVENLABS_VOICE_ID_FEMALE?.trim() || storedFemale
          : storedFemale);
    const model =
      await getStoredVoiceOptionAsync("ELEVENLABS_MODEL", "elevenlabsModel") || "eleven_multilingual_v2";
    const text = script.trim();
    const maxChars = 10_000;
    if (text.length > maxChars) {
      throw new Error(
        `Narration is ${text.length} characters. This ElevenLabs model accepts ${maxChars}. Shorten the script before generating. Nothing was generated.`,
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${options?.onCaptionCues ? "/with-timestamps" : ""}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: options?.onCaptionCues ? "application/json" : "audio/mpeg",
      },
      body: JSON.stringify({
        text: text || " ",
        model_id: model,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${err.slice(0, 500)}`);
    }

    const timed = options?.onCaptionCues ? await res.json() : null;
    const buf = timed ? Buffer.from(timed.audio_base64, "base64") : Buffer.from(await res.arrayBuffer());
    const cues = timed ? elevenLabsCaptionCues(timed.normalized_alignment ?? timed.alignment, options?.speed ?? 1) : undefined;
    const dir = outputAudioDir();
    await fs.mkdir(dir, { recursive: true });
    const out = path.join(dir, `${contentId}-elevenlabs.mp3`);
    await fs.writeFile(out, buf);
    const speed = options?.speed ?? 1;
    await applyAudioTempoInPlace(out, speed);
    if (cues) options?.onCaptionCues?.(cues);
    return out;
  }
}
