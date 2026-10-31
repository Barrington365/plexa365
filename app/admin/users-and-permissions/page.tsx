import Link from "next/link";
import { UserManagementPanel } from "@/app/admin/UserManagementPanel";
import { BRAND_SUITE } from "@/app/lib/brand";

export const metadata = {
  title: `Users and permissions · ${BRAND_SUITE}`,
};

export default function UsersAndPermissionsPage() {
  return (
    <div className="space-y-6">
      <AdminBackLink />
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22c55e]">Access</p>
        <h1 className="mt-1 text-3xl font-black text-white">Users and permissions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Invite Planet Sport Studio users and assign access roles for meetings, audio tools, editing tools and admin.
        </p>
      </section>
      <nav className="flex gap-4"><a href="#real-users">Real users</a><Link href="/admin/profiles">Presenters &amp; profile directory</Link><Link href="/admin/agents">Agents &amp; permissions</Link></nav>
      <div id="real-users"><UserManagementPanel /></div>
    </div>
  );
}

function AdminBackLink() {
  return <Link href="/admin" className="text-sm font-semibold text-[#22c55e] hover:underline">Back to Admin</Link>;
}
