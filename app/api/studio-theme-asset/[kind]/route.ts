import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const files = {
  css: { name: "studio-theme.css", type: "text/css; charset=utf-8" },
  js: { name: "studio-theme.js", type: "text/javascript; charset=utf-8" },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const file = files[(await params).kind as keyof typeof files];
  if (!file) return new Response("Not found", { status: 404 });
  const body = await fs.readFile(path.join(process.cwd(), "features/msn-local", file.name));
  return new Response(body, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
