import {
  executeNewsShortsBuild,
  type NewsShortsBuildBody,
} from "@/app/api/news-shorts/build/route";
import {
  completeVideoBuildJobResult,
  failVideoBuildJob,
  markVideoBuildJobRunning,
  touchVideoBuildJobProgress,
} from "@/app/lib/video-build-jobs";

export async function runNewsShortsVideoBuildJob(jobId: string, body: NewsShortsBuildBody): Promise<void> {
  console.info("[news-shorts-build] start", { jobId, contentId: body.contentId });
  let heartbeatPhase = "starting";
  const heartbeat = setInterval(() => {
    void touchVideoBuildJobProgress(jobId, heartbeatPhase);
  }, 12_000);

  try {
    await markVideoBuildJobRunning(jobId);
    heartbeatPhase = "encoding";
    await touchVideoBuildJobProgress(jobId, heartbeatPhase);
    const result = await executeNewsShortsBuild(body);
    clearInterval(heartbeat);
    await completeVideoBuildJobResult(jobId, result);
    console.info("[news-shorts-build] completed", { jobId, videoRel: result.videoRel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[news-shorts-build] failed", { jobId, message });
    await failVideoBuildJob(jobId, message);
  } finally {
    clearInterval(heartbeat);
  }
}
