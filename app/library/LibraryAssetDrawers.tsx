"use client";

import { useEffect, useState, type ReactNode } from "react";
import { R365Button } from "@/app/components/R365Button";
import { DeleteBuildButton } from "@/app/components/DeleteBuildButton";
import {
  contentIdFromAnyBackgroundImageRel,
  contentIdFromUploadsBackdropVideoRel,
  contentIdFromVideoFilename,
  contentIdFromVoiceRecordingRel,
  type ManifestEntry,
} from "@/app/lib/asset-manifest";
import { digestKeywords } from "@/app/lib/library-digest-keywords";
import {
  libraryDownloadUrl,
  libraryFileUrl,
  libraryNewsShortsBackdropImageHref,
  libraryNewsShortsBackdropVideoHref,
} from "@/app/lib/library-file-urls";
import { studioApiPath } from "@/app/lib/app-base-path";

export type LibraryMetaIndex = Record<string, { title?: string; sourceUrl?: string; keywords?: string[] }>;

export type AudioStudioListItem = {
  id: string;
  title: string;
  projectId: string;
  source: string;
  relPath: string;
  mimeType: string;
  createdAt: string;
};

export type PodcastListItem = {
  projectId: string;
  title: string;
  outputAudioRel: string;
  updatedAt: string;
  sourceUrl?: string;
};

export function LayoutToggle({
  value,
  onChange,
  label = "Layout",
  ariaLabel,
}: {
  value: "grid" | "list";
  onChange: (v: "grid" | "list") => void;
  label?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">{label}</span>
      <div
        className="flex rounded-lg border p-0.5"
        style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
        role="group"
        aria-label={ariaLabel}
      >
        <button
          type="button"
          onClick={() => onChange("grid")}
          aria-pressed={value === "grid"}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === "grid"
              ? "bg-[color:var(--surface)] text-[color:var(--text-primary)] shadow-sm"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => onChange("list")}
          aria-pressed={value === "list"}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === "list"
              ? "bg-[color:var(--surface)] text-[color:var(--text-primary)] shadow-sm"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          List
        </button>
      </div>
    </div>
  );
}

