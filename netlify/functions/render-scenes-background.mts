import type { RenderScenesBody } from "../../app/lib/render-scenes-execute";
import { failRenderSceneJob, markRenderSceneJobRunning } from "../../app/lib/render-scene-jobs";

type BackgroundBody = {
  jobId?: string;
  body?: RenderScenesBody;
};

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return (req.headers.get("authorization")?.trim() ?? "") === `Bearer ${secret}`;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let payload: BackgroundBody;
  try {
    payload = (await req.json()) as BackgroundBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const jobId = payload.jobId?.trim();
  const body = payload.body;
  if (!jobId || !body?.contentId || !Array.isArray(body.scenes) || body.scenes.length === 0) {
    return new Response(JSON.stringify({ error: "jobId, contentId and scenes required" }), { status: 400 });
  }

  try {
    await markRenderSceneJobRunning(jobId);
    const { executeRenderScenes } = await import("../../app/lib/render-scenes-execute");
    const { completeRenderSceneJob, touchRenderSceneJob } = await import("../../app/lib/render-scene-jobs");
    const result = await executeRenderScenes(body, {
      onProgress: (phase) => touchRenderSceneJob(jobId, phase),
    });
    await completeRenderSceneJob(jobId, result);
    return new Response(JSON.stringify({ ok: true, jobId }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      await failRenderSceneJob(jobId, message);
    } catch {
      /* the poll will surface the stale-job message if this write also fails */
    }
    return new Response(JSON.stringify({ error: message, jobId }), { status: 500 });
  }
};
