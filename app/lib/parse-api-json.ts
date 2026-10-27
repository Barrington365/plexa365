/**
 * Parse JSON from fetch Response. Avoids SyntaxError when the server returns HTML or plain text
 * (common with Next.js 500 pages or a corrupted .next build).
 */
function extractJsonText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      JSON.parse(candidate);
      return candidate;
    }
    throw new Error("invalid-json");
  }
}

export async function parseApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const title = /<title>([^<]{0,120})/i.exec(trimmed)?.[1]?.trim();
    throw new Error(
      `The host returned HTML instead of JSON (HTTP ${res.status}${title ? `: ${title}` : ""}). The request did not finish as JSON.`,
    );
  }
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(
        `Request failed (${res.status}). Empty response — run npm run clean, then npm run dev again.`,
      );
    }
    throw new Error(
      "Request finished with an empty response. The server likely hit a hosting timeout before returning video data.",
    );
  }
  try {
    return JSON.parse(extractJsonText(text)) as T;
  } catch {
    const fix =
      res.status >= 500
        ? "Server error — run npm run clean, then npm run dev again."
        : `Invalid response (${res.status}).`;
    throw new Error(fix);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type VideoBuildJobPollResult = {
  status?: "pending" | "running" | "completed" | "failed";
  phase?: string;
  error?: string;
  videoPath?: string;
  voiceProvider?: string;
  voiceFallbackReason?: string;
  debug?: unknown;
};

export async function pollVideoBuildJob(
  jobUrl: string,
  options?: { timeoutMs?: number; intervalMs?: number; onProgress?: (job: VideoBuildJobPollResult) => void },
): Promise<VideoBuildJobPollResult> {
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const intervalMs = options?.intervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(jobUrl, { cache: "no-store" });
    const job = await parseApiJson<VideoBuildJobPollResult>(res);
    options?.onProgress?.(job);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await sleep(intervalMs);
  }

  throw new Error("Video build timed out waiting for background completion.");
}

export type LanguageRewriteJobPollResult = {
  status?: "pending" | "running" | "completed" | "failed";
  phase?: string;
  error?: string;
  rewrites?: unknown[];
  totalArticles?: number;
  completedArticles?: number;
};

export async function pollLanguageRewriteJob(
  jobUrl: string,
  options?: { timeoutMs?: number; intervalMs?: number; onProgress?: (job: LanguageRewriteJobPollResult) => void },
): Promise<LanguageRewriteJobPollResult> {
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const intervalMs = options?.intervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(jobUrl, { cache: "no-store" });
    const job = await parseApiJson<LanguageRewriteJobPollResult>(res);
    options?.onProgress?.(job);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await sleep(intervalMs);
  }

  throw new Error("Rewrite timed out waiting for background completion.");
}