function AssetDrawerShell({
  titleId,
  title,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-black/50 p-0"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col shadow-2xl"
        style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 id={titleId} className="min-w-0 truncate text-sm font-bold text-[color:var(--text-primary)]">
            {title}
          </h2>
          <R365Button type="button" variant="ghost" onClick={onClose}>
            Close
          </R365Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}

function manifestDisplayTitle(m: ManifestEntry): string {
  const t = m.seoTitle?.trim();
  if (t) return t;
  return m.id.replace(/-/g, " ");
}

function mergedKeywordList(entry: ManifestEntry, meta?: LibraryMetaIndex[string]): string[] | undefined {
  const merged = [...(entry.keywords ?? []), ...(meta?.keywords ?? [])];
  return merged.length ? merged : undefined;
}

export function LibraryImageDetailDrawer({
  rel,
  manifest,
  libraryMetadataByContentId,
  libraryWriteToken,
  libraryWriteTokenRequired,
  onClose,
  onImageFileDeleted,
}: {
  rel: string;
  manifest: ManifestEntry[];
  libraryMetadataByContentId: LibraryMetaIndex;
  libraryWriteToken: string;
  libraryWriteTokenRequired: boolean;
  onClose: () => void;
  onImageFileDeleted: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [fileDelBusy, setFileDelBusy] = useState(false);
  const [fileDelErr, setFileDelErr] = useState<string | null>(null);
  const cid = contentIdFromAnyBackgroundImageRel(rel);
  const meta = cid ? libraryMetadataByContentId[cid] : undefined;
  const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
  const base = rel.split("/").pop() ?? rel;
  const digest = digestKeywords(meta?.keywords);
  const displayTitle = meta?.title?.trim() || entry?.seoTitle?.trim() || cid || base;

  const copyLine = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied("err");
      window.setTimeout(() => setCopied(null), 1600);
    }
  };

  return (
    <AssetDrawerShell titleId="library-drawer-image-title" title={displayTitle} onClose={onClose}>
      <div className="library-media-chrome overflow-hidden rounded-xl bg-[color:var(--surface-muted)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={libraryFileUrl(rel)}
          alt=""
          className="mx-auto max-h-[min(42vh,520px)] w-full object-contain"
        />
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Quick actions</p>
      <div className="mt-2 flex flex-col gap-2">
        <a
          href={libraryNewsShortsBackdropImageHref(rel)}
          className="inline-flex items-center justify-center rounded-xl border border-transparent bg-[color:var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent-hover)]"
        >
          Use in News Shorts
        </a>
        <div className="flex flex-wrap gap-2">
          <a
            className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            href={libraryFileUrl(rel)}
            download={base}
          >
            Download
          </a>
          <a
            className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            href={libraryFileUrl(rel)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in new tab
          </a>
        </div>
      </div>

      {cid ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <R365Button type="button" variant="ghost" onClick={() => void copyLine("id", cid)}>
            {copied === "id" ? "Copied" : "Copy content ID"}
          </R365Button>
          <R365Button type="button" variant="ghost" onClick={() => void copyLine("path", rel)}>
            {copied === "path" ? "Copied" : "Copy file path"}
          </R365Button>
        </div>
      ) : (
        <div className="mt-4">
          <R365Button type="button" variant="ghost" onClick={() => void copyLine("path", rel)}>
            {copied === "path" ? "Copied" : "Copy file path"}
          </R365Button>
        </div>
      )}

      <p className="mt-4 text-[11px] font-semibold uppercase text-[color:var(--text-muted)]">Storage path</p>
      <p className="mt-1 break-all font-mono text-[11px] text-[color:var(--text-secondary)]">{rel}</p>

      {meta?.sourceUrl ? (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase text-[color:var(--text-muted)]">Source URL</p>
          <p className="mt-1 break-all text-xs text-[color:var(--text-secondary)]">{meta.sourceUrl}</p>
        </>
      ) : null}

      <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">
          Keywords & metadata{digest.count ? ` (${digest.count})` : ""}
        </summary>
        {digest.count === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">No keywords stored for this asset.</p>
        ) : (
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            {digest.joined}
          </pre>
        )}
      </details>

      <div className="mt-6 rounded-xl border bg-[color:var(--surface-muted)] p-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">Remove this file only</p>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
          Deletes this image from storage. Other files for the same content ID are left intact (use{" "}
          <strong className="text-[color:var(--text-primary)]">Danger zone</strong> below to wipe the whole folder).
        </p>
        {libraryWriteTokenRequired ? (
          <p className="mt-2 text-[11px] text-[color:var(--text-muted)]">
            If prompted for credentials, enter the admin token in <strong className="text-[color:var(--text-primary)]">Bulk actions</strong>{" "}
            above the grid first (logged-in admins typically skip this).
          </p>
        ) : null}
        <div className="mt-3">
          <R365Button
            variant="danger"
            disabled={fileDelBusy}
            onClick={() => void (async () => {
              if (libraryWriteTokenRequired && !libraryWriteToken.trim()) {
                setFileDelErr("Enter your admin token first.");
                return;
              }
              if (
                !confirm(
                  `Delete only this file from disk?\n\n${rel}\n\nManifest entries and other assets are not removed.`,
                )
              ) {
                return;
              }
              setFileDelBusy(true);
              setFileDelErr(null);
              try {
                const tok = libraryWriteToken.trim();
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (tok) headers["x-admin-token"] = tok;
                const res = await fetch(studioApiPath("/api/library/images/mutate"), {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    action: "deleteOne",
                    rel,
                    adminToken: tok || undefined,
                  }),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
                onImageFileDeleted();
              } catch (e) {
                setFileDelErr(e instanceof Error ? e.message : "Delete failed.");
              } finally {
                setFileDelBusy(false);
              }
            })()}
          >
            {fileDelBusy ? "Deleting…" : "Delete this image file"}
          </R365Button>
        </div>
        {fileDelErr ? <p className="mt-2 text-xs font-medium text-[color:var(--danger)]">{fileDelErr}</p> : null}
      </div>

      <div
        className="mt-8 rounded-xl border bg-[color:var(--surface-muted)] p-4"
        style={{ borderColor: "color-mix(in srgb, var(--danger) 28%, var(--border))" }}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">Danger zone</p>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
          Removes this background image and other matching assets for this content ID where applicable.
        </p>
        {cid ? (
          <div className="mt-3">
            <DeleteBuildButton contentId={cid} label="Delete image & matching assets" />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            No content ID inferred from this path — use <strong className="text-[color:var(--text-primary)]">Remove this file only</strong>{" "}
            above to delete just this file, or remove it manually from disk.
          </p>
        )}
      </div>
    </AssetDrawerShell>
  );
}

