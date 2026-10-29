import Link from "next/link";
import { Panel } from "@/app/components/Panel";
import { BRAND_SUITE_UPPER } from "@/app/lib/brand";
import {
  NAV_GROUP_LABEL,
  NAV_GROUP_ORDER,
  PRIMARY_STUDIO_CARDS,
  SUPPORT_CARDS,
  type StudioDashboardCard,
} from "@/app/lib/studio-entries";

const workflowSteps = ["Choose tool", "Add source", "Configure", "Preview", "Export"];

function StudioDashboardCardBlock({ card }: { card: StudioDashboardCard }) {
  const panelBody = (
    <Panel title={card.title}>
      <div className="flex h-full flex-col">
        {card.status ? (
          <div className="mb-2 flex justify-end">
            <span className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
              {card.status}
            </span>
          </div>
        ) : null}
        <p className="mt-2 text-sm font-semibold text-[color:var(--text-secondary)]">{card.heading}</p>
        <p className="mt-2 flex-1 text-sm leading-6 text-[color:var(--text-muted)]">{card.description}</p>
        <span
          className={`mt-6 inline-flex text-sm font-semibold ${
            card.accent === "muted"
              ? "text-[color:var(--text-secondary)]"
              : "text-[color:var(--accent)]"
          }`}
        >
          {card.cta}
          {card.status ? null : " →"}
        </span>
      </div>
    </Panel>
  );

  if (card.status) {
    return (
      <div
        className="rounded-2xl opacity-[0.92] ring-1 ring-[color:var(--border)]"
        aria-label={`${card.title} (${card.status})`}
      >
        {panelBody}
      </div>
    );
  }

  return (
    <Link href={card.href} className="block transition hover:-translate-y-0.5 hover:opacity-95">
      {panelBody}
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-10">
      <div className="rounded-[2rem] border bg-[color:var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8" style={{ borderColor: "var(--border)" }}>
        {BRAND_SUITE_UPPER ? (
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[color:var(--accent)]">{BRAND_SUITE_UPPER}</p>
        ) : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--text-primary)] sm:text-5xl">
              Create, review and publish sports media faster.
            </h1>
            <p className="mt-4 text-lg leading-8 text-[color:var(--text-secondary)]">
              Choose a studio, add the source material, preview the output and save final assets to the library. Planet
              Sport Studio keeps video, editorial, audio and translation workflows in one clean production hub.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/workspace"
              className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-black text-[color:var(--accent-foreground)] transition hover:bg-[color:var(--accent-hover)]"
            >
              Open upgraded Studio
            </Link>
            <Link
              href="/library"
              className="rounded-full border px-5 py-3 text-sm font-bold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              style={{ borderColor: "var(--border)" }}
            >
              Open library
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-3 border-t pt-6 sm:grid-cols-5" style={{ borderColor: "var(--border)" }}>
          {workflowSteps.map((step, index) => (
            <div key={step} className="rounded-2xl bg-[color:var(--surface-muted)] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-[color:var(--accent)]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-1 text-sm font-bold text-[color:var(--text-primary)]">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div id="studios" className="scroll-mt-28 space-y-10 md:scroll-mt-24">
        {NAV_GROUP_ORDER.map((group) => {
          const cards = PRIMARY_STUDIO_CARDS.filter((c) => c.navGroup === group);
          if (cards.length === 0) return null;
          const headingId = `studio-group-${group}`;
          return (
            <section key={group} aria-labelledby={headingId}>
              <h2
                id={headingId}
                className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--text-muted)]"
              >
                {NAV_GROUP_LABEL[group]}
              </h2>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                  <StudioDashboardCardBlock key={card.title} card={card} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Panel title="Support">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {SUPPORT_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-2xl border bg-[color:var(--surface-muted)] p-3 transition hover:border-[color:var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="text-sm font-bold text-[color:var(--text-primary)]">{card.title}</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{card.description}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
