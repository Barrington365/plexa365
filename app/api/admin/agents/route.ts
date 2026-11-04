import { requireAdmin } from "@/app/lib/auth/guards";
import { aiChatText } from "@/app/lib/ai/client";
import { codexBinary, queueCodexMessage } from "@/app/lib/agents/codex";
import { characterBrief, commandSchema, dispatchThread } from "@/app/lib/agents/model";
import { Conflict, readAgents, updateAgents } from "@/app/lib/agents/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  try { return Response.json({ ...(await readAgents()), codexReachable: Boolean(await codexBinary()) }, {headers:{"Cache-Control":"no-store"}}); }
  catch { return Response.json({error:"Agent records could not be loaded. Try again."},{status:503}); }
}
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({error:"Same-origin request required."},{status:403});
  const body = await request.json().catch(() => null);
  const parsed = commandSchema.safeParse(body?.command);
  if (!parsed.success || !Number.isSafeInteger(body?.version) || body.version < 0) return Response.json({error:"Check all required fields."},{status:400});
  try {
    if (parsed.data.action === "message") {
      const current = await readAgents();
      if (current.version !== body.version) throw new Conflict("Another Admin saved changes. Refresh before saving.");
      await queueCodexMessage(dispatchThread(current, parsed.data.taskId), parsed.data.note);
    }
    let next = await updateAgents(parsed.data, body.version, auth.user.id);
    if (parsed.data.action === "talk") {
      const agentId = parsed.data.agentId;
      const agent = next.agents.find((item) => item.id === agentId);
      if (agent) {
        try {
          const brief = characterBrief(agent, auth.user);
          const reply = await aiChatText({ task: "admin_dev_gateway", forceProvider: "openai", temperature: 0.4, maxTokens: 350, system: brief.system, user: brief.user });
          const text = reply.text.trim().slice(0, 2000);
          if (text) next = await updateAgents({ action: "reply", agentId, note: text }, next.version, auth.user.id);
        } catch { /* The admin line stays on screen when a reply cannot be generated. */ }
        if (agent.approved && agent.codexThread && await codexBinary()) {
          try { await queueCodexMessage(agent.codexThread, parsed.data.note); } catch { /* The on-screen conversation does not depend on the Codex queue. */ }
        }
      }
    }
    return Response.json({ ...next, codexReachable: Boolean(await codexBinary()) });
  }
  catch (e) { return Response.json({error: e instanceof Error ? e.message : "Save failed."},{status:e instanceof Conflict ? 409 : 400}); }
}