export function BuildManifestDetailDrawer({
  entry,
  libraryMetadataByContentId,
  onClose,
}: {
  entry: ManifestEntry;
  libraryMetadataByContentId: LibraryMetaIndex;
  onClose: () => void;
}) {
  const meta = libraryMetadataByContentId[entry.id];
  const digest = digestKeywords(mergedKeywordList(entry, meta));
  const title = manifestDisplayTitle(entry);

  return (
    <AssetDrawerShell titleId="library-drawer-build-title" title={title} onClose={onClose}>
      {entry.editedVideo ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#eab308]">Preview: edited cut</p>
      ) : null}
      <video
        src={libraryFileUrl(entry.editedVideo ?? entry.video)}
        controls
        playsInline
        title={title}
        className="library-media-chrome max-h-[min(55vh,720px)] w-full rounded-xl object-contain"
      />
      {entry.editedVideo ? (
        <p className="mt-2 text-center text-[11px] text-[color:var(--text-muted)]">
          <a className="text-[color:var(--accent)] hover:underline" href={libraryFileUrl(entry.video)} target="_blank" rel="noopener noreferrer">
            Open original build in new tab
          </a>
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[11px] text-[#eab308]">{entry.id}</p>
      <p className="text-xs text-[color:var(--text-muted)]">
        {entry.format} · {new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">Downloads</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {entry.editedVideo ? (
          <>
            <a
              className="rounded-lg border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
              href={libraryDownloadUrl(entry.editedVideo)}
            >
              Edited MP4
            </a>
            <a
              className="rounded-lg border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
              href={libraryDownloadUrl(entry.video)}
            >
              Original MP4
            </a>
          </>
        ) : (
          <a
            className="rounded-lg border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            href={libraryDownloadUrl(entry.video)}
          >
            Download MP4
          </a>
        )}
        <a
          className="rounded-lg border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryFileUrl(entry.subtitles)}
        >
          Preview {entry.subtitles.toLowerCase().endsWith(".ass") ? "ASS captions" : "SRT captions"}
        </a>
        <a
          className="rounded-lg border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryDownloadUrl(entry.subtitles)}
        >
          Download {entry.subtitles.toLowerCase().endsWith(".ass") ? "ASS captions" : "SRT captions"}
        </a>
      </div>

      <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">
          Keywords & metadata{digest.count ? ` (${digest.count})` : ""}
        </summary>
        {digest.count === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">No keywords on this build.</p>
        ) : (
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[color:var(--text-secondary)]">
            {digest.joined}
          </pre>
        )}
      </details>

      <div className="mt-8 rounded-xl border bg-[color:var(--surface-muted)] p-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-bold uppercase text-[color:var(--text-muted)]">Manage build</p>
        <div className="mt-3">
          <DeleteBuildButton contentId={entry.id} createdAt={entry.createdAt} />
        </div>
      </div>
    </AssetDrawerShell>
  );
}

