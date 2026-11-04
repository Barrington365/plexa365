import type {CompanionPreferences} from '@/app/lib/agents/companion';
export type PlexaUserRole =
  | "admin"
  | "editor"
  | "viewer"
  | "meeting_guest"
  | "meeting_host"
  | "audio_user"
  | "audio_editor";

export type PlexaUser = {
  id: string;
  name: string;
  email: string;
  role: PlexaUserRole;
  active: boolean;
  agentCompanion?: CompanionPreferences;
  agentScopes?: Array<{brand:string; workspace:string}>;
  passwordHash?: string;
  passwordSalt?: string;
  passwordSetAt?: string;
  emailVerifiedAt?: string;
  verifyTokenHash?: string;
  verifyTokenExpiresAt?: string;
  /** SHA-256 hex of raw reset token (self-service forgot password). */
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
  lastLoginAt?: string;
  invitedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlexaAuthData = {
  users: Record<string, PlexaUser>;
};

export type PublicPlexaUser = Omit<PlexaUser, "passwordHash" | "passwordSalt" | "verifyTokenHash" | "passwordResetTokenHash"> & {
  hasPassword: boolean;
  emailVerified: boolean;
};

export type PlexaSessionPayload = {
  userId: string;
  email: string;
  role: PlexaUserRole;
  exp: number;
};
