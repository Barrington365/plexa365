import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Panel } from "@/app/components/Panel";
import { HubPipelineActions } from "@/app/components/HubPipelineActions";
import type { TemplateFormatKey } from "@/app/components/TemplateNewButton";
import { BRAND_SUITE } from "@/app/lib/brand";
import type { ManifestEntry } from "@/app/lib/asset-manifest";
import { readStoredManifest } from "@/app/lib/asset-manifest-store";
import { NEWS_SHORTS_BRAND_TEMPLATES } from "@/app/features/news-shorts/news-shorts-brand-templates";
import { sport365HubPipelines, type HubPipeline } from "@/app/lib/templates-hub/sport365-pipelines";

export const metadata: Metadata = {
  title: `Landscape Studio · ${BRAND_SUITE}`,
  description: "Create and open Landscape templates (tpl-…) by vertical and brand.",
};

type Pipeline = HubPipeline;

const horseRacing: Pipeline[] = [
  { id: "next-off", title: "Next off Template",
    description: "Tips intro, three selections, outro. tpl-* cards plus dummy races in data/dummy.",
    listPath: "/next-off?mode=landscape",
    exampleSlug: "next-off",
    previewFormat: "next-off",
    format: "next-off",
  },
  { id: "fast-results", title: "Fast results Template",
    description: "Winner, full-frame placings, branded outro. New tpl-* templates from here.",
    listPath: "/results?mode=landscape",
    exampleSlug: "fast-results",
    previewFormat: "fast-results",
    format: "fast-results",
  },
  { id: "racecard", title: "Racecards Template",
    description: "Odds ladder, movers, board pages. New tpl-* racecards from here.",
    listPath: "/racecards?mode=landscape",
    exampleSlug: "racecard",
    previewFormat: "racecard",
    format: "racecard",
  },
];

const f1: Pipeline[] = [
  { id: "f1-grid", title: "F1 Grid Template",
    description: "Landscape 1920×1080 starting grid: intro, two grid pages, outro. PNG + Landscape MP4.",
    listPath: "/f1-grid?mode=landscape",
    exampleSlug: "f1-grid",
    previewFormat: "f1-grid",
    format: "f1-grid",
  },
  { id: "f1-results", title: "F1 Results Template",
    description: "Race classification with stops; fastest lap on outro. Same landscape format.",
    listPath: "/f1-results?mode=landscape",
    exampleSlug: "f1-results",
    previewFormat: "f1-results",
    format: "f1-results",
  },
];

const teamtalk: Pipeline[] = [
  { id: "teamtalk-news", title: "TEAMtalk News Template",
    description: "Transfer-style neon bars, player + club logos, footer CTA. tpl-* in data/local.",
    listPath: "/teamtalk-news?mode=landscape",
    exampleSlug: "teamtalk-news",
    previewFormat: "teamtalk-news",
    format: "teamtalk-news",
  },
];

const planetRugby: Pipeline[] = [
  { id: "planet-rugby-table", title: "League Tables Template",
    description: "Import PlanetRugby tournament table URLs and build landscape table scenes.",
    listPath: "/planet-rugby-table?mode=landscape",
    exampleSlug: "planet-rugby-table",
    previewFormat: "planet-rugby-table",
    format: "planet-rugby-table",
  },
];

const planetFootball: Pipeline[] = [
  { id: "planet-football-table", title: "League Tables Template",
    description: "Import Sport365 football standings URLs and build landscape table scenes.",
    listPath: "/planet-football-table?mode=landscape",
    exampleSlug: "planet-football-table",
    previewFormat: "planet-football-table",
    format: "planet-football-table",
  },
];

const sport365 = sport365HubPipelines("landscape");

const football365: Pipeline[] = [
  { id: "football-lineups", title: "Football line-ups Template",
    description:
      "Import Sport365 Match Centre line-ups — pitch formation, bench, injuries. Portrait boards with editable CMS fields.",
    listPath: "/football-lineups",
    exampleSlug: "football-lineups",
    previewFormat: "football-lineups",
    format: "football-lineups",
  },
];

type BrandRow = {
  name: string;
  href?: string;
  linkLabel?: string;
};