export function BackdropVideoDetailDrawer({
  rel,
  libraryMetadataByContentId,
  variant,
  manifest,
  onClose,
}: {
  rel: string;
  libraryMetadataByContentId: LibraryMetaIndex;
  variant: "direct" | "runway";
  manifest: ManifestEntry[];
  onClose: () => void;
}) {
  const cid = contentIdFromUploadsBackdropVideoRel(rel);
  const meta = cid ? libraryMetadataByContentId[cid] : undefined;
  const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
  const digest = digestKeywords(meta?.keywords);
  const title = cid ? `Backdrop · ${cid}` : rel.split("/").pop() ?? rel;
  const aspectClass =
    variant === "runway"
      ? "library-media-chrome mx-auto aspect-[9/16] w-full max-h-[min(55vh,720px)] rounded-xl object-contain"
      : "library-media-chrome mx-auto max-h-[min(55vh,720px)] w-full rounded-xl object-contain";

  return (
    <AssetDrawerShell titleId="library-drawer-backdrop-title" title={title} onClose={onClose}>
      <video src={libraryFileUrl(rel)} controls playsInline title={title} className={aspectClass} />
      <p className="mt-3 font-mono text-[11px] text-[#eab308]">{cid ?? "—"}</p>
      <p className="break-all text-[11px] text-[color:var(--text-muted)]">{rel}</p>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href={libraryNewsShortsBackdropVideoHref(rel)}
          className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent-hover)]"
        >
          Use in News Shorts
        </a>
        <div className="flex flex-wrap gap-2">
          <a
            className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            href={libraryDownloadUrl(rel)}
          >
            {rel.toLowerCase().endsWith(".webm") ? "Download WebM" : "Download MP4"}
          </a>
          <a
            className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
            href={libraryFileUrl(rel)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in new tab
          </a>
        </div>
      </div>

      {meta?.sourceUrl || entry?.seoTitle ? (
        <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
          <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">Context</summary>
          {entry?.seoTitle ? <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{entry.seoTitle}</p> : null}
          {meta?.sourceUrl ? (
            <p className="mt-2 break-all text-[11px] text-[color:var(--text-muted)]">{meta.sourceUrl}</p>
          ) : null}
        </details>
      ) : null}

      <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">
          Keywords{digest.count ? ` (${digest.count})` : ""}
        </summary>
        {digest.count === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">No keywords.</p>
        ) : (
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[color:var(--text-secondary)]">
            {digest.joined}
          </pre>
        )}
      </details>

      {cid ? (
        <div className="mt-8 rounded-xl border bg-[color:var(--surface-muted)] p-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] font-bold uppercase text-[color:var(--text-muted)]">Danger zone</p>
          <div className="mt-3">
            <DeleteBuildButton contentId={cid} label="Delete video & assets" />
          </div>
        </div>
      ) : null}
    </AssetDrawerShell>
  );
}

export function VideoFolderScanDetailDrawer({
  videoRel,
  libraryMetadataByContentId,
  onClose,
}: {
  videoRel: string;
  libraryMetadataByContentId: LibraryMetaIndex;
  onClose: () => void;
}) {
  const cid = contentIdFromVideoFilename(videoRel);
  const meta = cid ? libraryMetadataByContentId[cid] : undefined;
  const digest = digestKeywords(meta?.keywords);
  const title = cid ? `Video scan · ${cid}` : videoRel;

  return (
    <AssetDrawerShell titleId="library-drawer-vscan-title" title={title} onClose={onClose}>
      <video
        src={libraryFileUrl(videoRel)}
        controls
        playsInline
        className="library-media-chrome mx-auto aspect-[9/16] max-h-[min(55vh,720px)] w-full rounded-xl object-contain"
      />
      <p className="mt-3 break-all font-mono text-[11px] text-[color:var(--text-secondary)]">{videoRel}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryDownloadUrl(videoRel)}
        >
          Download MP4
        </a>
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryFileUrl(videoRel)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </a>
      </div>

      <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">
          Keywords{digest.count ? ` (${digest.count})` : ""}
        </summary>
        {digest.count === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">No keywords.</p>
        ) : (
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[color:var(--text-secondary)]">
            {digest.joined}
          </pre>
        )}
      </details>

      <div className="mt-8 rounded-xl border bg-[color:var(--surface-muted)] p-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-bold uppercase text-[color:var(--text-muted)]">Delete</p>
        {cid ? (
          <div className="mt-3">
            <DeleteBuildButton contentId={cid} label="Delete this file & matching assets" />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            Filename doesn’t match <code className="text-[color:var(--text-secondary)]">*-short.mp4</code> — remove manually or rename to link a content ID.
          </p>
        )}
      </div>
    </AssetDrawerShell>
  );
}

