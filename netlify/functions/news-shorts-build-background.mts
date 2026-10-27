import type { NewsShortsBuildBody } from "../../app/api/news-shorts/build/route";
import { failVideoBuildJob } from "../../app/lib/video-build-jobs";
import { runNewsShortsVideoBuildJob } from "../../app/lib/news-shorts-video-build-job";

type BackgroundBody = {
  jobId?: string;
  body?: NewsShortsBuildBody;
};

function authorizedInternalBuild(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }
  if (!authorizedInternalBuild(req)) {
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
  if (!jobId || !body?.template || !Array.isArray(body.template.slides) || body.template.slides.length === 0) {
    return new Response(JSON.stringify({ error: "jobId and news shorts template required" }), { status: 400 });
  }

  console.info("[news-shorts-build-background] starting", {
    jobId,
    contentId: body.contentId,
    slideCount: body.template.slides.length,
  });

  try {
    await runNewsShortsVideoBuildJob(jobId, body);
    console.info("[news-shorts-build-background] completed", { jobId });
    return new Response(JSON.stringify({ ok: true, jobId }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[news-shorts-build-background] failed", { jobId, message });
    try {
      await failVideoBuildJob(jobId, message);
    } catch (failErr) {
      console.error("[news-shorts-build-background] could not record job failure", {
        jobId,
        message: failErr instanceof Error ? failErr.message : String(failErr),
      });
    }
    return new Response(JSON.stringify({ error: message, jobId }), { status: 500 });
  }
};
