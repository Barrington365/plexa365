import { mapWithConcurrency } from "@/app/lib/map-with-concurrency";
import { stripArticleMetadataLines, stripGeneratedArticleMetadataLines } from "@/app/lib/language-studio/article-pages";
import { generateSocialPosts, translateContent } from "@/app/lib/language-studio/language-engine";
import { newLanguageId, readLanguageStudioData, writeLanguageStudioData } from "@/app/lib/language-studio/store";
import type {
  LanguageArticle,
  LanguageArticleAutomation,
  LanguageCode,
  LanguageImport,
  LanguageJournalistProfile,
  LanguageStudioData,
  LanguageTranslation,
  TranslationMode,
} from "@/app/lib/language-studio/types";

export type ArticleAutomationRunInput = {
  importId: string;
  articleIds: string[];
  createdArticleIds?: string[];
  clientIds?: string[];
  sourceBrand?: string;
};

export type ArticleAutomationRunResult = {
  automationCount: number;
  checkedArticleCount: number;
  createdTranslationCount: number;
  skippedDuplicateCount: number;
  details: Array<{
    automationId: string;
    automationName: string;
    articleCount: number;
    createdCount: number;
    skippedDuplicateCount: number;
  }>;
};

function profileForArticle(profiles: LanguageJournalistProfile[], article: { author?: string; sourceBrand: string }, selectedId?: string): LanguageJournalistProfile | undefined {
  if (selectedId) return profiles.find((profile) => profile.id === selectedId && profile.active);
  const author = article.author?.trim().toLowerCase();
  if (!author) return undefined;
  return profiles.find((profile) => profile.active && profile.brand === article.sourceBrand && profile.name.trim().toLowerCase() === author);
}

function hasCompleteSocialPosts(row: Pick<LanguageTranslation, "socialPosts">): boolean {
  const required = new Set(["appAlerts", "facebook", "x", "instagram", "youtube", "tiktok", "whatsapp", "telegram"]);
  for (const post of row.socialPosts ?? []) {
    if (post.text.trim()) required.delete(post.platform);
  }
  return required.size === 0;
}