export function AudioStudioDetailDrawer({
  audio,
  onClose,
}: {
  audio: AudioStudioListItem;
  onClose: () => void;
}) {
  return (
    <AssetDrawerShell titleId="library-drawer-audio-studio-title" title={audio.title} onClose={onClose}>
      <audio src={libraryFileUrl(audio.relPath)} controls className="library-media-chrome mt-1 w-full rounded-xl" title={audio.title} />
      <p className="mt-3 font-mono text-[11px] text-[#eab308]">{audio.projectId}</p>
      <p className="text-xs text-[color:var(--text-muted)]">{audio.relPath}</p>
      <p className="text-xs text-[color:var(--text-muted)]">
        Audio Studio · {audio.source} · {audio.mimeType || "audio"} ·{" "}
        {new Date(audio.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryDownloadUrl(audio.relPath)}
        >
          Download audio
        </a>
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryFileUrl(audio.relPath)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </a>
      </div>
    </AssetDrawerShell>
  );
}

export function VoiceRecordingDetailDrawer({
  rel,
  manifest,
  libraryMetadataByContentId,
  onClose,
}: {
  rel: string;
  manifest: ManifestEntry[];
  libraryMetadataByContentId: LibraryMetaIndex;
  onClose: () => void;
}) {
  const cid = contentIdFromVoiceRecordingRel(rel);
  const meta = cid ? libraryMetadataByContentId[cid] : undefined;
  const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
  const base = rel.split("/").pop() ?? rel;
  const title = meta?.title?.trim() || entry?.seoTitle?.trim() || (cid ? `Voice · ${cid}` : base);
  const digest = digestKeywords(meta?.keywords);

  return (
    <AssetDrawerShell titleId="library-drawer-voice-title" title={title} onClose={onClose}>
      <audio src={libraryFileUrl(rel)} controls className="library-media-chrome w-full rounded-xl" title={title} />
      <p className="mt-3 font-mono text-[11px] text-[#eab308]">{cid ?? rel}</p>
      <p className="break-all text-[11px] text-[color:var(--text-muted)]">{rel}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryDownloadUrl(rel)}
        >
          Download audio
        </a>
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryFileUrl(rel)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </a>
      </div>

      <details className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <summary className="cursor-pointer text-xs font-bold text-[color:var(--text-primary)]">
          Keywords{digest.count ? ` (${digest.count})` : ""}
        </summary>
        {digest.count === 0 ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">No keywords.</p>
        ) : (
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[color:var(--text-secondary)]">
            {digest.joined}
          </pre>
        )}
      </details>

      {cid ? (
        <div className="mt-8 rounded-xl border bg-[color:var(--surface-muted)] p-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] font-bold uppercase text-[color:var(--text-muted)]">Danger zone</p>
          <div className="mt-3">
            <DeleteBuildButton contentId={cid} label="Delete voice & matching assets" />
          </div>
        </div>
      ) : null}
    </AssetDrawerShell>
  );
}

export function PodcastDetailDrawer({
  pod,
  onClose,
}: {
  pod: PodcastListItem;
  onClose: () => void;
}) {
  return (
    <AssetDrawerShell titleId="library-drawer-podcast-title" title={pod.title} onClose={onClose}>
      <audio
        src={libraryFileUrl(pod.outputAudioRel)}
        controls
        className="library-media-chrome w-full rounded-xl"
        title={pod.title}
      />
      <p className="mt-3 font-mono text-[11px] text-[#eab308]">{pod.projectId}</p>
      <p className="break-all text-[11px] text-[color:var(--text-muted)]">{pod.outputAudioRel}</p>
      <p className="text-xs text-[color:var(--text-muted)]">
        Updated {new Date(pod.updatedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>
      {pod.sourceUrl ? <p className="mt-2 break-all text-[11px] text-[color:var(--text-muted)]">{pod.sourceUrl}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryDownloadUrl(pod.outputAudioRel)}
        >
          Download audio
        </a>
        <a
          className="rounded-xl border px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}
          href={libraryFileUrl(pod.outputAudioRel)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </a>
      </div>
    </AssetDrawerShell>
  );
}