const socialBrands: BrandRow[] = [
  { name: "PlanetF1.com", href: "/landscape#f1", linkLabel: "F1 templates" },
  { name: "Football365", href: "/landscape#football365", linkLabel: "Football line-ups" },
  { name: "Planet Rugby", href: "/landscape#planet-rugby", linkLabel: "League table templates" },
  { name: "Tennis365" },
  { name: "Planet Football" },
  { name: "Cricket365" },
  { name: "TEAMtalk", href: "/landscape#teamtalk", linkLabel: "TEAMtalk News" },
  { name: "Golf365" },
  { name: "Love Rugby League" },
  { name: "Grassroot Goals" },
  { name: "Racing365", href: "/landscape", linkLabel: "Landscape hub" },
  { name: "Sport365", href: "/landscape#sport365", linkLabel: "Line-Up & Team Sheet templates" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="ds-section-heading">{title}</h2>
      {children}
    </section>
  );
}

function PipelineGrid({
  items,
  libraryVideoByFormat,
  editorBasePath = "/editor",
}: {
  items: Pipeline[];
  libraryVideoByFormat: Record<string, string>;
  editorBasePath?: "/editor" | "/landscape/editor";
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <Panel key={p.id} title={p.title}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <LandscapeLibraryVideoThumbnail
              libraryRel={p.previewFormat ? libraryVideoByFormat[p.previewFormat] : undefined}
              label={p.title}
              placeholderLabel={p.previewPlaceholder?.label}
              placeholderHint={p.previewPlaceholder?.hint}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-[color:var(--text-secondary)]">{p.description}</p>
              <p className="font-mono text-xs text-[color:var(--text-muted)]">{p.listPath}</p>
              {p.format ? (
                <HubPipelineActions
                  format={p.format}
                  listPath={p.listPath}
                  editorBasePath={editorBasePath}
                  teamLineUpDefaults={p.teamLineUpDefaults}
                  teamSheetDefaults={p.teamSheetDefaults}
                />
              ) : (
                <Link href={p.listPath} className="ds-link-accent inline-flex pt-2 text-sm">
                  Open list →
                </Link>
              )}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function LandscapeLibraryVideoThumbnail({
  libraryRel,
  label,
  placeholderLabel,
  placeholderHint,
}: {
  libraryRel?: string;
  label: string;
  placeholderLabel?: string;
  placeholderHint?: string;
}) {
  if (!libraryRel) {
    return (
      <div
        className="flex aspect-[16/9] h-[88px] shrink-0 flex-col items-center justify-center rounded-lg border border-dashed px-2 text-center transition-[border-color,background-color] duration-200"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--surface-muted)",
          color: "var(--text-muted)",
        }}
        title="No landscape preview yet. Build a video from this template to show a preview."
      >
        <span className="text-[9px] font-semibold uppercase tracking-wide">
          {placeholderLabel ?? "Landscape preview"}
        </span>
        <span className="mt-1 text-[9px] leading-tight opacity-90">
          {placeholderHint ?? "Appears after you create one"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-200"
      style={{
        borderColor: "var(--border)",
        background: "var(--media-backdrop)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <video
        className="h-[88px] w-[156px] object-cover sm:h-[99px] sm:w-[176px]"
        src={`/api/file?rel=${encodeURIComponent(libraryRel)}`}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
        aria-label={`${label} landscape preview video`}
      />
    </div>
  );
}

function latestVideoByFormat(manifest: ManifestEntry[]): Record<string, string> {
  const latest = [...manifest].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const map: Record<string, string> = {};
  for (const m of latest) {
    if (m.buildMode !== "landscape") continue;
    if (!m?.format || map[m.format]) continue;
    map[m.format] = m.editedVideo ?? m.video;
  }
  return map;
}

export default async function LandscapePage() {
  const manifest = await readStoredManifest();
  const libraryVideoByFormat = latestVideoByFormat(manifest);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--text-primary)]">Landscape Studio</h1>
        <p className="mt-2 max-w-2xl text-[color:var(--text-secondary)]">
          Landscape video templates by vertical. Open a pipeline list to create or edit video templates.
        </p>
      </div>

      <Section id="horse-racing" title="Racing365">
        <PipelineGrid
          items={horseRacing}
          libraryVideoByFormat={libraryVideoByFormat}
          editorBasePath="/landscape/editor"
        />
      </Section>

      <Section id="f1" title="PlanetF1">
        <PipelineGrid
          items={f1}
          libraryVideoByFormat={libraryVideoByFormat}
          editorBasePath="/landscape/editor"
        />
      </Section>

      <Section id="planet-rugby" title="Planet Rugby">
        <PipelineGrid
          items={planetRugby}
          libraryVideoByFormat={libraryVideoByFormat}
          editorBasePath="/landscape/editor"
        />
      </Section>

      <Section id="planet-football" title="Planet Football">
        <PipelineGrid
          items={planetFootball}
          libraryVideoByFormat={libraryVideoByFormat}
          editorBasePath="/landscape/editor"
        />
      </Section>

      <Section id="sport365" title="Sport365">
        <p className="max-w-3xl text-sm text-[color:var(--text-secondary)]">
          Import line-ups from Sport365.{" "}
          <strong className="font-semibold text-[color:var(--text-primary)]">Split Team Sheet</strong> is the
          Barcelona-style layout (player left, XI right). Formation graphics at{" "}
          <Link href="/team-line-up?mode=landscape" className="ds-link-accent font-semibold">
            /team-line-up
          </Link>
          , team sheets at{" "}
          <Link href="/team-sheet?mode=landscape" className="ds-link-accent font-semibold">
            /team-sheet
          </Link>
          .
        </p>
        <div className="mt-4">
          <PipelineGrid
            items={sport365}
            libraryVideoByFormat={libraryVideoByFormat}
            editorBasePath="/landscape/editor"
          />
        </div>
      </Section>

      <Section id="news-shorts" title="News video (Planet Sport)">
        <p className="max-w-3xl text-sm text-[color:var(--text-secondary)]">
          Same article builder as Shorts Studio. From here each brand opens in{" "}
          <strong className="font-semibold text-[color:var(--text-primary)]">Landscape · 1920×1080</strong>. Shorts
          Studio still opens the same article as a vertical short.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {NEWS_SHORTS_BRAND_TEMPLATES.map((b) => (
            <Panel key={b.id} title={b.label}>
              <p className="text-sm text-[color:var(--text-secondary)]">{b.category}</p>
              <p className="mt-2 font-mono text-[11px] leading-snug text-[color:var(--text-muted)] break-all">
                {b.articleUrlPlaceholder}
              </p>
              <Link
                href={`/news-shorts?brand=${encodeURIComponent(b.id)}&format=landscape_video`}
                className="ds-link-accent mt-3 inline-flex text-sm font-semibold"
              >
                Open landscape video →
              </Link>
            </Panel>
          ))}
        </div>
      </Section>

      <Section id="teamtalk" title="TEAMtalk">
        <PipelineGrid
          items={teamtalk}
          libraryVideoByFormat={libraryVideoByFormat}
          editorBasePath="/landscape/editor"
        />
      </Section>

      <Section id="football365" title="Football365">
        <p className="max-w-3xl text-sm text-[color:var(--text-secondary)]">
          News articles from football365.com open as landscape video. Line-up boards stay on the template below.
        </p>
        <Link
          href="/news-shorts?brand=football365&format=landscape_video"
          className="ds-link-accent mt-3 inline-flex text-sm font-semibold"
        >
          Open Football365 news as landscape →
        </Link>
        <div className="mt-4">
          <PipelineGrid items={football365} libraryVideoByFormat={libraryVideoByFormat} />
        </div>
      </Section>

      <section className="space-y-4">
        <h2 className="ds-section-heading">Brands</h2>
        <p className="max-w-2xl text-sm text-[color:var(--text-secondary)]">
          Dedicated packs per brand will land here. Where a pipeline already exists, we link to it; otherwise{" "}
          <strong className="font-semibold text-[color:var(--text-primary)]">Coming soon</strong>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {socialBrands.map((b) => (
            <div key={b.name} className="ui-card px-4 py-3">
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">{b.name}</p>
              {b.href ? (
                <Link href={b.href} className="ds-link-accent mt-2 inline-flex text-xs font-semibold">
                  {b.linkLabel ?? "Open"} →
                </Link>
              ) : (
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
                  Coming soon
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
