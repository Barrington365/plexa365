import { NextResponse } from "next/server";
import { normalizeContentIdForFilename } from "@/app/lib/editor-upload";
import { isNetlifyHostedLambdaRuntime } from "@/app/lib/netlify-hosted-runtime";
import {
  createRenderSceneJob,
  failRenderSceneJob,
  resolveStaleRenderSceneJob,
} from "@/app/lib/render-scene-jobs";
import {
  executeRenderScenes,
  RenderScenesRequestError,
  type RenderScenesBody,
} from "@/app/lib/render-scenes-execute";

function siteOrigin(req: Request): string {
  const fromEnv = process.env.DEPLOY_PRIME_URL?.trim() || process.env.URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(req.url).origin;
}

function internalAuthHeader(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

async function invokeRenderBackground(origin: string, jobId: string, body: RenderScenesBody): Promise<void> {
  const url = `${origin}/.netlify/functions/render-scenes-background`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: internalAuthHeader(),
      redirect: "manual",
      signal: controller.signal,
      body: JSON.stringify({ jobId, body }),
    });
    if (res.status >= 300 && res.status < 400) {
      await failRenderSceneJob(
        jobId,
        `Scene render invoke was redirected (${res.status}). The worker was not reached.`,
      );
      return;
    }
    if (res.status === 404 || res.status === 502 || res.status === 503) {
      await failRenderSceneJob(
        jobId,
        "Scene render worker is not deployed. Redeploy Planet Sport Studio, then try Render scenes again.",
      );
      return;
    }
    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => "");
      const html = /^\s*</.test(text);
      await failRenderSceneJob(
        jobId,
        html
          ? `Scene render worker returned HTML (HTTP ${res.status}) instead of accepting the job.`
          : text.slice(0, 500) || `Scene render invoke failed (${res.status}).`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene render invoke failed";
    await failRenderSceneJob(jobId, `Scene render worker did not accept the job. ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const job = await resolveStaleRenderSceneJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function POST(req: Request) {
  let body: RenderScenesBody;
  try {
    body = (await req.json()) as RenderScenesBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body?.contentId || !Array.isArray(body.scenes) || body.scenes.length === 0) {
    return NextResponse.json({ error: "contentId and scenes required" }, { status: 400 });
  }

  if (isNetlifyHostedLambdaRuntime()) {
    const contentId = normalizeContentIdForFilename(String(body.contentId).trim());
    const jobId = `render-${contentId}-${Date.now()}`;
    try {
      await createRenderSceneJob(jobId, contentId);
      await invokeRenderBackground(siteOrigin(req), jobId, body);
      return NextResponse.json({ async: true, jobId, status: "pending", contentId }, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start scene render";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const result = await executeRenderScenes(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof RenderScenesRequestError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
