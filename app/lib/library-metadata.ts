import fs from "fs/promises";
import path from "path";
import { readJsonBlob, shouldUseNetlifyBlobStore, writeJsonBlob } from "@/app/lib/netlify-blob-json";
import { libraryMetadataPath } from "@/app/lib/paths";

export type LibraryRightsStatus = "approved" | "pending" | "rejected";

export type LibraryAssetMetadata = {
  title?: string;
  sourceUrl?: string;
  keywords: string[];
  updatedAt: string;
  creator?: string;
  rightsStatus?: LibraryRightsStatus;
  rightsEvidence?: string;
  rightsScope?: string;
  rightsExpiresAt?: string;
  rightsApprovedBy?: string;
  brand?: string;
  article?: string;
  projectId?: string;
  subjects?: string[];
  importedAt?: string;
};

export type LibraryMetadataIndex = Record<string, LibraryAssetMetadata>;
const BLOB_STORE_NAME = "plexa-library";
const BLOB_STORE_KEY = "library-metadata.json";

function sanitizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 80);
}

function uniqueKeywords(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = sanitizeKeyword(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.slice(0, 40);
}

function safeContentId(contentId: string): string {
  return contentId.trim().replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80);
}

export async function readLibraryMetadataIndex(): Promise<LibraryMetadataIndex> {
  if (shouldUseNetlifyBlobStore()) {
    return (await readJsonBlob<LibraryMetadataIndex>(BLOB_STORE_NAME, BLOB_STORE_KEY)) ?? {};
  }

  try {
    const raw = await fs.readFile(libraryMetadataPath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LibraryMetadataIndex;
  } catch {
    return {};
  }
}

export async function findLibraryMetadataBySourceUrl(sourceUrl: string): Promise<{ contentId: string; metadata: LibraryAssetMetadata } | null> {
  const needle = sourceUrl.trim();
  if (!needle) return null;
  const index = await readLibraryMetadataIndex();
  for (const [contentId, metadata] of Object.entries(index)) {
    if (metadata.sourceUrl?.trim() === needle) return { contentId, metadata };
  }
  return null;
}

export async function upsertLibraryMetadata(
  contentId: string,
  partial: {
    title?: string;
    sourceUrl?: string;
    keywords?: string[];
    creator?: string;
    rightsStatus?: LibraryRightsStatus;
    rightsEvidence?: string;
    rightsScope?: string;
    rightsExpiresAt?: string;
    rightsApprovedBy?: string;
    brand?: string;
    article?: string;
    projectId?: string;
    subjects?: string[];
    importedAt?: string;
  },
): Promise<LibraryAssetMetadata | null> {
  const key = safeContentId(contentId);
  if (!key) return null;
  const index = await readLibraryMetadataIndex();
  const existing = index[key];
  const text = (value: string | undefined, previous: string | undefined) => value?.trim() || previous;
  const merged: LibraryAssetMetadata = {
    title: text(partial.title, existing?.title),
    sourceUrl: text(partial.sourceUrl, existing?.sourceUrl),
    keywords: uniqueKeywords([...(existing?.keywords ?? []), ...(partial.keywords ?? []), ...(partial.subjects ?? []), key]),
    updatedAt: new Date().toISOString(),
    creator: text(partial.creator, existing?.creator),
    rightsStatus: partial.rightsStatus ?? existing?.rightsStatus,
    rightsEvidence: text(partial.rightsEvidence, existing?.rightsEvidence),
    rightsScope: text(partial.rightsScope, existing?.rightsScope),
    rightsExpiresAt: text(partial.rightsExpiresAt, existing?.rightsExpiresAt),
    rightsApprovedBy: text(partial.rightsApprovedBy, existing?.rightsApprovedBy),
    brand: text(partial.brand, existing?.brand),
    article: text(partial.article, existing?.article),
    projectId: text(partial.projectId, existing?.projectId),
    subjects: uniqueKeywords([...(existing?.subjects ?? []), ...(partial.subjects ?? [])]),
    importedAt: text(partial.importedAt, existing?.importedAt),
  };
  index[key] = merged;
  if (shouldUseNetlifyBlobStore()) {
    await writeJsonBlob(BLOB_STORE_NAME, BLOB_STORE_KEY, index);
    return merged;
  }

  const filePath = libraryMetadataPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(index, null, 2), "utf-8");
  return merged;
}
