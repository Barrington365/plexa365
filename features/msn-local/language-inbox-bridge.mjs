const VIDEO_BRANDS = new Set(["Football365", "TEAMtalk"]);

export function languageInboxPayloads(articles) {
  return Object.values(articles || {})
    .filter((article) => VIDEO_BRANDS.has(article?.sourceBrand))
    .map((article) => {
      const text = String(article.body || article.standfirst || "").trim().slice(0, 100000);
      const sourceUrl = String(article.canonicalUrl || article.sourceUrl || "").trim();
      const title = String(article.title || "").trim().slice(0, 300);
      if (!sourceUrl || title.length < 1 || text.length < 20) return null;
      return {
        brand: article.sourceBrand,
        title,
        text,
        sourceUrl,
        publishedAt: article.publishDate || undefined,
        author: article.author || "",
        sourceUpdatedAt: article.modifiedDate || undefined,
        sourceFetchedAt: article.updatedAt || undefined,
        importMethod: "import",
        sourceId: String(article.sourceArticleId || article.id || "").slice(0, 150),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))
    .slice(0, 40);
}

export async function bringLanguageArticles(payloads, existingUrls, importOne) {
  const have = new Set(existingUrls.filter(Boolean));
  let imported = 0;
  let already = 0;
  let skipped = 0;
  for (const raw of payloads) {
    if (have.has(raw.sourceUrl)) {
      already += 1;
      continue;
    }
    const result = await importOne(raw);
    if (result?.error) {
      skipped += 1;
      continue;
    }
    if (result?.result === "imported" || result?.result === "updated") imported += 1;
    else already += 1;
    if (result?.article?.sourceUrl) have.add(result.article.sourceUrl);
  }
  return { imported, already, skipped, considered: payloads.length };
}
