import { readJsonBlob, writeJsonBlob } from "@/app/lib/netlify-blob-json";
import type { BuildShortPayload } from "@/app/lib/build-short-service";

const STORE = "video-build-jobs";

export function sanitizeVideoBuildError(message: string): string {
  const trimmed = message.trim();
  if (/inactivity timeout/i.test(trimmed)) {
    return "Video build stopped by hosting inactivity timeout before completion.";
  }
  if (/^<!doctype html|^<html/i.test(trimmed)) {
    return "Video build failed due to a hosting timeout.";
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
}

export type VideoBuildJobRecord = {
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  contentId?: string;
  phase?: string;
  error?: string;
  debug?: unknown;
  videoPath?: string;
  srtPath?: string;
  concatPath?: string;
  audioPath?: string;
  voiceProvider?: string;
  voiceFallbackReason?: string;
  seoTitle?: string;
  seoSlug?: string;
  /** Full News Shorts build payload, including videoRel, when that job completes. */
  result?: Record<string, unknown>;
};

/** If a running job has not heartbeated recently, the worker likely died on the host. */
export const STALE_RUNNING_JOB_MS = 120_000;

/** Pending jobs that never reach running — invoke failed or worker never started. */
export const STALE_PENDING_JOB_MS = 90_000;

export function isStaleRunningJob(job: VideoBuildJobRecord): boolean {
  return job.status === "running" && Date.now() - job.updatedAt > STALE_RUNNING_JOB_MS;
}

export function isStalePendingJob(job: VideoBuildJobRecord): boolean {
  return job.status === "pending" && Date.now() - job.createdAt > STALE_PENDING_JOB_MS;
}

export async function touchVideoBuildJobProgress(jobId: string, phase: string): Promise<void> {
  const current = await getVideoBuildJob(jobId);
  if (!current || current.status === "completed" || current.status === "failed") return;
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    ...current,
    status: "running",
    phase,
    updatedAt: Date.now(),
  });
}

export async function resolveStaleVideoBuildJob(jobId: string): Promise<VideoBuildJobRecord | null> {
  const job = await getVideoBuildJob(jobId);
  if (!job) return null;
  if (isStalePendingJob(job)) {
    await failVideoBuildJob(
      jobId,
      "Background worker never started — check Netlify function logs or redeploy, then try again.",
    );
    return getVideoBuildJob(jobId);
  }
  if (isStaleRunningJob(job)) {
    await failVideoBuildJob(
      jobId,
      "Video build stopped unexpectedly — the host likely timed out. Try again after the latest deploy finishes.",
    );
    return getVideoBuildJob(jobId);
  }
  return job;
}

export async function createVideoBuildJob(jobId: string, contentId: string): Promise<void> {
  const now = Date.now();
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    status: "pending",
    createdAt: now,
    updatedAt: now,
    contentId,
  });
}

export async function getVideoBuildJob(jobId: string): Promise<VideoBuildJobRecord | null> {
  return readJsonBlob<VideoBuildJobRecord>(STORE, jobId);
}

export async function markVideoBuildJobRunning(jobId: string): Promise<void> {
  const current = await getVideoBuildJob(jobId);
  if (!current) return;
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    ...current,
    status: "running",
    updatedAt: Date.now(),
  });
}

export async function completeVideoBuildJob(jobId: string, payload: BuildShortPayload): Promise<void> {
  const current = await getVideoBuildJob(jobId);
  const now = Date.now();
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    ...(current ?? { createdAt: now, contentId: undefined }),
    ...payload,
    status: "completed",
    updatedAt: now,
  });
}

export async function completeVideoBuildJobResult(
  jobId: string,
  result: { videoRel: string },
): Promise<void> {
  const current = await getVideoBuildJob(jobId);
  const now = Date.now();
  const stored = result as unknown as Record<string, unknown>;
  const videoRel = result.videoRel;
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    ...(current ?? { createdAt: now, contentId: undefined }),
    status: "completed",
    updatedAt: now,
    videoPath: videoRel,
    result: stored,
  });
}

export async function failVideoBuildJob(jobId: string, error: string, debug?: unknown): Promise<void> {
  const current = await getVideoBuildJob(jobId);
  const now = Date.now();
  await writeJsonBlob<VideoBuildJobRecord>(STORE, jobId, {
    ...(current ?? { createdAt: now, contentId: undefined }),
    status: "failed",
    error: sanitizeVideoBuildError(error),
    debug,
    updatedAt: now,
  });
}
