import { NextResponse } from "next/server";
import { scanLibraryVideoRels } from "@/app/lib/scan-library-videos";
import { authorisedClipFfmpegArgs, parseClipSelection } from "@/app/lib/video-search/clip";
import { importAuthorisedClip } from "@/app/lib/video-search/rights";
import { readFootageRights } from "@/app/lib/video-search/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { videoId?: unknown; startSeconds?: unknown; endSeconds?: unknown; authorisedFileRel?: unknown } | null;
  const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : "";
  const clip = parseClipSelection(body?.startSeconds, body?.endSeconds);
  if (!clip.ok) return NextResponse.json({ error: clip.reason }, { status: 400 });
  const record = videoId ? await readFootageRights(videoId) : null;
  const authorisedFileRel = typeof body?.authorisedFileRel === "string" && body.authorisedFileRel.trim()
    ? body.authorisedFileRel.trim()
    : record?.sourceFileRef ?? "";
  const decision = importAuthorisedClip({ record, authorisedFileRel });
  if (!decision.allowed) return NextResponse.json({ error: decision.reason }, { status: 403 });
  const files = await scanLibraryVideoRels();
  if (!files.includes(authorisedFileRel)) {
    return NextResponse.json({ error: "No authorised source file is stored. A YouTube page is not downloaded." }, { status: 403 });
  }
  return NextResponse.json({
    allowed: true,
    clip: clip.clip,
    ffmpegArgs: authorisedClipFfmpegArgs({ file: authorisedFileRel, clip: clip.clip, output: `video/${videoId}-clip.mp4` }),
    message: "The authorised library file can be cut later. Phase 1 does not encode or download.",
  });
}
