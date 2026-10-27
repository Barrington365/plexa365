import { readJsonBlob, writeJsonBlob } from "@/app/lib/netlify-blob-json";
import type { RenderedSceneImage } from "@/app/lib/render-scenes-execute";

const STORE = "render-scene-jobs";

export type RenderSceneJobRecord = {
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  contentId?: string;
  phase?: string;
  error?: string;
  result?: { contentId: string; images: RenderedSceneImage[] };
};

const STALE_PENDING_MS = 90_000;
const STALE_RUNNING_MS = 180_000;

export async function createRenderSceneJob(jobId: string, contentId: string): Promise<void> {
  const now = Date.now();
  await writeJsonBlob<RenderSceneJobRecord>(STORE, jobId, {
    status: "pending",
    createdAt: now,
    updatedAt: now,
    contentId,
    phase: "starting",
  });
}

export async function getRenderSceneJob(jobId: string): Promise<RenderSceneJobRecord | null> {
  return readJsonBlob<RenderSceneJobRecord>(STORE, jobId);
}

export async function markRenderSceneJobRunning(jobId: string): Promise<void> {
  const current = await getRenderSceneJob(jobId);
  if (!current) return;
  await writeJsonBlob<RenderSceneJobRecord>(STORE, jobId, {
    ...current,
    status: "running",
    phase: current.phase || "starting",
    updatedAt: Date.now(),
  });
}

export async function touchRenderSceneJob(jobId: string, phase: string): Promise<void> {
  const current = await getRenderSceneJob(jobId);
  if (!current || current.status === "completed" || current.status === "failed") return;
  await writeJsonBlob<RenderSceneJobRecord>(STORE, jobId, {
    ...current,
    status: "running",
    phase,
    updatedAt: Date.now(),
  });
}

export async function completeRenderSceneJob(
  jobId: string,
  result: { contentId: string; images: RenderedSceneImage[] },
): Promise<void> {
  const current = await getRenderSceneJob(jobId);
  const now = Date.now();
  await writeJsonBlob<RenderSceneJobRecord>(STORE, jobId, {
    ...(current ?? { createdAt: now, contentId: result.contentId }),
    status: "completed",
    phase: "complete",
    result,
    updatedAt: now,
  });
}

export async function failRenderSceneJob(jobId: string, error: string): Promise<void> {
  const current = await getRenderSceneJob(jobId);
  const now = Date.now();
  const trimmed = error.trim();
  const message = /^<!doctype html|^<html/i.test(trimmed)
    ? "Scene render failed because the host returned an HTML error page."
    : trimmed.slice(0, 500);
  await writeJsonBlob<RenderSceneJobRecord>(STORE, jobId, {
    ...(current ?? { createdAt: now }),
    status: "failed",
    error: message,
    updatedAt: now,
  });
}

export async function resolveStaleRenderSceneJob(jobId: string): Promise<RenderSceneJobRecord | null> {
  const job = await getRenderSceneJob(jobId);
  if (!job) return null;
  if (job.status === "pending" && Date.now() - job.createdAt > STALE_PENDING_MS) {
    await failRenderSceneJob(
      jobId,
      "Scene render worker never started — check Netlify function logs or redeploy, then try again.",
    );
    return getRenderSceneJob(jobId);
  }
  if (job.status === "running" && Date.now() - job.updatedAt > STALE_RUNNING_MS) {
    await failRenderSceneJob(jobId, "Scene render stopped before it finished. The host timed out. Try again.");
    return getRenderSceneJob(jobId);
  }
  return job;
}
