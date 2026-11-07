import { NextResponse } from "next/server";
import { searchVideos } from "@/app/lib/video-search/search";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown; url?: unknown } | null;
  try {
    const result = await searchVideos({
      query: typeof body?.query === "string" ? body.query : "",
      url: typeof body?.url === "string" ? body.url : "",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ results: [], notice: message }, { status: 400 });
  }
}
