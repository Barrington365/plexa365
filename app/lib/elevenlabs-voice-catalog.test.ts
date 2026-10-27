import { describe, expect, it } from "vitest";
import { includeSamVoice, SAM_ELEVENLABS_VOICE } from "@/app/lib/elevenlabs-voice-catalog";

describe("includeSamVoice", () => {
  it("adds the premade Sam voice when the account list does not include him", () => {
    const voices = includeSamVoice([
      { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
    ]);
    expect(voices.map((voice) => voice.name)).toEqual(["George", "Sam"]);
    expect(voices[1]?.voice_id).toBe(SAM_ELEVENLABS_VOICE.voice_id);
  });

  it("keeps an account voice already named Sam", () => {
    const custom = { voice_id: "custom-sam", name: "Sam", category: "cloned" };
    expect(includeSamVoice([custom])).toEqual([custom]);
  });
});
