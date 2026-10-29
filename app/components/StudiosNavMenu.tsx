"use client";

import Link from "next/link";
import {
  STUDIOS_MENU_VIDEO_EXTRAS,
  studiosGroupedForNavMenu,
  type StudioDashboardCard,
} from "@/app/lib/studio-entries";

function StudioDropdownLink({ card }: { card: StudioDashboardCard }) {
  const unavailable = Boolean(card.status);
  if (unavailable) {
    return (
      <span
        className="flex cursor-not-allowed items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[color:var(--text-muted)]"
        title="Available in a future release"
      >
        <span>{card.title}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
          {card.status}
        </span>
      </span>
    );
  }
  return (
    <Link
      href={card.href}
      className="block rounded-md px-2 py-2 text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
    >
      {card.title}
    </Link>
  );
}

export function StudiosNavMenu() {
  const grouped = studiosGroupedForNavMenu();

  return (
    <details className="relative z-[60] group/studios" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.currentTarget.open = false; }}>
      <summary
        className="app-nav-link flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 text-sm transition [&::-webkit-details-marker]:hidden"
        style={{ color: "var(--text-secondary)" }}
      >
        Studios
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </summary>
      <div
        className="absolute left-0 top-full mt-2 min-w-[min(100vw-2rem,24rem)] rounded-2xl border p-3 shadow-lg md:min-w-[22rem]"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in srgb, var(--surface) 96%, transparent)",
        }}
        aria-label="Studios"
      >
        <div className="mb-3 rounded-xl bg-[color:var(--surface-muted)] px-3 py-2">
          <p className="text-xs font-semibold text-[color:var(--text-primary)]">Choose a studio</p>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">Start with a format, then move through source, preview and export.</p>
        </div>
        <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-y-auto pr-1">
          <Link href="/workspace" className="block rounded-md px-2 py-2 font-semibold text-[color:var(--accent)]">Upgraded Studio · projects, video and images</Link>
          {grouped.map(({ group, label, items }) => {
            if (items.length === 0) return null;
            const extras = group === "video" ? STUDIOS_MENU_VIDEO_EXTRAS : [];
            return (
              <div key={group}>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                  {label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {items.map((card) => (
                    <div key={card.href + card.title}>
                      <StudioDropdownLink card={card} />
                    </div>
                  ))}
                  {extras.map((x) => (
                    <Link
                      key={x.href}
                      href={x.href}
                      className="block rounded-md px-2 py-2 text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                    >
                      {x.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
