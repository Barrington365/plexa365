import Link from "next/link";
import { AgentManagement } from "./AgentManagement";
export const metadata = { title: "Agent Management · Plexa" };
export default function Page() {
  return <div className="space-y-6"><Link href="/admin" className="text-sm text-[color:var(--accent)]">← Back to Admin</Link><AgentManagement /></div>;
}
