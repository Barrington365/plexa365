/**
 * How the final MP4 gets its soundtrack and motion backdrop (News Shorts build).
 */

export type AudioBuildSource = "voiceRecording" | "tts" | "videoAudio";

export type MotionBackdropSource = "camera" | "backgroundVideo" | "none";

export function resolveAudioBuildSource(voiceRecordingRel: string | undefined | null): AudioBuildSource {
  return voiceRecordingRel?.trim() ? "voiceRecording" : "tts";
}

/** Output MP4 soundtrack when building with optional “use video audio”. */
export function resolveOutputAudioSource(params: {
  useVideoAudio: boolean;
  hasMotionBackdrop: boolean;
  voiceRecordingRel?: string | null;
}): AudioBuildSource {
  if (params.useVideoAudio && params.hasMotionBackdrop) return "videoAudio";
  return resolveAudioBuildSource(params.voiceRecordingRel);
}

/**
 * Resolves which file is the primary “motion backdrop” for previews and render (transparent slides).
 * When both a **non–camera-record** background clip (Runway/upload) and a **camera-record** clip exist, the
 * background file is the full-frame rear layer (`source: "backgroundVideo"`); the build API composites the camera
 * on top as PiP. Otherwise a saved camera clip wins alone, then any background video path.
 */
export function resolveMotionBackdropRel(params: {
  videoRecordingRel?: string | null;
  backgroundVideoRel?: string | null;
}): { rel: string | undefined; source: MotionBackdropSource } {
  const cam = params.videoRecordingRel?.trim();
  const bg = params.backgroundVideoRel?.trim();
  const bgIsBackdropFile = Boolean(bg && !motionBackdropRelLooksLikeCameraRecording(bg));
  const camIsCamera = Boolean(cam && motionBackdropRelLooksLikeCameraRecording(cam));

  if (bgIsBackdropFile && camIsCamera && cam !== bg) {
    return { rel: bg, source: "backgroundVideo" };
  }
  if (cam) return { rel: cam, source: "camera" };
  if (bg) return { rel: bg, source: "backgroundVideo" };
  return { rel: undefined, source: "none" };
}

/**
 * Prefer the library blob path from Render scenes. Absolute paths from that request
 * do not exist on the next Netlify Lambda that encodes the MP4.
 */
export function newsShortRenderedImageRef(
  image: { path?: string; rel?: string } | null | undefined,
): string {
  const rel = (image?.rel ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.startsWith("images/library/") && !rel.includes("..")) return rel;
  return (image?.path ?? "").trim();
}

/** True when the motion backdrop file is a saved News Shorts camera clip (circle still is composed with this only). */
export function motionBackdropRelLooksLikeCameraRecording(rel: string | null | undefined): boolean {
  const n = (rel ?? "").trim().replace(/\\/g, "/");
  if (!n) return false;
  return /(^|\/)camera-record\.(webm|mp4)$/i.test(n);
}
