import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth/guards";
import Link from "next/link";
import { AgentManagement } from "./AgentManagement";
export const metadata = { title: "Agent Management · Plexa" };
export default async function Page() {
  const auth = await requireAdmin(new Request("https://studio.internal/admin/agents", {headers: await headers()}));
  if ("response" in auth) redirect(auth.response.status === 401 ? "/login" : "/workspace/studio");
  return <div className="space-y-6"><Link href="/admin" className="text-sm text-[color:var(--accent)]">← Back to Admin</Link><AgentManagement /></div>;
}