function intersects(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return false;
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function automationMatchesArticleSport(automation: LanguageArticleAutomation, article: LanguageArticle): boolean {
  if (!article.sport) return true;
  return article.sport === automation.sportContext;
}

function matchingAutomations(data: LanguageStudioData, source: Pick<LanguageImport, "sourceBrand">, clientIds: string[]): LanguageArticleAutomation[] {
  return Object.values(data.articleAutomations).filter((automation) => {
    if (!automation.active) return false;
    if (automation.sourceBrands.length > 0 && !automation.sourceBrands.includes(source.sourceBrand)) return false;
    if (automation.clientIds.length > 0 && !intersects(automation.clientIds, clientIds)) return false;
    return true;
  });
}

function existingTranslation(
  data: LanguageStudioData,
  articleId: string,
  clientIds: string[],
  targetLanguage: LanguageCode,
  translationMode: TranslationMode,
): LanguageTranslation | undefined {
  return Object.values(data.translations).find((row) => {
    if (row.articleId !== articleId) return false;
    if (row.targetLanguage !== targetLanguage) return false;
    if (row.translationMode !== translationMode) return false;
    if (clientIds.length === 0) return (row.clientIds?.length ?? 0) === 0;
    return intersects(row.clientIds, clientIds);
  });
}

async function createTranslation(data: LanguageStudioData, automation: LanguageArticleAutomation, sourceArticle: LanguageArticle, targetLanguage: LanguageCode, translationMode: TranslationMode): Promise<LanguageTranslation> {
  const now = new Date().toISOString();
  const article = {
    ...sourceArticle,
    body: stripArticleMetadataLines(sourceArticle.body, sourceArticle),
  };
  const glossary = Object.values(data.glossary).filter((entry) => entry.brand === article.sourceBrand || entry.brand === "Global");
  const rules = Object.values(data.rules).filter((rule) => rule.brand === article.sourceBrand || rule.brand === "Global");
  const profile = profileForArticle(Object.values(data.journalistProfiles), article, automation.journalistProfileId);
  const journalistStyle = profile ? `${profile.name} (${profile.brand})\n${profile.styleNotes}` : undefined;
  const editorialGuidelines = automation.editorialGuidelines || profile?.articleGuidelines;
  const fields = await translateContent({
    article,
    targetLanguage,
    providerMode: automation.providerMode,
    translationMode,
    rewriteStyle: automation.rewriteStyle,
    journalistStyle,
    editorialGuidelines,
    contentStyle: automation.contentStyle,
    sportContext: automation.sportContext,
    glossary,
    rules,
    guardrails: Object.values(data.guardrails),
    protectedTerms: Object.values(data.protectedTerms),
    marketRules: Object.values(data.marketRules),
    sportRules: Object.values(data.sportRules),
    promptRules: Object.values(data.promptRules),
    knowledgeFiles: Object.values(data.knowledgeFiles),
    complianceNotes: Object.values(data.complianceNotes),
  });
  const autoPublished = Boolean(automation.autoApprove);
  const row: LanguageTranslation = {
    id: newLanguageId(translationMode === "rewrite-only" ? "lrewrite" : "ltrans"),
    articleId: article.id,
    clientIds: automation.clientIds,
    targetLanguage,
    providerMode: automation.providerMode,
    translationMode,
    status: autoPublished ? "approved" : automation.outputStatus,
    approvedAt: autoPublished ? now : undefined,
    createdAt: now,
    updatedAt: now,
    editorNotes: [
      `Automation: ${automation.name}`,
      `Automation ID: ${automation.id}`,
      automation.rewriteStyle ? `Style: ${automation.rewriteStyle}` : "",
      journalistStyle ? `Journalist style: ${journalistStyle}` : "",
      automation.contentStyle ? `Content style: ${automation.contentStyle}` : "",
      automation.sportContext ? `Sport: ${automation.sportContext}` : "",
      editorialGuidelines ? `Guidelines: ${editorialGuidelines}` : "",
    ].filter(Boolean).join("\n"),
    ...fields,
    body: stripGeneratedArticleMetadataLines(fields.body, article, fields.title),
  };
  if (!hasCompleteSocialPosts(row)) {
    row.socialPosts = await generateSocialPosts({
      article,
      translation: row,
      knowledgeFiles: Object.values(data.knowledgeFiles),
    });
  }
  data.translations[row.id] = row;
  const auditId = newLanguageId("laudit");
  data.auditLogs[auditId] = {
    id: auditId,
    createdAt: now,
    entityType: "language_translation",
    entityId: row.id,
    action: translationMode === "rewrite-only" ? "automation_rewrite" : "automation_translate",
    detail: `${automation.name}: ${article.title} → ${targetLanguage}`,
  };
  return row;
}

function articleIdsForAutomation(automation: LanguageArticleAutomation, input: ArticleAutomationRunInput): string[] {
  const ids = automation.onlyNewArticles ? input.createdArticleIds ?? [] : input.articleIds;
  return [...new Set(ids)];
}

function automationArticleConcurrency(): number {
  const raw = Number(process.env.LANGUAGE_AUTOMATION_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(6, Math.floor(raw));
  return 2;
}

async function runAutomationForArticle(
  data: LanguageStudioData,
  automation: LanguageArticleAutomation,
  articleId: string,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const article = data.articles[articleId];
  if (!article) return { created, skipped };
  if (!automationMatchesArticleSport(automation, article)) return { created, skipped };

  if (automation.action === "rewrite" || automation.action === "rewrite-translate") {
    const targetLanguage = article.sourceLanguage;
    if (existingTranslation(data, article.id, automation.clientIds, targetLanguage, "rewrite-only")) {
      skipped += 1;
    } else {
      await createTranslation(data, automation, article, targetLanguage, "rewrite-only");
      created += 1;
      article.status = "review_needed";
      article.updatedAt = new Date().toISOString();
    }
  }
  if (automation.action === "translate" || automation.action === "rewrite-translate") {
    for (const targetLanguage of automation.targetLanguages.filter((language) => language !== article.sourceLanguage)) {
      if (existingTranslation(data, article.id, automation.clientIds, targetLanguage, automation.translationMode)) {
        skipped += 1;
        continue;
      }
      await createTranslation(data, automation, article, targetLanguage, automation.translationMode);
      created += 1;
      article.status = "translated";
      article.updatedAt = new Date().toISOString();
    }
  }
  return { created, skipped };
}

export async function runArticleAutomationsForImport(input: ArticleAutomationRunInput): Promise<ArticleAutomationRunResult> {
  if (input.articleIds.length === 0) {
    return { automationCount: 0, checkedArticleCount: 0, createdTranslationCount: 0, skippedDuplicateCount: 0, details: [] };
  }
  const data = await readLanguageStudioData();
  const imported = data.imports[input.importId];
  const source = imported ?? { sourceBrand: input.sourceBrand ?? "" };
  const clientIds = input.clientIds?.length ? input.clientIds : imported?.clientIds ?? [];
  const automations = matchingAutomations(data, source, clientIds);
  if (automations.length === 0) {
    return { automationCount: 0, checkedArticleCount: input.articleIds.length, createdTranslationCount: 0, skippedDuplicateCount: 0, details: [] };
  }
  let createdTranslationCount = 0;
  let skippedDuplicateCount = 0;
  const details: ArticleAutomationRunResult["details"] = [];

  for (const automation of automations) {
    const articleIds = articleIdsForAutomation(automation, input);
    const slice = articleIds.slice(0, automation.maxArticlesPerRun);
    const perArticle = await mapWithConcurrency(slice, automationArticleConcurrency(), (articleId) =>
      runAutomationForArticle(data, automation, articleId),
    );
    let createdCount = 0;
    let skippedForAutomation = 0;
    for (const row of perArticle) {
      createdCount += row.created;
      skippedForAutomation += row.skipped;
    }
    createdTranslationCount += createdCount;
    skippedDuplicateCount += skippedForAutomation;
    details.push({
      automationId: automation.id,
      automationName: automation.name,
      articleCount: articleIds.length,
      createdCount,
      skippedDuplicateCount: skippedForAutomation,
    });
  }

  await writeLanguageStudioData(data);
  return {
    automationCount: automations.length,
    checkedArticleCount: input.articleIds.length,
    createdTranslationCount,
    skippedDuplicateCount,
    details,
  };
}
