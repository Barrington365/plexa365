import { requireAdmin } from "@/app/lib/auth/guards";
import { NextResponse } from "next/server";
import { saveFootageRights } from "@/app/lib/video-search/store";
import type { FootageRightsStatus } from "@/app/lib/video-search/rights";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A rights record is required." }, { status: 400 });
  const status = body.status;
  const saved = await saveFootageRights({
    videoId: typeof body.videoId === "string" ? body.videoId : "",
    sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : "",
    title: typeof body.title === "string" ? body.title : "",
    creator: typeof body.creator === "string" ? body.creator : "",
    status: status === "approved" || status === "pending" || status === "rejected" ? status as FootageRightsStatus : undefined,
    evidence: typeof body.evidence === "string" ? body.evidence : "",
    source: typeof body.source === "string" ? body.source : "",
    scope: typeof body.scope === "string" ? body.scope : "",
    commercialUse: body.commercialUse === true,
    editingRights: body.editingRights === true,
    distributionRights: body.distributionRights === true,
    sourceFileRef: typeof body.sourceFileRef === "string" ? body.sourceFileRef : "",
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : "",
    approvedBy: auth.user.id,
    brand: typeof body.brand === "string" ? body.brand : "",
    article: typeof body.article === "string" ? body.article : "",
    projectId: typeof body.projectId === "string" ? body.projectId : "",
    subjects: Array.isArray(body.subjects) ? body.subjects.filter((item): item is string => typeof item === "string") : [],
    permissionCheckbox: body.permissionCheckbox,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.reason }, { status: 400 });
  return NextResponse.json({ record: saved.record, libraryContentId: saved.libraryContentId });
}
