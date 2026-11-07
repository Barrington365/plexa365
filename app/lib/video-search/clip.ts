export type ClipSelection = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  width: 1920;
  height: 1080;
  format: "mp4";
};

export function parseClipSelection(startRaw: unknown, endRaw: unknown): { ok: true; clip: ClipSelection } | { ok: false; reason: string } {
  const startSeconds = Number(startRaw);
  const endSeconds = Number(endRaw);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return { ok: false, reason: "Enter a start and end time in seconds." };
  }
  if (startSeconds < 0 || endSeconds <= startSeconds) {
    return { ok: false, reason: "The end time must be after the start time." };
  }
  const durationSeconds = Math.round((endSeconds - startSeconds) * 1000) / 1000;
  if (durationSeconds > 30) {
    return { ok: false, reason: "Phase 1 clips are limited to 30 seconds." };
  }
  return { ok: true, clip: { startSeconds, endSeconds, durationSeconds, width: 1920, height: 1080, format: "mp4" } };
}

/** Arguments for the existing FFmpeg renderer. Phase 1 does not run them against a YouTube URL. */
export function authorisedClipFfmpegArgs(input: { file: string; clip: ClipSelection; output: string }): string[] {
  return [
    "-ss",
    String(input.clip.startSeconds),
    "-to",
    String(input.clip.endSeconds),
    "-i",
    input.file,
    "-vf",
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    input.output,
  ];
}
