import fs from "fs/promises";
import path from "path";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { readJsonBlob, shouldUseNetlifyBlobStore, writeJsonBlob } from "@/app/lib/netlify-blob-json";
import { assetsManifestPath } from "@/app/lib/paths";

const STORE = "plexa-video-assets";
const MANIFEST_KEY = "library-manifest.json";
const MAX_ENTRIES = 500;

function asEntries(value: unknown): ManifestEntry[] {
  return Array.isArray(value) ? (value as ManifestEntry[]) : [];
}

async function readDiskManifest(): Promise<ManifestEntry[]> {
  try {
    const raw = await fs.readFile(assetsManifestPath(), "utf-8");
    return asEntries(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Durable on Netlify Blobs; the local output file remains the source in development. */
export async function readStoredManifest(): Promise<ManifestEntry[]> {
  if (shouldUseNetlifyBlobStore()) {
    const stored = await readJsonBlob<unknown>(STORE, MANIFEST_KEY);
    if (Array.isArray(stored)) return asEntries(stored);
  }
  return readDiskManifest();
}

export async function writeStoredManifest(entries: ManifestEntry[]): Promise<void> {
  const next = entries.slice(0, MAX_ENTRIES);
  if (shouldUseNetlifyBlobStore()) {
    await writeJsonBlob(STORE, MANIFEST_KEY, next);
  }
  const filePath = assetsManifestPath();
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    if (!shouldUseNetlifyBlobStore()) throw error;
  }
}

export async function appendStoredManifest(entry: ManifestEntry): Promise<void> {
  const current = await readStoredManifest();
  const withoutSameBuild = current.filter(
    (row) => !(row.id === entry.id && row.createdAt === entry.createdAt && row.video === entry.video),
  );
  await writeStoredManifest([entry, ...withoutSameBuild]);
}
