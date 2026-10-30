import { isCronDue, nextRunAt } from "@/app/lib/language-studio/cron-scheduler";
import { runArticleAutomationsForImport } from "@/app/lib/language-studio/article-automation-runner";
import { sendEmail } from "@/app/lib/email/send-email";
import { importLanguageFeed } from "@/app/lib/language-studio/import-feed";
import { mergePublishWatermark } from "@/app/lib/language-studio/publish-date";
import { newLanguageId, readLanguageStudioData, writeLanguageStudioData } from "@/app/lib/language-studio/store";
import type { LanguageArticle, LanguageCronJob, LanguageCronRun, LanguageImport, LanguageStudioData } from "@/app/lib/language-studio/types";

function keepImportedArticles(data: LanguageStudioData, row: LanguageImport, articles: LanguageArticle[], clientIds: string[]): void {
  const imported = data.imports[row.id] ?? row;
  imported.clientIds = clientIds;
  data.imports[imported.id] = imported;
  for (const article of articles) {
    const saved = data.articles[article.id] ?? article;
    data.articles[saved.id] = { ...saved, clientIds };
  }
}

export type CronRunTrigger = "scheduled" | "manual";

async function notifyCronFailure(job: LanguageCronJob, run: LanguageCronRun): Promise<void> {
  if (!job.notifyOnFailure || !job.notificationEmail?.trim()) return;
  try {
    const subject = `Planet Sport Studio cron failed: ${job.name}`;
    const text = [
      `Cron: ${job.name}`,
      `Source: ${job.sourceBrand}`,
      `URL: ${job.sourceUrl}`,
      `Status: ${run.status}`,
      `Error: ${run.error ?? run.message ?? "Unknown error"}`,
      `Consecutive failures: ${job.consecutiveFailures}`,
      `Started: ${run.startedAt}`,
      `Finished: ${run.finishedAt}`,
    ].join("\n");
    await sendEmail({
      to: job.notificationEmail,
      subject,
      text,
      html: text.split("\n").map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join(""),
    });
  } catch {
    // Notification failures should not hide the original import failure.
  }
}

async function markRunning(job: LanguageCronJob): Promise<void> {
  const data = await readLanguageStudioData();
  const current = data.cronJobs[job.id];
  if (!current) return;
  data.cronJobs[job.id] = {
    ...current,
    lastRunStatus: "running",
    lastRunMessage: "Import running.",
    updatedAt: new Date().toISOString(),
  };
  await writeLanguageStudioData(data);
}

export async function runLanguageCronJob(jobId: string, trigger: CronRunTrigger): Promise<LanguageCronRun> {
  const initial = await readLanguageStudioData();
  const job = initial.cronJobs[jobId];
  if (!job) throw new Error("Cron job not found.");
  if (!job.active && trigger === "scheduled") {
    const now = new Date().toISOString();
    return {
      id: newLanguageId("lcronrun"),
      jobId,
      jobName: job.name,
      trigger,
      status: "skipped",
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      createdCount: 0,
      updatedCount: 0,
      articleCount: 0,
      imageCount: 0,
      message: "Cron is paused.",
      createdAt: now,
    };
  }

  await markRunning(job);
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const incrementalAfter = job.incrementalFeedImport === false ? undefined : job.lastImportedPublishWatermark;
    const maxArticles = job.maxFeedItems && job.maxFeedItems > 0 ? job.maxFeedItems : undefined;
    const result = await importLanguageFeed({
      sourceBrand: job.sourceBrand,
      sourceLanguage: job.sourceLanguage,
      sourceUrl: job.sourceUrl,
      parserType: job.parserType,
      processImages: job.processImages,
      importFullArticles: job.importFullArticles,
      incrementalAfter,
      maxArticles,
    });
    const data = await readLanguageStudioData();
    const current = data.cronJobs[job.id] ?? job;
    keepImportedArticles(data, result.import, result.articles, job.clientIds);
    await writeLanguageStudioData(data);
    const automationResult = await runArticleAutomationsForImport({
      importId: result.import.id,
      articleIds: result.import.articleIds,
      createdArticleIds: result.createdArticleIds,
      clientIds: job.clientIds,
      sourceBrand: job.sourceBrand,
    });
    const finishedAt = new Date().toISOString();
    const run: LanguageCronRun = {
      id: newLanguageId("lcronrun"),
      jobId: job.id,
      jobName: job.name,
      trigger,
      status: "success",
      startedAt,
      finishedAt,
      durationMs: Date.now() - started,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      articleCount: result.articles.length,
      imageCount: result.imageCount,
      automationCount: automationResult.automationCount,
      automationCreatedCount: automationResult.createdTranslationCount,
      automationSkippedCount: automationResult.skippedDuplicateCount,
      message: `${result.createdCount} new; ${result.updatedCount} updated; ${result.articles.length} checked; ${automationResult.createdTranslationCount} automation output(s).`,
      createdAt: finishedAt,
    };

    const finalData = await readLanguageStudioData();
    const finalCurrent = finalData.cronJobs[job.id] ?? current;
    keepImportedArticles(finalData, result.import, result.articles, job.clientIds);
    finalData.cronRuns[run.id] = run;
    const watermark = mergePublishWatermark(finalCurrent.lastImportedPublishWatermark, result.articles);
    finalData.cronJobs[job.id] = {
      ...finalCurrent,
      lastRunAt: finishedAt,
      lastSuccessAt: finishedAt,
      lastRunStatus: "success",
      lastRunMessage: run.message,
      consecutiveFailures: 0,
      nextRunAt: nextRunAt(finalCurrent, new Date(finishedAt)),
      lastImportedPublishWatermark: watermark ?? finalCurrent.lastImportedPublishWatermark,
      updatedAt: finishedAt,
    };
    await writeLanguageStudioData(finalData);
    return run;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Cron import failed.";
    const run: LanguageCronRun = {
      id: newLanguageId("lcronrun"),
      jobId: job.id,
      jobName: job.name,
      trigger,
      status: "failed",
      startedAt,
      finishedAt,
      durationMs: Date.now() - started,
      createdCount: 0,
      updatedCount: 0,
      articleCount: 0,
      imageCount: 0,
      error: message,
      createdAt: finishedAt,
    };
    const data = await readLanguageStudioData();
    const current = data.cronJobs[job.id] ?? job;
    const updatedJob: LanguageCronJob = {
      ...current,
      lastRunAt: finishedAt,
      lastFailureAt: finishedAt,
      lastRunStatus: "failed",
      lastRunMessage: message,
      consecutiveFailures: (current.consecutiveFailures ?? 0) + 1,
      nextRunAt: nextRunAt(current, new Date(finishedAt)),
      updatedAt: finishedAt,
    };
    data.cronRuns[run.id] = run;
    data.cronJobs[job.id] = updatedJob;
    await writeLanguageStudioData(data);
    await notifyCronFailure(updatedJob, run);
    return run;
  }
}

export async function runDueLanguageCronJobs(): Promise<LanguageCronRun[]> {
  const data = await readLanguageStudioData();
  const dueJobs = Object.values(data.cronJobs).filter((job) => isCronDue(job));
  const runs: LanguageCronRun[] = [];
  for (const job of dueJobs) {
    runs.push(await runLanguageCronJob(job.id, "scheduled"));
  }
  return runs;
}
