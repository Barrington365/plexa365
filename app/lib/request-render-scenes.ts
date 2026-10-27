import { parseApiJson } from "@/app/lib/parse-api-json";

export type RequestedSceneImage = {
  sceneId: string;
  path: string;
  rel?: string;
  underlayPath?: string;
  underlayRel?: string;
  diskRel?: string;
  diskUnderlayRel?: string;
};

type RenderResponse = {
  async?: boolean;
  jobId?: string;
  status?: string;
  error?: string;
  contentId?: string;
  images?: RequestedSceneImage[];
  result?: { contentId?: string; images?: RequestedSceneImage[] };
  phase?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollRenderJob(url: string, jobId: string): Promise<{ contentId?: string; images: RequestedSceneImage[] }> {
  const pollUrl = `${url.split("?")[0]}?jobId=${encodeURIComponent(jobId)}`;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await fetch(pollUrl, { cache: "no-store" });
    const job = await parseApiJson<RenderResponse>(res);
    if (!res.ok && job.status !== "failed") {
      throw new Error(job.error || `Scene render status failed (${res.status}).`);
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Scene render failed.");
    }
    if (job.status === "completed") {
      const images = job.result?.images ?? [];
      if (images.length === 0) throw new Error("Scene render finished without images.");
      return { contentId: job.result?.contentId, images };
    }
    await sleep(2000);
  }
  throw new Error("Scene render timed out waiting for the background worker.");
}

/** Local renders return images immediately. Hosted renders return a job and must be polled. */
export async function requestRenderedScenes(
  url: string,
  body: unknown,
): Promise<{ contentId?: string; images: RequestedSceneImage[] }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const json = await parseApiJson<RenderResponse>(res);
  if (res.status === 202 && json.async && json.jobId) {
    return pollRenderJob(url, json.jobId);
  }
  if (!res.ok) throw new Error(json.error || `Render failed (${res.status}).`);
  if (!json.images?.length) throw new Error(json.error || "Render finished without images.");
  return { contentId: json.contentId, images: json.images };
}
