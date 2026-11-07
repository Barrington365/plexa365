"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/app/components/Panel";
import { R365Button } from "@/app/components/R365Button";
import { studioApiPath } from "@/app/lib/app-base-path";
import { youtubeEmbedUrl } from "@/app/lib/youtube-script/embed";
import { VideoSearchBuildStatus } from "@/app/components/VideoSearchBuildStatus";
import type { VideoCandidate } from "@/app/lib/video-search/candidates";
import type { FootageRightsStatus } from "@/app/lib/video-search/rights";

type SearchPayload = { results: VideoCandidate[]; notice: string; searchedAt?: string };
type SheetStory = {
  brand: string;
  article: string;
  notice: string;
  searchedAt?: string;
  candidates: VideoCandidate[];
};

const field = "mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-2 text-sm text-[color:var(--text-primary)]";

export function VideoSearchImport() {
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<VideoCandidate[]>([]);
  const [notice, setNotice] = useState("Search by keyword or paste a YouTube URL. Playback stays in YouTube's player.");
  const [searchedAt, setSearchedAt] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("10");
  const [previewKey, setPreviewKey] = useState(0);
  const [status, setStatus] = useState<FootageRightsStatus>("pending");
  const [evidence, setEvidence] = useState("");
  const [source, setSource] = useState("");
  const [scope, setScope] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [commercialUse, setCommercialUse] = useState(false);
  const [editingRights, setEditingRights] = useState(false);
  const [distributionRights, setDistributionRights] = useState(false);
  const [sourceFileRef, setSourceFileRef] = useState("");
  const [brand, setBrand] = useState("");
  const [article, setArticle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [subjects, setSubjects] = useState("");
  const [checkbox, setCheckbox] = useState(false);
  const [rightsMessage, setRightsMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [sheet, setSheet] = useState<SheetStory[]>([]);
  const [busy, setBusy] = useState("");

  const selected = results.find((row) => row.videoId === selectedId) ?? null;
  const importReady = Boolean(
    selected?.rightsStatus === "approved" &&
      commercialUse &&
      editingRights &&
      distributionRights &&
      evidence.trim().length >= 24 &&
      approvedBy.trim() &&
      /^video\/[A-Za-z0-9._/-]+\.mp4$/.test(sourceFileRef.trim()) &&
      !sourceFileRef.includes(".."),
  );
  const embed = useMemo(() => {
    if (!selected) return "";
    return youtubeEmbedUrl(selected.videoId, { startSeconds: Number(start), endSeconds: Number(end) });
  }, [selected, start, end]);

  async function search() {
    setBusy("search");
    setRightsMessage("");
    setImportMessage("");
    try {
      const response = await fetch(studioApiPath("/api/tools/video-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, url }),
      });
      const payload = (await response.json()) as SearchPayload & { notice?: string };
      setResults(payload.results ?? []);
      setNotice(payload.notice || "Search finished.");
      setSearchedAt(payload.searchedAt ?? "");
      setSelectedId(payload.results?.[0]?.videoId ?? "");
    } catch {
      setNotice("Search failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveRights() {
    if (!selected) return;
    setBusy("rights");
    setRightsMessage("");
    const response = await fetch(studioApiPath("/api/tools/video-search/rights"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: selected.videoId,
        sourceUrl: selected.url,
        title: selected.title,
        creator: selected.creator,
        status,
        evidence,
        source,
        scope,
        commercialUse,
        editingRights,
        distributionRights,
        sourceFileRef,
        expiresAt,
        approvedBy,
        brand,
        article,
        projectId,
        subjects: subjects.split(",").map((item) => item.trim()).filter(Boolean),
        permissionCheckbox: checkbox,
      }),
    });
    const payload = (await response.json()) as { error?: string; record?: { status: FootageRightsStatus; updatedAt: string } };
    if (!response.ok) {
      setRightsMessage(payload.error || "Rights were not saved.");
      setBusy("");
      return;
    }
    setResults((rows) => rows.map((row) => row.videoId === selected.videoId ? { ...row, rightsStatus: payload.record?.status ?? status } : row));
    setRightsMessage(`Rights saved as ${payload.record?.status} at ${payload.record?.updatedAt}. No video file was stored.`);
    setBusy("");
  }

  async function requestImport() {
    if (!selected) return;
    setBusy("import");
    setImportMessage("");
    const response = await fetch(studioApiPath("/api/tools/video-search/import"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: selected.videoId, startSeconds: Number(start), endSeconds: Number(end) }),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    setImportMessage(payload.error || payload.message || "Import did not run.");
    setBusy("");
  }

  async function loadSheet() {
    setBusy("sheet");
    const response = await fetch(studioApiPath("/api/tools/video-search/sheet"), { method: "POST" });
    const payload = (await response.json()) as { stories?: SheetStory[] };
    setSheet(payload.stories ?? []);
    setBusy("");
  }

  return (
    <div className="space-y-4 text-[color:var(--text-primary)]">
      <p className="text-sm text-[color:var(--text-secondary)]"><Link href="/tools">Tools</Link> / Video Search & Import</p>
      <VideoSearchBuildStatus />
      <Panel title="Search">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Keyword
            <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Liam Lawson Racing Bulls" />
          </label>
          <label className="text-sm">YouTube URL
            <input className={field} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=" />
          </label>
        </div>
        <div className="mt-3"><R365Button onClick={() => void search()} disabled={busy === "search"}>{busy === "search" ? "Searching" : "Search"}</R365Button></div>
        <p className="mt-3 text-sm text-[color:var(--text-secondary)]">{notice}</p>
        {searchedAt ? <p className="mt-1 text-xs">Search completed {searchedAt} UTC</p> : null}
      </Panel>
      <div className="grid gap-3">
        {results.map((row) => (
          <article key={row.videoId} className="grid gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 md:grid-cols-[160px_1fr]">
            {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="h-24 w-40 rounded-lg object-cover" /> : <div className="h-24 w-40 rounded-lg bg-[color:var(--surface-muted)]" />}
            <div>
              <h3 className="font-bold">{row.title}</h3>
              <p className="text-sm">{row.creator} · {row.durationLabel} · {row.landscapeLabel}</p>
              <p className="text-sm">Rights: {row.rightsStatus}</p>
              <a className="break-all text-sm underline" href={row.url} target="_blank" rel="noreferrer">{row.url}</a>
              <div className="mt-2"><R365Button variant="ghost" onClick={() => setSelectedId(row.videoId)}>Preview</R365Button></div>
            </div>
          </article>
        ))}
      </div>
      {selected ? (
        <Panel title="Preview and clip">
          <p className="mb-3 text-sm">{selected.title} · {selected.creator} · Rights {selected.rightsStatus}</p>
          <iframe key={`${selected.videoId}-${previewKey}`} title={selected.title} src={embed} className="aspect-video w-full rounded-xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm">Start seconds<input className={field} value={start} onChange={(event) => setStart(event.target.value)} inputMode="decimal" /></label>
            <label className="text-sm">End seconds<input className={field} value={end} onChange={(event) => setEnd(event.target.value)} inputMode="decimal" /></label>
            <p className="self-end text-sm">Target 1920 × 1080 MP4. Duration {Math.max(0, Number(end) - Number(start)) || 0}s.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <R365Button variant="ghost" onClick={() => setPreviewKey((value) => value + 1)}>Preview clip</R365Button>
            <R365Button variant="danger" onClick={() => void requestImport()} disabled={!importReady || busy === "import"}>Import MP4</R365Button>
          </div>
          {importReady ? null : <p className="mt-3 text-sm">Import MP4 stays closed until an administrator records evidence, commercial use, editing, distribution, an approver, and an authorised library MP4.</p>}
          {importMessage ? <p role="status" className="mt-3 text-sm">{importMessage}</p> : null}
        </Panel>
      ) : null}
      {selected ? (
        <Panel title="Rights">
          <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Approved needs a recorded licence or ownership note, the source of that evidence, a scope covering commercial use, editing and distribution, and the person who approved it. The checkbox is ignored.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Status
              <select className={field} value={status} onChange={(event) => setStatus(event.target.value as FootageRightsStatus)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="text-sm">Approving administrator<input className={field} value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} /></label>
            <label className="text-sm md:col-span-2">Evidence<textarea className={field} value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={3} /></label>
            <label className="text-sm">Evidence source<input className={field} value={source} onChange={(event) => setSource(event.target.value)} /></label>
            <label className="text-sm">Expiry<input className={field} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
            <label className="text-sm md:col-span-2">Scope<input className={field} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Commercial use, editing and distribution" /></label>
            <label className="text-sm md:col-span-2">Authorised source file<input className={field} value={sourceFileRef} onChange={(event) => setSourceFileRef(event.target.value)} placeholder="video/owned-file.mp4" /></label>
            <label className="text-sm">Brand<input className={field} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
            <label className="text-sm">Article<input className={field} value={article} onChange={(event) => setArticle(event.target.value)} /></label>
            <label className="text-sm">Project<input className={field} value={projectId} onChange={(event) => setProjectId(event.target.value)} /></label>
            <label className="text-sm">Subjects<input className={field} value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder="Comma separated" /></label>
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={commercialUse} onChange={(event) => setCommercialUse(event.target.checked)} /> Commercial use is covered by the evidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editingRights} onChange={(event) => setEditingRights(event.target.checked)} /> Editing rights are covered by the evidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={distributionRights} onChange={(event) => setDistributionRights(event.target.checked)} /> Distribution rights are covered by the evidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={checkbox} onChange={(event) => setCheckbox(event.target.checked)} /> I have permission to use this video</label>
          </div>
          <div className="mt-3"><R365Button onClick={() => void saveRights()} disabled={busy === "rights"}>Save rights</R365Button></div>
          {rightsMessage ? <p role="status" className="mt-3 text-sm">{rightsMessage}</p> : null}
        </Panel>
      ) : null}
      <Panel title="Hollywoodbets LIVE footage sheet">
        <p className="text-sm text-[color:var(--text-secondary)]">Candidates for Naomi Carter's three stories. This does not change her narration or the video project, and it does not add clips to the timeline.</p>
        <div className="mt-3"><R365Button onClick={() => void loadSheet()} disabled={busy === "sheet"}>{busy === "sheet" ? "Building sheet" : "Build footage sheet"}</R365Button></div>
        {sheet.map((story) => (
          <section key={story.article} className="mt-4">
            <h3 className="font-bold">{story.brand} — {story.article}</h3>
            <p className="text-xs text-[color:var(--text-secondary)]">{story.candidates.length} candidate{story.candidates.length === 1 ? "" : "s"}{story.searchedAt ? ` · searched ${story.searchedAt} UTC` : ""}</p>
            <p className="text-sm">{story.notice}</p>
            <ul className="mt-2 space-y-2">
              {story.candidates.map((row) => (
                <li key={row.videoId} className="grid grid-cols-[72px_1fr] gap-2 text-sm">
                  {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" className="h-12 w-16 rounded object-cover" /> : <span />}
                  <span><strong>{row.title}</strong><br />{row.creator} · {row.durationLabel} · {row.landscapeLabel} · Rights {row.rightsStatus}<br /><a className="break-all underline" href={row.url}>{row.url}</a></span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Panel>
    </div>
  );
}
