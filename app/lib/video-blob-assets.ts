import fs from "fs/promises";
import path from "path";
import { getStore } from "@netlify/blobs";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";
import { outputDir } from "@/app/lib/paths";

const BLOB_STORE_NAME = "plexa-video-assets";
const VIDEO_OUTPUT_PREFIX = "video/";
const UPLOAD_VIDEO_PREFIX = "uploads/";

export type VideoBlobAsset = {
  rel: string;
  bytes: Buffer;
  contentType: string;
};

function normaliseVideoOutputRel(rel: string): string | null {
  const cleaned = rel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) return null;
  if (!cleaned.startsWith(VIDEO_OUTPUT_PREFIX) || !cleaned.toLowerCase().endsWith(".mp4")) return null;
  return cleaned;
}

function normaliseUploadVideoRel(rel: string): string | null {
  const cleaned = rel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) return null;
  if (!cleaned.startsWith(UPLOAD_VIDEO_PREFIX)) return null;
  if (!/\.(mp4|webm|mov)$/i.test(cleaned)) return null;
  return cleaned;
}

function normaliseStoredVideoRel(rel: string): string | null {
  return normaliseVideoOutputRel(rel) ?? normaliseUploadVideoRel(rel);
}

function contentTypeForVideoRel(rel: string): string {
  const ext = path.extname(rel).toLowerCase();
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "video/mp4";
}

function bufferToArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function warnBlobIssue(operation: string, rel: string | null, error: unknown) {
  console.warn("[video-blob-assets]", operation, {
    rel,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function isVideoBlobAssetRel(rel: string): boolean {
  return normaliseStoredVideoRel(rel) !== null;
}

export function outputRelFromAbs(absPath: string): string | null {
  const root = path.normalize(outputDir());
  const abs = path.normalize(absPath);
  if (abs.startsWith(root + path.sep)) {
    return path.relative(root, abs).split(path.sep).join("/");
  }
  const norm = abs.replace(/\\/g, "/");
  const idx = norm.indexOf(`/${VIDEO_OUTPUT_PREFIX}`);
  if (idx >= 0) return norm.slice(idx + 1);
  const uploadIdx = norm.indexOf(`/${UPLOAD_VIDEO_PREFIX}`);
  if (uploadIdx >= 0) return norm.slice(uploadIdx + 1);
  return null;
}

export async function writeVideoBlobAsset(rel: string, bytes: Buffer, contentType?: string): Promise<void> {
  if (!shouldUseNetlifyBlobStore()) return;
  const key = normaliseStoredVideoRel(rel);
  if (!key) return;
  try {
    await getStore(BLOB_STORE_NAME).set(key, bufferToArrayBuffer(bytes), {
      metadata: {
        contentType: contentType || contentTypeForVideoRel(key),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    warnBlobIssue("write failed", key, error);
    throw error;
  }
}

export async function readVideoBlobAsset(rel: string): Promise<VideoBlobAsset | null> {
  if (!shouldUseNetlifyBlobStore()) return null;
  const key = normaliseStoredVideoRel(rel);
  if (!key) return null;
  try {
    const result = await getStore(BLOB_STORE_NAME).getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return null;
    return {
      rel: key,
      bytes: Buffer.from(result.data),
      contentType:
        typeof result.metadata?.contentType === "string"
          ? result.metadata.contentType
          : contentTypeForVideoRel(key),
    };
  } catch (error) {
    warnBlobIssue("read failed", key, error);
    return null;
  }
}

export async function deleteVideoBlobAsset(rel: string): Promise<boolean> {
  if (!shouldUseNetlifyBlobStore()) return false;
  const key = normaliseStoredVideoRel(rel);
  if (!key) return false;
  try {
    await getStore(BLOB_STORE_NAME).delete(key);
    return true;
  } catch (error) {
    warnBlobIssue("delete failed", key, error);
    return false;
  }
}

/** Persist a built MP4 from ephemeral disk to Netlify Blobs so /api/file can serve it on any Lambda. */
export async function persistVideoOutputToBlob(absOrRelPath: string): Promise<string | null> {
  if (!shouldUseNetlifyBlobStore()) return null;
  const rel = absOrRelPath.includes("/") || absOrRelPath.includes("\\")
    ? outputRelFromAbs(absOrRelPath)
    : normaliseVideoOutputRel(absOrRelPath);
  if (!rel) return null;
  try {
    const abs = path.join(outputDir(), ...rel.split("/"));
    const bytes = await fs.readFile(abs);
    await writeVideoBlobAsset(rel, bytes);
    return rel;
  } catch (error) {
    warnBlobIssue("persist failed", rel, error);
    return null;
  }
}

/** Copy a blob-backed upload/motion clip onto ephemeral disk for FFmpeg input. */
export async function materializeVideoAssetToDisk(rel: string): Promise<string | null> {
  const key = normaliseStoredVideoRel(rel);
  if (!key) return null;
  const blob = await readVideoBlobAsset(key);
  if (!blob) return null;
  const abs = path.join(outputDir(), ...key.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, blob.bytes);
  return abs;
}

function blobUploadedAtMs(blob: unknown): number {
  if (!blob || typeof blob !== "object") return 0;
  const uploadedAt = (blob as { uploadedAt?: unknown }).uploadedAt;
  if (typeof uploadedAt === "string") {
    const parsed = Date.parse(uploadedAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (uploadedAt instanceof Date) return uploadedAt.getTime();
  return 0;
}

/** MP4s saved for /api/file. The Library must list these; the Lambda disk does not keep them. */
export async function listPersistedVideoOutputRels(): Promise<{ rel: string; mtimeMs: number }[]> {
  if (!shouldUseNetlifyBlobStore()) return [];
  try {
    const store = getStore(BLOB_STORE_NAME);
    const out: { rel: string; mtimeMs: number }[] = [];
    for await (const page of store.list({ prefix: VIDEO_OUTPUT_PREFIX, paginate: true })) {
      for (const blob of page.blobs) {
        const rel = normaliseVideoOutputRel(blob.key);
        if (!rel) continue;
        out.push({ rel, mtimeMs: blobUploadedAtMs(blob) });
      }
    }
    return out;
  } catch (error) {
    warnBlobIssue("list failed", VIDEO_OUTPUT_PREFIX, error);
    return [];
  }
}

export async function getVideoBlobAssetDiagnostics(): Promise<{
  enabled: boolean;
  store: string;
  prefix: string;
  count?: number;
  error?: string;
}> {
  const enabled = shouldUseNetlifyBlobStore();
  if (!enabled) return { enabled, store: BLOB_STORE_NAME, prefix: `${VIDEO_OUTPUT_PREFIX} + ${UPLOAD_VIDEO_PREFIX}`, count: 0 };
  try {
    const store = getStore(BLOB_STORE_NAME);
    let count = 0;
    for await (const page of store.list({ prefix: VIDEO_OUTPUT_PREFIX, paginate: true })) {
      count += page.blobs.length;
    }
    for await (const page of store.list({ prefix: UPLOAD_VIDEO_PREFIX, paginate: true })) {
      count += page.blobs.length;
    }
    return { enabled, store: BLOB_STORE_NAME, prefix: `${VIDEO_OUTPUT_PREFIX} + ${UPLOAD_VIDEO_PREFIX}`, count };
  } catch (error) {
    return {
      enabled,
      store: BLOB_STORE_NAME,
      prefix: `${VIDEO_OUTPUT_PREFIX} + ${UPLOAD_VIDEO_PREFIX}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
