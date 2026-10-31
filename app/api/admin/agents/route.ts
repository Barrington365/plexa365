import { requireAdmin } from "@/app/lib/auth/guards";
import { commandSchema } from "@/app/lib/agents/model";
import { Conflict, readAgents, updateAgents } from "@/app/lib/agents/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  try { return Response.json(await readAgents(), {headers:{"Cache-Control":"no-store"}}); }
  catch { return Response.json({error:"Agent records could not be loaded. Try again."},{status:503}); }
}
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({error:"Same-origin request required."},{status:403});
  const body = await request.json().catch(() => null);
  const parsed = commandSchema.safeParse(body?.command);
  if (!parsed.success || !Number.isSafeInteger(body?.version) || body.version < 0) return Response.json({error:"Check all required fields."},{status:400});
  try { return Response.json(await updateAgents(parsed.data,body.version,auth.user.id)); }
  catch (e) { return Response.json({error: e instanceof Error ? e.message : "Save failed."},{status:e instanceof Conflict ? 409 : 400}); }
}
