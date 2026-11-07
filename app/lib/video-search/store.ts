import fs from "fs/promises";
import path from "path";
import { findLibraryMetadataBySourceUrl, upsertLibraryMetadata } from "@/app/lib/library-metadata";
import { localJsonStorePath } from "@/app/lib/local-json-store-dir";
import { readJsonBlob, shouldUseNetlifyBlobStore, writeJsonBlob } from "@/app/lib/netlify-blob-json";
import {
  rightsAllowImport,
  type FootageRightsInput,
  type FootageRightsRecord,
  type FootageRightsStatus,
} from "@/app/lib/video-search/rights";

const FILE_NAME = "video-search-rights.json";
const BLOB_STORE = "plexa-video-search";
const BLOB_KEY = "rights.json";

type RightsIndex = Record<string, FootageRightsRecord>;

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function subjectsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12);
}

async function readIndex(): Promise<RightsIndex> {
  if (shouldUseNetlifyBlobStore()) return (await readJsonBlob<RightsIndex>(BLOB_STORE, BLOB_KEY)) ?? {};
  try {
    const raw = await fs.readFile(localJsonStorePath(FILE_NAME), "utf8");
    const parsed = JSON.parse(raw) as RightsIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: RightsIndex): Promise<void> {
  if (shouldUseNetlifyBlobStore()) {
    await writeJsonBlob(BLOB_STORE, BLOB_KEY, index);
    return;
  }
  const filePath = localJsonStorePath(FILE_NAME);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(index, null, 2), "utf8");
}

export async function readFootageRights(videoId: string): Promise<FootageRightsRecord | null> {
  const index = await readIndex();
  return index[videoId] ?? null;
}

export async function saveFootageRights(input: FootageRightsInput & { permissionCheckbox?: unknown }): Promise<{ ok: true; record: FootageRightsRecord; libraryContentId: string } | { ok: false; reason: string }> {
  if (input.permissionCheckbox === true && clean(input.evidence, 2000).length < 24) {
    return { ok: false, reason: "A checkbox cannot approve footage." };
  }
  const status = input.status;
  if (status !== "approved" && status !== "pending" && status !== "rejected") {
    return { ok: false, reason: "Choose Approved, Pending, or Rejected." };
  }
  const record: FootageRightsRecord = {
    videoId: clean(input.videoId, 20),
    sourceUrl: clean(input.sourceUrl, 300),
    title: clean(input.title, 200),
    creator: clean(input.creator, 120),
    status,
    evidence: clean(input.evidence, 2000),
    source: clean(input.source, 200),
    scope: clean(input.scope, 500),
    commercialUse: input.commercialUse === true,
    editingRights: input.editingRights === true,
    distributionRights: input.distributionRights === true,
    sourceFileRef: clean(input.sourceFileRef, 200),
    expiresAt: clean(input.expiresAt, 40),
    approvedBy: clean(input.approvedBy, 120),
    brand: clean(input.brand, 80),
    article: clean(input.article, 200),
    projectId: clean(input.projectId, 80),
    subjects: subjectsOf(input.subjects),
    updatedAt: "",
  };
  if (!/^[a-zA-Z0-9_-]{11}$/.test(record.videoId) || !record.sourceUrl || !record.title) {
    return { ok: false, reason: "A video, source URL, and title are required." };
  }
  if (status === "approved") {
    if (!record.scope && record.commercialUse && record.editingRights && record.distributionRights) {
      record.scope = "Commercial use, editing and distribution";
    }
    const gate = rightsAllowImport({ ...record, updatedAt: "1970-01-01T00:00:00.000Z" });
    if (!gate.ok) return { ok: false, reason: gate.reason };
  } else if (status === "rejected" && record.evidence.length < 24) {
    return { ok: false, reason: "Record why use is prohibited or permission was denied." };
  }

  const index = await readIndex();
  const duplicate = Object.values(index).find((row) => row.sourceUrl === record.sourceUrl && row.videoId !== record.videoId);
  if (duplicate) return { ok: false, reason: `This source URL is already recorded for ${duplicate.title}.` };

  record.updatedAt = new Date().toISOString();
  index[record.videoId] = record;
  await writeIndex(index);

  const existing = await findLibraryMetadataBySourceUrl(record.sourceUrl);
  const libraryContentId = existing?.contentId || `yt-${record.videoId}`;
  await upsertLibraryMetadata(libraryContentId, {
    title: record.title,
    sourceUrl: record.sourceUrl,
    creator: record.creator,
    keywords: record.subjects,
    rightsStatus: record.status as FootageRightsStatus,
    rightsEvidence: record.evidence,
    rightsScope: record.scope,
    rightsExpiresAt: record.expiresAt,
    rightsApprovedBy: record.approvedBy,
    brand: record.brand,
    article: record.article,
    projectId: record.projectId,
    subjects: record.subjects,
  });
  return { ok: true, record, libraryContentId };
}
