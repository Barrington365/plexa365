import { NextResponse } from "next/server";
import { normalizeContentIdForFilename } from "@/app/lib/editor-upload";
import { isNetlifyHostedLambdaRuntime } from "@/app/lib/netlify-hosted-runtime";
import {
  createVideoBuildJob,
  failVideoBuildJob,
  resolveStaleVideoBuildJob,
} from "@/app/lib/video-build-jobs";
import {
  executeNewsShortsBuild,
  type NewsShortsBuildBody,
} from "@/app/lib/news-shorts-execute-build";

/** Allow long FFmpeg + TTS runs (Vercel / serverless — override in host config if needed). */
export const maxDuration = 300;

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

function internalBuildAuthHeader(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

type InvokeResult = "background" | "fallback";

async function invokeNewsShortsBackgroundBuild(
  origin: string,
  jobId: string,
  body: NewsShortsBuildBody,
): Promise<InvokeResult> {
  const url = `${origin}/.netlify/functions/news-shorts-build-background`;
  console.info("[news-shorts-build] invoking background function", { jobId, origin });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: internalBuildAuthHeader(),
      redirect: "manual",
      signal: controller.signal,
      body: JSON.stringify({ jobId, body }),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "";
      await failVideoBuildJob(
        jobId,
        `Background build invoke was redirected (${res.status}) to ${location || "login"}`,
      );
      return "background";
    }
    if (res.status === 404 || res.status === 502 || res.status === 503) {
      console.warn("[news-shorts-build] background function unavailable", { jobId, status: res.status });
      return "fallback";
    }
    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => "");
      await failVideoBuildJob(jobId, text || `Background build invoke failed (${res.status})`);
      return "background";
    }
    console.info("[news-shorts-build] background invoke accepted", { jobId, status: res.status });
    return "background";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Background build invoke failed";
    console.warn("[news-shorts-build] background invoke network error", { jobId, message });
    return "fallback";
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const job = await resolveStaleVideoBuildJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function POST(req: Request) {
  let body: NewsShortsBuildBody;
  try {
    body = (await req.json()) as NewsShortsBuildBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body?.template || !Array.isArray(body.template.slides) || body.template.slides.length === 0) {
    return NextResponse.json({ error: "template with slides is required" }, { status: 400 });
  }

  if (isNetlifyHostedLambdaRuntime()) {
    const contentId = normalizeContentIdForFilename(body.contentId ?? "");
    const jobId = `ns-${contentId}-${Date.now()}`;
    try {
      await createVideoBuildJob(jobId, contentId);
      const mode = await invokeNewsShortsBackgroundBuild(siteOrigin(req), jobId, body);
      if (mode === "fallback") {
        await failVideoBuildJob(
          jobId,
          "Video build worker is not deployed. Redeploy Planet Sport Studio, then try Build video again.",
        );
      }
      return NextResponse.json({ async: true, jobId, status: "pending", contentId }, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start video build";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const result = await executeNewsShortsBuild(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
