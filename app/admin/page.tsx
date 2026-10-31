import Link from "next/link";
import { PlexaGatewayPopout } from "@/app/components/PlexaGatewayPopout";
import { BRAND_SUITE } from "@/app/lib/brand";

export const metadata = {
  title: `Admin · ${BRAND_SUITE}`,
};

const adminLinks = [
  { title: "Agent Management", href: "/admin/agents", description: "Configure production and engineering agents, prepare tasks and review approvals. All agents remain paused.", status: "Admin" },
  {
    title: "Plexa Dev Gateway",
    href: "/dev-gateway",
    description: "Run advisory release checks, QA reviews, rollback checks and Cursor fix prompts before testing.",
    status: "Admin",
  },
  {
    title: "Users and permissions",
    href: "/admin/users-and-permissions",
    description: "Invite registered users and manage meeting, audio, editor and admin roles.",
    status: "Admin",
  },
  {
    title: "Theme and display",
    href: "/admin/theme-and-display",
    description: "Manage Planet Sport Studio display settings, visual defaults and theme controls.",
    status: "Admin",
  },
  {
    title: "Provider keys and platform services",
    href: "/admin/provider-keys-and-platform-services",
    description: "Manage OpenAI, ElevenLabs, Daily, video, live and translation/localisation providers.",
    status: "Admin",
  },
  {
    title: "Crons",
    href: "/admin/crons",
    description: "Schedule client content imports from XML, RSS, URL and API feeds with run history and failure alerts.",
    status: "Admin",
  },
  {
    title: "Article Automations",
    href: "/admin/article-automations",
    description: "Predefine rewrite and translation rules per feed and client while keeping manual review control.",
    status: "Admin",
  },
  {
    title: "R&D Reports",
    href: "/admin/reports",
    description: "View AI Studio R&D assessment, technical report, barriers and evidence notes.",
    status: "Live",
  },
  {
    title: "Admin About",
    href: "/admin/about",
    description: "Product, environment and local access notes for the current build.",
    status: "Live",
  },
  {
    title: "Theme Preview",
    href: "/admin/theme-preview",
    description: "Check Planet Sport Studio surfaces, typography, panels and theme tokens.",
    status: "Live",
  },
  {
    title: "API Client Access",
    href: "/language-studio?tab=Client%20Access",
    description: "Manage Language Studio client access and API-style delivery controls.",
    status: "Admin",
  },
  {
    title: "Export Feeds",
    href: "/language-studio?tab=Export%20Feeds",
    description: "Configure export feed destinations, XML/JSON output settings and delivery governance.",
    status: "Admin",
  },
];

const adminAreas = [
  {
    label: "User Access",
    value: "Secure",
    description: "Invite and manage verified Planet Sport Studio users.",
  },
  {
    label: "Platform APIs",
    value: "Keys",
    description: "OpenAI, Runway, ElevenLabs, Apify, Mux, Livepeer and tool paths.",
  },
  {
    label: "Language Engine",
    value: "Providers",
    description: "OpenAI / DeepL mode, localisation model and translation settings.",
  },
  {
    label: "R&D Evidence",
    value: "Reports",
    description: "Track product direction, failures, barriers and technical uncertainty.",
  },
];

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border bg-[color:var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[color:var(--accent)]">Platform Admin</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--text-primary)]">Control panel</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-secondary)]">
              Manage users, provider keys, language settings, R&D reports and operational references for this
              Planet Sport Studio environment. In production, set{" "}
              <code className="rounded bg-[color:var(--surface-muted)] px-1.5 py-0.5 text-[color:var(--text-secondary)]">ADMIN_TOKEN</code> in the server
              environment before saving protected settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PlexaGatewayPopout
              triggerLabel="Plexa Gateway"
              triggerClassName="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-foreground)] transition hover:bg-[color:var(--accent-hover)]"
            />
            <Link href="/admin/reports" className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-foreground)] transition hover:bg-[color:var(--accent-hover)]">
              Open R&D Reports
            </Link>
            <Link href="/product" className="rounded-full border px-4 py-2 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]" style={{ borderColor: "var(--border)" }}>
              Product Page
            </Link>
            <Link href="/how-it-works" className="rounded-full border px-4 py-2 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]" style={{ borderColor: "var(--border)" }}>
              How It Works
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {adminAreas.map((area) => (
          <div key={area.label} className="rounded-2xl border bg-[color:var(--surface)] p-4 shadow-[var(--shadow-card)]" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">{area.label}</p>
            <p className="mt-2 text-2xl font-black text-[color:var(--text-primary)]">{area.value}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{area.description}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--accent)]">Admin Pages</p>
          <h2 className="mt-1 text-2xl font-black text-[color:var(--text-primary)]">Settings, access and reference</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border bg-[color:var(--surface)] p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[color:var(--text-primary)]">{item.title}</p>
                <span className="rounded-full border bg-[color:var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[color:var(--primary)]" style={{ borderColor: "var(--border)" }}>
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{item.description}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[color:var(--accent)]">Open →</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
