export type FootageRightsStatus = "approved" | "pending" | "rejected";

export type FootageRightsRecord = {
  videoId: string;
  sourceUrl: string;
  title: string;
  creator: string;
  status: FootageRightsStatus;
  evidence: string;
  source: string;
  scope: string;
  commercialUse: boolean;
  editingRights: boolean;
  distributionRights: boolean;
  sourceFileRef: string;
  expiresAt: string;
  approvedBy: string;
  brand: string;
  article: string;
  projectId: string;
  subjects: string[];
  updatedAt: string;
};

export type FootageRightsInput = Partial<FootageRightsRecord> & { videoId?: string; status?: FootageRightsStatus };

const COMMERCIAL_SCOPE = /\bcommercial\b/i;
const EDIT_SCOPE = /\bedit/i;
const DISTRIBUTION_SCOPE = /\bdistribut/i;

export function rightsRecordIsComplete(record: FootageRightsInput | null | undefined): record is FootageRightsRecord {
  if (!record) return false;
  return Boolean(
    record.videoId?.trim() &&
      record.sourceUrl?.trim() &&
      record.title?.trim() &&
      record.evidence?.trim() &&
      record.evidence.trim().length >= 24 &&
      record.source?.trim() &&
      record.scope?.trim() &&
      record.approvedBy?.trim() &&
      record.status,
  );
}

export function scopeCoversCommercialEditAndDistribution(scope: string): boolean {
  return COMMERCIAL_SCOPE.test(scope) && EDIT_SCOPE.test(scope) && DISTRIBUTION_SCOPE.test(scope);
}

export function rightsAllowImport(record: FootageRightsRecord | null, now = new Date().toISOString()): { ok: true } | { ok: false; reason: string } {
  if (!record || record.status === "pending") {
    return { ok: false, reason: "Rights are pending. A checkbox cannot approve footage." };
  }
  if (record.status === "rejected") {
    return { ok: false, reason: "Use of this footage is rejected." };
  }
  if (!rightsRecordIsComplete(record)) {
    return { ok: false, reason: "Approved footage needs evidence, a source, a scope, and the person who approved it." };
  }
  if (!record.commercialUse || !record.editingRights || !record.distributionRights) {
    return { ok: false, reason: "Approved footage must record commercial use, editing rights, and distribution rights." };
  }
  if (!scopeCoversCommercialEditAndDistribution(record.scope)) {
    return { ok: false, reason: "The recorded scope must cover commercial use, editing, and distribution." };
  }
  if (record.sourceFileRef && (!/^video\/[A-Za-z0-9._/-]+\.mp4$/.test(record.sourceFileRef) || record.sourceFileRef.includes(".."))) {
    return { ok: false, reason: "The source file reference must be an existing library MP4." };
  }
  if (record.expiresAt) {
    const expiry = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiry)) return { ok: false, reason: "The expiry date is not a valid date." };
    if (expiry < Date.parse(now)) return { ok: false, reason: "The recorded licence has expired." };
  }
  return { ok: true };
}

export function importAuthorisedClip(input: {
  record: FootageRightsRecord | null;
  authorisedFileRel?: string;
  now?: string;
}): { allowed: false; reason: string } | { allowed: true } {
  const rights = rightsAllowImport(input.record, input.now);
  if (!rights.ok) return { allowed: false, reason: rights.reason };
  const rel = input.authorisedFileRel?.trim() || input.record?.sourceFileRef?.trim() || "";
  if (!/^video\/[A-Za-z0-9._/-]+\.mp4$/.test(rel) || rel.includes("..")) {
    return { allowed: false, reason: "No authorised source file is stored. A YouTube page is not downloaded." };
  }
  return { allowed: true };
}
