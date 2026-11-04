import fs from "fs/promises";
import path from "path";
import { getStore } from "@netlify/blobs";
import { projectRoot } from "@/app/lib/paths";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";
import type { PlexaAuthData, PlexaUser, PublicPlexaUser } from "@/app/lib/auth/types";

const STORE_FILE = path.join(projectRoot(), "data", "local", "plexa-auth-users.json");
const BLOB_STORE_NAME = "plexa-auth";
const BLOB_STORE_KEY = "plexa-auth-users.json";

function emptyData(): PlexaAuthData {
  return { users: {} };
}

export function newAuthId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readAuthData(): Promise<PlexaAuthData> {
  if (shouldUseNetlifyBlobStore()) {
    try {
      const data = await getStore(BLOB_STORE_NAME).get(BLOB_STORE_KEY, { type: "json" }) as Partial<PlexaAuthData> | null;
      return { ...emptyData(), ...(data ?? {}) };
    } catch {
      return emptyData();
    }
  }

  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PlexaAuthData>;
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
}

export async function writeAuthData(data: PlexaAuthData): Promise<void> {
  if (shouldUseNetlifyBlobStore()) {
    await getStore(BLOB_STORE_NAME).setJSON(BLOB_STORE_KEY, data);
    return;
  }

  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function upsertUser(user: PlexaUser): Promise<void> {
  const data = await readAuthData();
  data.users[user.id] = user;
  await writeAuthData(data);
}

export async function hasAnyUsers(): Promise<boolean> {
  const data = await readAuthData();
  return Object.keys(data.users).length > 0;
}

export function publicUser(user: PlexaUser): PublicPlexaUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    passwordSetAt: user.passwordSetAt,
    emailVerifiedAt: user.emailVerifiedAt,
    verifyTokenExpiresAt: user.verifyTokenExpiresAt,
    passwordResetExpiresAt: user.passwordResetExpiresAt,
    lastLoginAt: user.lastLoginAt,
    invitedAt: user.invitedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasPassword: Boolean(user.passwordHash && user.passwordSalt),
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

export function sortedPublicUsers(data: PlexaAuthData): PublicPlexaUser[] {
  return Object.values(data.users)
    .map(publicUser)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
