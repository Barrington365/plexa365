"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/app/components/Panel";
import { R365Button } from "@/app/components/R365Button";
import { CleanOrphansButton } from "@/app/components/CleanOrphansButton";
import { LANGUAGE_LABELS, type LanguageCode } from "@/app/lib/language-studio/types";
import {
  contentIdFromAnyBackgroundImageRel,
  contentIdFromUploadsBackdropVideoRel,
  contentIdFromVideoFilename,
  contentIdFromVoiceRecordingRel,
  type ManifestEntry,
} from "@/app/lib/asset-manifest";
import { digestKeywords } from "@/app/lib/library-digest-keywords";
import {
  libraryFileUrl as fileUrl,
  libraryNewsShortsBackdropImageHref as newsShortsBackdropImageHref,
  libraryNewsShortsBackdropVideoHref as newsShortsBackdropVideoHref,
} from "@/app/lib/library-file-urls";
import {
  AudioStudioDetailDrawer,
  BackdropVideoDetailDrawer,
  BuildManifestDetailDrawer,
  LayoutToggle,
  LibraryImageDetailDrawer,
  PodcastDetailDrawer,
  VideoFolderScanDetailDrawer,
  VoiceRecordingDetailDrawer,
} from "@/app/library/LibraryAssetDrawers";
import {
  LIBRARY_PAGE_SIZE,
  LibraryBulkSelectionBar,
  LibraryPaginationBar,
  paginateSlice,
} from "@/app/library/LibraryListBulkControls";
import { studioApiPath } from "@/app/lib/app-base-path";

function formatManifestSavedAt(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return "saved time unknown";
  return `${new Date(ms).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

const BRAND_RULES: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  { id: "football365", label: "Football365", patterns: [/football365/i] },
  { id: "racing365", label: "Racing365", patterns: [/racing365/i] },
  { id: "planetsport", label: "Planet Sport", patterns: [/planet[\s-]?sport/i, /planetsport/i] },
  { id: "teamtalk", label: "TEAMtalk", patterns: [/teamtalk/i] },
  { id: "livescore", label: "LiveScore", patterns: [/livescore/i] },
];

function isDirectVideoRecordingRel(rel: string): boolean {
  const base = rel.split("/").pop() ?? "";
  return /^camera-record\.(webm|mp4)$/i.test(base);
}

function libraryDisplayTitle(m: ManifestEntry): string {
  const t = m.seoTitle?.trim();
  if (t) return t;
  return m.id.replace(/-/g, " ");
}

type Props = {
  manifest: ManifestEntry[];
  videos: string[];
  /** Rel paths like `uploads/{contentId}/custom-bg.mp4` (Runway / editor backdrop). */
  backdropVideos: string[];
  /** Background stills: `images/library/{contentId}/custom-bg…` */
  libraryBackgroundImages: string[];
  /** Saved mic takes: `audio/{contentId}-voice-record.webm` */
  voiceRecordings: string[];
  audioStudioMedia: Array<{
    id: string;
    title: string;
    projectId: string;
    source: string;
    relPath: string;
    mimeType: string;
    createdAt: string;
  }>;
  podcastAudios: Array<{
    projectId: string;
    title: string;
    outputAudioRel: string;
    updatedAt: string;
    sourceUrl?: string;
  }>;
  libraryMetadataByContentId: Record<string, { title?: string; sourceUrl?: string; keywords?: string[] }>;
};

function mergedManifestKeywords(
  m: ManifestEntry,
  libraryMetadataByContentId: Props["libraryMetadataByContentId"],
): string[] | undefined {
  const meta = libraryMetadataByContentId[m.id];
  const merged = [...(m.keywords ?? []), ...(meta?.keywords ?? [])];
  return merged.length ? merged : undefined;
}

type LibraryTab = "builds" | "backgroundVideo" | "libraryImages" | "voiceRecordings" | "podcasts";

type LibraryBrandOption = { id: string; label: string };
type LibraryLanguageOption = { id: "all" | LanguageCode; label: string };

function toSearchPool(values: Array<string | null | undefined>): string {
  return values
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function inferSiteBrandTags(values: Array<string | null | undefined>): string[] {
  const joined = values.filter(Boolean).join(" ");
  const out = new Set<string>();
  for (const rule of BRAND_RULES) {
    if (rule.patterns.some((rx) => rx.test(joined))) out.add(rule.id);
  }
  for (const raw of values) {
    if (!raw) continue;
    try {
      const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
      if (!host) continue;
      if (host.includes("football365")) out.add("football365");
      else if (host.includes("racing365")) out.add("racing365");
      else if (host.includes("planetsport")) out.add("planetsport");
      else if (host.includes("teamtalk")) out.add("teamtalk");
      else if (host.includes("livescore")) out.add("livescore");
      else out.add(`site:${host}`);
    } catch {
      // Not a URL string; ignore.
    }
  }
  return [...out];
}

function inferLanguageTags(values: Array<string | null | undefined>): LanguageCode[] {
  const joined = values.filter(Boolean).join(" ");
  const out = new Set<LanguageCode>();
  const fromKeyword = /(?:^|\s|,)language:([a-z]{2}|zh)(?:\s|,|$)/gi;
  let match = fromKeyword.exec(joined);
  while (match) {
    const code = match[1] as LanguageCode;
    if (code in LANGUAGE_LABELS) out.add(code);
    match = fromKeyword.exec(joined);
  }
  const fromLanguageFolder = /images\/library\/language-[^/]+-([a-z]{2}|zh)\//gi;
  match = fromLanguageFolder.exec(joined);
  while (match) {
    const code = match[1] as LanguageCode;
    if (code in LANGUAGE_LABELS) out.add(code);
    match = fromLanguageFolder.exec(joined);
  }
  for (const [code, label] of Object.entries(LANGUAGE_LABELS) as Array<[LanguageCode, string]>) {
    if (new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i").test(joined)) out.add(code);
  }
  return [...out];
}

function brandLabel(tag: string): string {
  const hit = BRAND_RULES.find((b) => b.id === tag);
  if (hit) return hit.label;
  if (tag.startsWith("site:")) return tag.slice(5);
  return tag;
}

export function LibraryClient({
  manifest,
  videos,
  backdropVideos,
  libraryBackgroundImages,
  voiceRecordings,
  audioStudioMedia,
  podcastAudios,
  libraryMetadataByContentId,
}: Props) {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [tab, setTab] = useState<LibraryTab>("builds");
  const [query, setQuery] = useState("");
  const [siteBrandFilter, setSiteBrandFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState<"all" | LanguageCode>("all");
  const [libraryImagesLayout, setLibraryImagesLayout] = useState<"grid" | "list">("grid");
  const [libraryImageDetailRel, setLibraryImageDetailRel] = useState<string | null>(null);
  const router = useRouter();
  const [libraryImagesWriteToken, setLibraryImagesWriteToken] = useState("");
  const [libraryImagesAdminRequired, setLibraryImagesAdminRequired] = useState(false);
  const [libraryImagesMutateBusy, setLibraryImagesMutateBusy] = useState(false);
  const [libraryImagesMutateMsg, setLibraryImagesMutateMsg] = useState<string | null>(null);
  const [videosDedupeBusy, setVideosDedupeBusy] = useState(false);
  const [videosDedupeMsg, setVideosDedupeMsg] = useState<string | null>(null);
  const [buildsLayout, setBuildsLayout] = useState<"grid" | "list">("grid");
  const [backdropLayout, setBackdropLayout] = useState<"grid" | "list">("grid");
  const [voiceLayout, setVoiceLayout] = useState<"grid" | "list">("grid");
  const [podcastsLayout, setPodcastsLayout] = useState<"grid" | "list">("grid");
  const [buildManifestDetailKey, setBuildManifestDetailKey] = useState<string | null>(null);
  const [videoScanDetailRel, setVideoScanDetailRel] = useState<string | null>(null);
  const [backdropDetail, setBackdropDetail] = useState<{ rel: string; variant: "direct" | "runway" } | null>(null);
  const [voiceDetail, setVoiceDetail] = useState<
    { kind: "studio"; id: string } | { kind: "recording"; rel: string } | null
  >(null);
  const [podcastDetailKey, setPodcastDetailKey] = useState<string | null>(null);

  const [buildsManifestPage, setBuildsManifestPage] = useState(1);
  const [buildsVideosPage, setBuildsVideosPage] = useState(1);
  const [bgDirectPage, setBgDirectPage] = useState(1);
  const [bgImportedPage, setBgImportedPage] = useState(1);
  const [libraryImagesPage, setLibraryImagesPage] = useState(1);
  const [voiceStudioPage, setVoiceStudioPage] = useState(1);
  const [voiceRecPage, setVoiceRecPage] = useState(1);
  const [podcastsPage, setPodcastsPage] = useState(1);

  const [selectedBuildKeys, setSelectedBuildKeys] = useState<Set<string>>(() => new Set());
  const [selectedVideoRels, setSelectedVideoRels] = useState<Set<string>>(() => new Set());
  const [selectedBackdropRels, setSelectedBackdropRels] = useState<Set<string>>(() => new Set());
  const [selectedImageRels, setSelectedImageRels] = useState<Set<string>>(() => new Set());
  const [selectedVoiceStudioIds, setSelectedVoiceStudioIds] = useState<Set<string>>(() => new Set());
  const [selectedVoiceRecRels, setSelectedVoiceRecRels] = useState<Set<string>>(() => new Set());
  const [selectedPodcastProjectIds, setSelectedPodcastProjectIds] = useState<Set<string>>(() => new Set());

  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeleteMsg, setBulkDeleteMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (
      t === "builds" ||
      t === "backgroundVideo" ||
      t === "libraryImages" ||
      t === "voiceRecordings" ||
      t === "podcasts"
    ) {
      setTab(t);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "libraryImages" && tab !== "builds") return;
    void fetch(studioApiPath("/api/admin/settings"))
      .then((r) => r.json())
      .then((d: { adminTokenRequired?: boolean }) => setLibraryImagesAdminRequired(Boolean(d.adminTokenRequired)))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    setBulkDeleteMsg(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== "libraryImages") setLibraryImagesMutateMsg(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== "builds") setVideosDedupeMsg(null);
  }, [tab]);

  const needle = query.trim().toLowerCase();

  const brandOptions = (() => {
    const tags = new Set<string>();
    for (const m of manifest) {
      const meta = libraryMetadataByContentId[m.id];
      inferSiteBrandTags([m.id, m.seoTitle, ...(m.keywords ?? []), meta?.title, meta?.sourceUrl, ...(meta?.keywords ?? [])]).forEach((t) =>
        tags.add(t),
      );
    }
    for (const rel of videos) {
      const cid = contentIdFromVideoFilename(rel) ?? "";
      const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
      const meta = cid ? libraryMetadataByContentId[cid] : undefined;
      inferSiteBrandTags([rel, cid, entry?.seoTitle, ...(entry?.keywords ?? []), meta?.title, meta?.sourceUrl, ...(meta?.keywords ?? [])]).forEach((t) =>
        tags.add(t),
      );
    }
    for (const rel of backdropVideos) {
      const cid = contentIdFromUploadsBackdropVideoRel(rel) ?? "";
      const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
      const meta = cid ? libraryMetadataByContentId[cid] : undefined;
      inferSiteBrandTags([rel, cid, entry?.seoTitle, ...(entry?.keywords ?? []), meta?.title, meta?.sourceUrl, ...(meta?.keywords ?? [])]).forEach((t) =>
        tags.add(t),
      );
    }
    for (const rel of libraryBackgroundImages) {
      const cid = contentIdFromAnyBackgroundImageRel(rel) ?? "";
      const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
      const meta = cid ? libraryMetadataByContentId[cid] : undefined;
      inferSiteBrandTags([rel, cid, entry?.seoTitle, ...(entry?.keywords ?? []), meta?.title, meta?.sourceUrl, ...(meta?.keywords ?? [])]).forEach((t) =>
        tags.add(t),
      );
    }
    for (const rel of voiceRecordings) {
      const cid = contentIdFromVoiceRecordingRel(rel) ?? "";
      const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
      const meta = cid ? libraryMetadataByContentId[cid] : undefined;
      inferSiteBrandTags([rel, cid, entry?.seoTitle, ...(entry?.keywords ?? []), meta?.title, meta?.sourceUrl, ...(meta?.keywords ?? [])]).forEach((t) =>
        tags.add(t),
      );
    }
    for (const audio of audioStudioMedia) {
      inferSiteBrandTags([audio.projectId, audio.title, audio.source, audio.relPath, "audio studio"]).forEach((t) => tags.add(t));
    }
    for (const pod of podcastAudios) {
      inferSiteBrandTags([pod.projectId, pod.title, pod.outputAudioRel, pod.sourceUrl]).forEach((t) => tags.add(t));
    }
    const options: LibraryBrandOption[] = [...tags]
      .sort((a, b) => brandLabel(a).localeCompare(brandLabel(b)))
      .map((tag) => ({ id: tag, label: brandLabel(tag) }));
    return [{ id: "all", label: "All sites / brands" }, ...options];
  })();

  const hasBrand = (values: Array<string | null | undefined>) => {
    if (siteBrandFilter === "all") return true;
    return inferSiteBrandTags(values).includes(siteBrandFilter);
  };
  const languageOptions: LibraryLanguageOption[] = [
    { id: "all", label: "All languages" },
    ...(Object.entries(LANGUAGE_LABELS) as Array<[LanguageCode, string]>).map(([id, label]) => ({ id, label })),
  ];
  const hasLanguage = (values: Array<string | null | undefined>) => {
    if (languageFilter === "all") return true;
    return inferLanguageTags(values).includes(languageFilter);
  };

  const manifestFiltered = manifest.filter((m) => {
    const meta = libraryMetadataByContentId[m.id];
    const values = [m.id, m.seoTitle, ...(m.keywords ?? []), ...(meta?.keywords ?? []), meta?.title, meta?.sourceUrl];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });
  const videosFiltered = videos.filter((v) => {
    const cid = contentIdFromVideoFilename(v);
    const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
    const meta = cid ? libraryMetadataByContentId[cid] : undefined;
    const values = [v, cid ?? "", entry?.seoTitle, ...(entry?.keywords ?? []), ...(meta?.keywords ?? []), meta?.title, meta?.sourceUrl];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });
  const backdropsFiltered = backdropVideos.filter((rel) => {
    const cid = contentIdFromUploadsBackdropVideoRel(rel) ?? "";
    const entry = manifest.find((m) => m.id === cid);
    const meta = cid ? libraryMetadataByContentId[cid] : undefined;
    const values = [
      rel,
      cid,
      isDirectVideoRecordingRel(rel) ? "direct videos camera recording news shorts" : "",
      entry?.seoTitle,
      ...(entry?.keywords ?? []),
      ...(meta?.keywords ?? []),
      meta?.title,
      meta?.sourceUrl,
    ];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });
  const directVideosFiltered = backdropsFiltered.filter((rel) => isDirectVideoRecordingRel(rel));
  const importedBackdropVideosFiltered = backdropsFiltered.filter((rel) => !isDirectVideoRecordingRel(rel));
  const imagesFiltered = libraryBackgroundImages
    .filter((rel) => {
      const n = rel.replace(/\\/g, "/");
      const cid = contentIdFromAnyBackgroundImageRel(rel) ?? "";
      const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
      const meta = cid ? libraryMetadataByContentId[cid] : undefined;
      const values = [rel, cid, entry?.seoTitle, ...(entry?.keywords ?? []), ...(meta?.keywords ?? []), meta?.title, meta?.sourceUrl];
      const brandTags = inferSiteBrandTags(values);
      const langTags = inferLanguageTags(values);
      /** Paths like OpenAI/Higgsfield exports often have no brand/language metadata but still belong in the library. */
      const genericLibraryImage =
        n.startsWith("images/library/") && brandTags.length === 0 && langTags.length === 0;
      const brandOk = hasBrand(values) || genericLibraryImage;
      const langOk = hasLanguage(values) || genericLibraryImage;
      if (!brandOk || !langOk) return false;
      if (!needle) return true;
      return toSearchPool(values).includes(needle);
    })
    .sort((a, b) => libraryBackgroundImages.indexOf(a) - libraryBackgroundImages.indexOf(b));

  const voiceRecordingsFiltered = voiceRecordings.filter((rel) => {
    const cid = contentIdFromVoiceRecordingRel(rel) ?? "";
    const entry = manifest.find((m) => m.id === cid);
    const meta = cid ? libraryMetadataByContentId[cid] : undefined;
    const values = [
      rel,
      cid,
      "voice recording",
      "voice",
      "audio",
      "news shorts",
      entry?.seoTitle,
      ...(entry?.keywords ?? []),
      ...(meta?.keywords ?? []),
      meta?.title,
      meta?.sourceUrl,
    ];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });
  const audioStudioMediaFiltered = audioStudioMedia.filter((audio) => {
    const values = [
      audio.id,
      audio.projectId,
      audio.title,
      audio.source,
      audio.relPath,
      audio.mimeType,
      "audio studio",
      "voice notes",
      "voice recording",
      "audio",
    ];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });
  const podcastAudiosFiltered = podcastAudios.filter((pod) => {
    const values = [
      pod.projectId,
      pod.title,
      pod.outputAudioRel,
      pod.sourceUrl,
      "podcast",
      "podcast template",
      "audio",
    ];
    if (!hasBrand(values)) return false;
    if (!hasLanguage(values)) return false;
    if (!needle) return true;
    return toSearchPool(values).includes(needle);
  });

  useEffect(() => {
    setBuildsManifestPage(1);
    setBuildsVideosPage(1);
    setBgDirectPage(1);
    setBgImportedPage(1);
    setLibraryImagesPage(1);
    setVoiceStudioPage(1);
    setVoiceRecPage(1);
    setPodcastsPage(1);
    setSelectedBuildKeys(new Set());
    setSelectedVideoRels(new Set());
    setSelectedBackdropRels(new Set());
    setSelectedImageRels(new Set());
    setSelectedVoiceStudioIds(new Set());
    setSelectedVoiceRecRels(new Set());
    setSelectedPodcastProjectIds(new Set());
    setBulkDeleteMsg(null);
  }, [needle, siteBrandFilter, languageFilter]);

  const manifestPageData = useMemo(
    () => paginateSlice(manifestFiltered, buildsManifestPage, LIBRARY_PAGE_SIZE),
    [manifestFiltered, buildsManifestPage],
  );
  const videosPageData = useMemo(
    () => paginateSlice(videosFiltered, buildsVideosPage, LIBRARY_PAGE_SIZE),
    [videosFiltered, buildsVideosPage],
  );
  const directVideosPageData = useMemo(
    () => paginateSlice(directVideosFiltered, bgDirectPage, LIBRARY_PAGE_SIZE),
    [directVideosFiltered, bgDirectPage],
  );
  const importedBackdropPageData = useMemo(
    () => paginateSlice(importedBackdropVideosFiltered, bgImportedPage, LIBRARY_PAGE_SIZE),
    [importedBackdropVideosFiltered, bgImportedPage],
  );
  const imagesPageData = useMemo(
    () => paginateSlice(imagesFiltered, libraryImagesPage, LIBRARY_PAGE_SIZE),
    [imagesFiltered, libraryImagesPage],
  );
  const audioStudioPageData = useMemo(
    () => paginateSlice(audioStudioMediaFiltered, voiceStudioPage, LIBRARY_PAGE_SIZE),
    [audioStudioMediaFiltered, voiceStudioPage],
  );
  const voiceRecPageData = useMemo(
    () => paginateSlice(voiceRecordingsFiltered, voiceRecPage, LIBRARY_PAGE_SIZE),
    [voiceRecordingsFiltered, voiceRecPage],
  );
  const podcastsPageData = useMemo(
    () => paginateSlice(podcastAudiosFiltered, podcastsPage, LIBRARY_PAGE_SIZE),
    [podcastAudiosFiltered, podcastsPage],
  );

  useEffect(() => {
    setLibraryImageDetailRel(null);
    setBuildManifestDetailKey(null);
    setVideoScanDetailRel(null);
    setBackdropDetail(null);
    setVoiceDetail(null);
    setPodcastDetailKey(null);
  }, [tab]);

  useEffect(() => {
    if (libraryImageDetailRel && !imagesFiltered.includes(libraryImageDetailRel)) {
      setLibraryImageDetailRel(null);
    }
  }, [imagesFiltered, libraryImageDetailRel]);

  useEffect(() => {
    if (buildManifestDetailKey && !manifestFiltered.some((m) => `${m.id}-${m.createdAt}` === buildManifestDetailKey)) {
      setBuildManifestDetailKey(null);
    }
  }, [manifestFiltered, buildManifestDetailKey]);

  useEffect(() => {
    if (videoScanDetailRel && !videosFiltered.includes(videoScanDetailRel)) {
      setVideoScanDetailRel(null);
    }
  }, [videosFiltered, videoScanDetailRel]);

  useEffect(() => {
    if (backdropDetail && !backdropsFiltered.includes(backdropDetail.rel)) {
      setBackdropDetail(null);
    }
  }, [backdropsFiltered, backdropDetail]);

  useEffect(() => {
    if (!voiceDetail) return;
    if (voiceDetail.kind === "studio") {
      if (!audioStudioMediaFiltered.some((a) => a.id === voiceDetail.id)) {
        setVoiceDetail(null);
      }
    } else if (!voiceRecordingsFiltered.includes(voiceDetail.rel)) {
      setVoiceDetail(null);
    }
  }, [audioStudioMediaFiltered, voiceRecordingsFiltered, voiceDetail]);

  useEffect(() => {
    if (
      podcastDetailKey &&
      !podcastAudiosFiltered.some((p) => `${p.projectId}-${p.outputAudioRel}` === podcastDetailKey)
    ) {
      setPodcastDetailKey(null);
    }
  }, [podcastAudiosFiltered, podcastDetailKey]);

  const runLibraryImagesDedupe = async () => {
    setLibraryImagesMutateMsg(null);
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setLibraryImagesMutateMsg("Enter your admin token first.");
      return;
    }
    const n = imagesFiltered.length;
    if (
      !confirm(
        `Scan ${n} images (current filters) for identical files?\n\nUses SHA-256 of file contents. For each duplicate set, the newest file is kept and older copies are deleted.`,
      )
    ) {
      return;
    }
    setLibraryImagesMutateBusy(true);
    try {
      const tok = libraryImagesWriteToken.trim();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch(studioApiPath("/api/library/images/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "removeDuplicates",
          rels: imagesFiltered,
          adminToken: tok || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedCount?: number;
        duplicateGroups?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setLibraryImagesMutateMsg(
        `Removed ${data.deletedCount ?? 0} duplicate file(s) across ${data.duplicateGroups ?? 0} identical group(s).`,
      );
      router.refresh();
    } catch (e) {
      setLibraryImagesMutateMsg(e instanceof Error ? e.message : "Duplicate removal failed.");
    } finally {
      setLibraryImagesMutateBusy(false);
    }
  };

  const runLibraryImagesDeleteAllShown = async () => {
    setLibraryImagesMutateMsg(null);
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setLibraryImagesMutateMsg("Enter your admin token first.");
      return;
    }
    const n = imagesFiltered.length;
    if (!n) return;
    if (!confirm(`Permanently delete ALL ${n} library images matching current filters?\n\nThis cannot be undone.`)) {
      return;
    }
    if (
      !confirm(
        `Final confirmation: delete ${n} image files from storage?\n\nManifest rows are not removed automatically.`,
      )
    ) {
      return;
    }
    setLibraryImagesMutateBusy(true);
    try {
      const tok = libraryImagesWriteToken.trim();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch(studioApiPath("/api/library/images/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "deleteMany",
          rels: imagesFiltered,
          adminToken: tok || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedCount?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setLibraryImagesMutateMsg(`Deleted ${data.deletedCount ?? n} file(s).`);
      setLibraryImageDetailRel(null);
      router.refresh();
    } catch (e) {
      setLibraryImagesMutateMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setLibraryImagesMutateBusy(false);
    }
  };

  const runLibraryVideosRemoveDuplicates = async () => {
    setVideosDedupeMsg(null);
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setVideosDedupeMsg("Enter your admin token first.");
      return;
    }
    if (
      !confirm(
        `Scan all library video files on disk for identical content?\n\nIncludes files under output/video/*.mp4 plus backdrop clips under output/uploads/ (custom-bg.mp4 and camera-record.*).\n\nUses SHA-256 of file bytes. For each duplicate set, the newest file is kept and older copies are deleted.\n\nManifest paths are not updated automatically — rebuild or edit the manifest if a build stops loading.`,
      )
    ) {
      return;
    }
    setVideosDedupeBusy(true);
    try {
      const tok = libraryImagesWriteToken.trim();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tok) headers["x-admin-token"] = tok;
      const res = await fetch(studioApiPath("/api/library/videos/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "removeDuplicates",
          adminToken: tok || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedCount?: number;
        duplicateGroups?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setVideosDedupeMsg(
        `Removed ${data.deletedCount ?? 0} duplicate file(s) across ${data.duplicateGroups ?? 0} identical group(s).`,
      );
      router.refresh();
    } catch (e) {
      setVideosDedupeMsg(e instanceof Error ? e.message : "Duplicate removal failed.");
    } finally {
      setVideosDedupeBusy(false);
    }
  };

  const adminHeaders = (): { headers: Record<string, string>; tok: string } => {
    const tok = libraryImagesWriteToken.trim();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (tok) headers["x-admin-token"] = tok;
    return { headers, tok };
  };

  const runBulkDeleteManifestBuilds = async () => {
    const keys = [...selectedBuildKeys];
    if (keys.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    if (
      !confirm(
        `Delete ${keys.length} manifest entr(y/ies)? On-disk files are removed only when no other row shares the same content id.`,
      )
    ) {
      return;
    }
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      for (const entryKey of keys) {
        const m = manifest.find((x) => `${x.id}-${x.createdAt}` === entryKey);
        if (!m) continue;
        const res = await fetch(studioApiPath("/api/assets/delete"), {
          method: "POST",
          headers,
          body: JSON.stringify({ contentId: m.id, createdAt: m.createdAt, adminToken: tok || undefined }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || `Failed on ${m.id}`);
      }
      setSelectedBuildKeys(new Set());
      setBuildManifestDetailKey(null);
      setBulkDeleteMsg(`Deleted ${keys.length} manifest entr(y/ies).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeleteVideoRels = async () => {
    const rels = [...selectedVideoRels];
    if (rels.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    if (
      !confirm(
        `Permanently delete ${rels.length} video file(s) from output/video/?\n\nManifest is not updated automatically.`,
      )
    ) {
      return;
    }
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      const res = await fetch(studioApiPath("/api/library/videos/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "deleteMany", rels, adminToken: tok || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedCount?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setSelectedVideoRels(new Set());
      setVideoScanDetailRel(null);
      setBulkDeleteMsg(`Deleted ${data.deletedCount ?? rels.length} file(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeleteBackdropVideos = async () => {
    const rels = [...selectedBackdropRels];
    if (rels.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    if (
      !confirm(
        `Permanently delete ${rels.length} backdrop / camera video file(s) from disk?\n\nManifest rows are not updated automatically.`,
      )
    ) {
      return;
    }
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      const res = await fetch(studioApiPath("/api/library/videos/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "deleteMany", rels, adminToken: tok || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedCount?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setSelectedBackdropRels(new Set());
      setBackdropDetail(null);
      setBulkDeleteMsg(`Deleted ${data.deletedCount ?? rels.length} file(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeleteLibraryImages = async () => {
    const rels = [...selectedImageRels];
    if (rels.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    if (!confirm(`Permanently delete ${rels.length} selected image file(s)?`)) return;
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      const res = await fetch(studioApiPath("/api/library/images/mutate"), {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "deleteMany", rels, adminToken: tok || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; deletedCount?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setSelectedImageRels(new Set());
      setLibraryImageDetailRel(null);
      setBulkDeleteMsg(`Deleted ${data.deletedCount ?? rels.length} file(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeleteVoiceStudio = async () => {
    const ids = [...selectedVoiceStudioIds];
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} Audio Studio clip(s) from the library? Associated store rows and files are deleted.`)) return;
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      for (const id of ids) {
        const res = await fetch(studioApiPath("/api/audio/files"), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || `Failed on ${id}`);
      }
      setSelectedVoiceStudioIds(new Set());
      setVoiceDetail(null);
      setBulkDeleteMsg(`Removed ${ids.length} studio clip(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeleteVoiceRecordings = async () => {
    const rels = [...selectedVoiceRecRels];
    if (rels.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    const cids = [...new Set(rels.map((r) => contentIdFromVoiceRecordingRel(r)).filter(Boolean))] as string[];
    if (
      !confirm(
        `Delete voice recording(s) for ${cids.length} content id(s)? This removes the whole content bundle (uploads, manifest rows, etc.) for each id — same as the detail drawer danger action.`,
      )
    ) {
      return;
    }
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      for (const contentId of cids) {
        const res = await fetch(studioApiPath("/api/assets/delete"), {
          method: "POST",
          headers,
          body: JSON.stringify({ contentId, adminToken: tok || undefined }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || `Failed on ${contentId}`);
      }
      setSelectedVoiceRecRels(new Set());
      setVoiceDetail(null);
      setBulkDeleteMsg(`Deleted assets for ${cids.length} content id(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const runBulkDeletePodcastOutputs = async () => {
    const projectIds = [...selectedPodcastProjectIds];
    if (projectIds.length === 0) return;
    if (libraryImagesAdminRequired && !libraryImagesWriteToken.trim()) {
      setBulkDeleteMsg("Enter your admin token first.");
      return;
    }
    if (!confirm(`Remove generated audio file(s) and clear output for ${projectIds.length} podcast project(s)?`)) return;
    setBulkDeleteBusy(true);
    setBulkDeleteMsg(null);
    try {
      const { headers, tok } = adminHeaders();
      const res = await fetch(studioApiPath("/api/library/podcasts/delete-output"), {
        method: "POST",
        headers,
        body: JSON.stringify({ projectIds, adminToken: tok || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; projectsUpdated?: number };
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setSelectedPodcastProjectIds(new Set());
      setPodcastDetailKey(null);
      setBulkDeleteMsg(`Updated ${data.projectsUpdated ?? projectIds.length} project(s).`);
      router.refresh();
    } catch (e) {
      setBulkDeleteMsg(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="library-tablist flex flex-wrap gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
        aria-label="Asset library sections"
      >
        <button
          type="button"
          role="tab"
          id="tab-builds"
          aria-selected={tab === "builds"}
          aria-controls="panel-builds"
          tabIndex={tab === "builds" ? 0 : -1}
          onClick={() => setTab("builds")}
          className="library-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Recent builds
          <span className="ml-2 tabular-nums text-xs font-normal opacity-80">({manifestFiltered.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-background-video"
          aria-selected={tab === "backgroundVideo"}
          aria-controls="panel-background-video"
          tabIndex={tab === "backgroundVideo" ? 0 : -1}
          onClick={() => setTab("backgroundVideo")}
          className="library-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Background video
          <span className="ml-2 tabular-nums text-xs font-normal opacity-80">({backdropsFiltered.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-library-images"
          aria-selected={tab === "libraryImages"}
          aria-controls="panel-library-images"
          tabIndex={tab === "libraryImages" ? 0 : -1}
          onClick={() => setTab("libraryImages")}
          className="library-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Library images
          <span className="ml-2 tabular-nums text-xs font-normal opacity-80">({imagesFiltered.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-voice-recordings"
          aria-selected={tab === "voiceRecordings"}
          aria-controls="panel-voice-recordings"
          tabIndex={tab === "voiceRecordings" ? 0 : -1}
          onClick={() => setTab("voiceRecordings")}
          className="library-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Voice recordings
          <span className="ml-2 tabular-nums text-xs font-normal opacity-80">({voiceRecordingsFiltered.length + audioStudioMediaFiltered.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-podcasts"
          aria-selected={tab === "podcasts"}
          aria-controls="panel-podcasts"
          tabIndex={tab === "podcasts" ? 0 : -1}
          onClick={() => setTab("podcasts")}
          className="library-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Podcasts
          <span className="ml-2 tabular-nums text-xs font-normal opacity-80">({podcastAudiosFiltered.length})</span>
        </button>
      </div>

      <div
        className="sticky top-0 z-20 flex flex-wrap items-end gap-3 border-b px-4 py-3 backdrop-blur-sm"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "color-mix(in srgb, var(--surface) 92%, transparent)",
        }}
      >
        {tab === "builds" ? (
          <LayoutToggle value={buildsLayout} onChange={setBuildsLayout} ariaLabel="Recent builds layout" />
        ) : tab === "backgroundVideo" ? (
          <LayoutToggle value={backdropLayout} onChange={setBackdropLayout} ariaLabel="Background video layout" />
        ) : tab === "libraryImages" ? (
          <LayoutToggle
            value={libraryImagesLayout}
            onChange={setLibraryImagesLayout}
            ariaLabel="Library images layout"
            label="Images layout"
          />
        ) : tab === "voiceRecordings" ? (
          <LayoutToggle value={voiceLayout} onChange={setVoiceLayout} ariaLabel="Voice recordings layout" />
        ) : tab === "podcasts" ? (
          <LayoutToggle value={podcastsLayout} onChange={setPodcastsLayout} ariaLabel="Podcasts layout" />
        ) : (
          <span className="hidden min-[520px]:block min-[520px]:w-0 min-[520px]:flex-1" aria-hidden />
        )}
        <label className="min-w-[10rem] flex-1 text-xs text-[color:var(--text-muted)]">
          Site / Brand
          <select
            value={siteBrandFilter}
            onChange={(e) => setSiteBrandFilter(e.target.value)}
            className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {brandOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[9rem] flex-1 text-xs text-[color:var(--text-muted)]">
          Language
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value as "all" | LanguageCode)}
            className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            {languageOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[min(100%,280px)] flex-[2] text-xs text-[color:var(--text-muted)]">
          Search library
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, content ID, keyword…"
            className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>

      <div className="space-y-6 p-4">
        {tab === "builds" && (
          <div id="panel-builds" role="tabpanel" aria-labelledby="tab-builds" className="relative space-y-6">
            {bulkDeleteMsg ? (
              <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {bulkDeleteMsg}
              </p>
            ) : null}
            <Panel title="Recent builds (manifest)">
              {manifestFiltered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">No renders yet — build a Short from the editor.</p>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                    <p className="max-w-xl text-xs text-[color:var(--text-secondary)]">
                      Tap a tile for previews, MP4/SRT downloads and delete. Heavy keywords stay in{" "}
                      <strong className="font-semibold text-[color:var(--text-primary)]">Details</strong>. Use checkboxes for
                      bulk delete ({LIBRARY_PAGE_SIZE} per page).
                    </p>
                    <p className="shrink-0 tabular-nums text-xs text-[color:var(--text-muted)]">
                      {manifestFiltered.length} build{manifestFiltered.length === 1 ? "" : "s"} total
                    </p>
                  </div>
                  <LibraryBulkSelectionBar
                    pageKeys={manifestPageData.slice.map((m) => `${m.id}-${m.createdAt}`)}
                    selected={selectedBuildKeys}
                    selectionCountTotal={selectedBuildKeys.size}
                    deleteBusy={bulkDeleteBusy}
                    deleteDisabled={libraryImagesAdminRequired && !libraryImagesWriteToken.trim()}
                    onToggleSelectAllOnPage={() => {
                      const keys = manifestPageData.slice.map((m) => `${m.id}-${m.createdAt}`);
                      setSelectedBuildKeys((prev) => {
                        const next = new Set(prev);
                        const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                        if (allOn) for (const k of keys) next.delete(k);
                        else for (const k of keys) next.add(k);
                        return next;
                      });
                    }}
                    onClearSelection={() => setSelectedBuildKeys(new Set())}
                    onDeleteSelected={() => void runBulkDeleteManifestBuilds()}
                  />
                  {buildsLayout === "grid" ? (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {manifestPageData.slice.map((m) => {
                        const entryKey = `${m.id}-${m.createdAt}`;
                        const digest = digestKeywords(mergedManifestKeywords(m, libraryMetadataByContentId));
                        return (
                          <li key={entryKey} className="library-card relative flex flex-col overflow-hidden p-0">
                            <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                              <input
                                type="checkbox"
                                checked={selectedBuildKeys.has(entryKey)}
                                onChange={() => {
                                  setSelectedBuildKeys((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(entryKey)) next.delete(entryKey);
                                    else next.add(entryKey);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                                aria-label={`Select build ${entryKey}`}
                              />
                            </label>
                            <button
                              type="button"
                              className="group relative aspect-[9/16] w-full overflow-hidden border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                              onClick={() => setBuildManifestDetailKey(entryKey)}
                            >
                              <video
                                src={fileUrl(m.editedVideo ?? m.video)}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <span className="sr-only">Open details for {libraryDisplayTitle(m)}</span>
                            </button>
                            <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                              <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-[color:var(--text-primary)]">
                                {libraryDisplayTitle(m)}
                              </p>
                              <p className="truncate font-mono text-[10px] text-[#eab308]" title={m.id}>
                                {m.id}
                              </p>
                              {m.editedVideo ? (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-[#eab308]">Edited cut</span>
                              ) : null}
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[10px] leading-snug text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="self-start pt-0.5 text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setBuildManifestDetailKey(entryKey)}
                              >
                                Details
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-3">
                      {manifestPageData.slice.map((m) => {
                        const entryKey = `${m.id}-${m.createdAt}`;
                        const digest = digestKeywords(mergedManifestKeywords(m, libraryMetadataByContentId));
                        return (
                          <li key={entryKey} className="library-card flex gap-3 p-3">
                            <div className="flex shrink-0 flex-col items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedBuildKeys.has(entryKey)}
                                onChange={() => {
                                  setSelectedBuildKeys((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(entryKey)) next.delete(entryKey);
                                    else next.add(entryKey);
                                    return next;
                                  });
                                }}
                                className="mt-1 h-4 w-4"
                                aria-label={`Select build ${entryKey}`}
                              />
                              <button
                                type="button"
                                className="library-media-chrome relative h-36 w-24 shrink-0 overflow-hidden rounded-lg border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                onClick={() => setBuildManifestDetailKey(entryKey)}
                              >
                                <video
                                  src={fileUrl(m.editedVideo ?? m.video)}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="h-full w-full object-cover"
                                />
                                <span className="sr-only">Open details for {libraryDisplayTitle(m)}</span>
                              </button>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div>
                                <h3 className="text-sm font-semibold leading-snug text-[color:var(--text-primary)]">{libraryDisplayTitle(m)}</h3>
                                <p className="mt-0.5 font-mono text-[11px] text-[#eab308]">{m.id}</p>
                                <p className="text-[11px] text-[color:var(--text-muted)]">
                                  {m.format} · {formatManifestSavedAt(m.createdAt)}
                                </p>
                                {m.editedVideo ? (
                                  <p className="mt-1 text-[10px] font-bold uppercase text-[#eab308]">Edited cut available</p>
                                ) : null}
                              </div>
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setBuildManifestDetailKey(entryKey)}
                              >
                                Details · downloads · delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-4">
                    <LibraryPaginationBar
                      activePage={manifestPageData.activePage}
                      pageCount={manifestPageData.pageCount}
                      total={manifestPageData.total}
                      pageSize={LIBRARY_PAGE_SIZE}
                      onPageChange={setBuildsManifestPage}
                      idPrefix="lib-manifest-builds"
                    />
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Video folder scan">
              <div className="library-card mb-3 p-3">
                <p className="mb-2 text-xs text-[color:var(--text-secondary)]">
                  Remove stale videos that no longer exist in the manifest.
                </p>
                <CleanOrphansButton />
              </div>
              <div className="library-card mb-3 p-3">
                <p className="mb-2 text-xs text-[color:var(--text-secondary)]">
                  <strong className="font-semibold text-[color:var(--text-primary)]">Remove duplicates</strong> scans{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">all</strong> library videos on disk —
                  everything under <code className="text-[color:var(--text-muted)]">output/video/</code> plus backdrop uploads (
                  <code className="text-[color:var(--text-muted)]">custom-bg.mp4</code>,{" "}
                  <code className="text-[color:var(--text-muted)]">camera-record.*</code>
                  ). Same rules as Library images: SHA-256 match, keep newest mtime per group.
                </p>
                {libraryImagesAdminRequired ? (
                  <label className="mb-3 block text-[11px] font-semibold uppercase text-[color:var(--text-muted)]">
                    Admin token
                    <input
                      type="password"
                      className="ui-input mt-1 w-full max-w-md px-3 py-2 text-sm placeholder:text-[color:var(--text-muted)]"
                      value={libraryImagesWriteToken}
                      onChange={(e) => setLibraryImagesWriteToken(e.target.value)}
                      placeholder="ADMIN_TOKEN from .env.local"
                      autoComplete="off"
                    />
                  </label>
                ) : null}
                <R365Button
                  type="button"
                  variant="ghost"
                  disabled={videosDedupeBusy}
                  onClick={() => void runLibraryVideosRemoveDuplicates()}
                >
                  {videosDedupeBusy ? "Working…" : "Remove duplicate videos"}
                </R365Button>
                {videosDedupeMsg ? <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{videosDedupeMsg}</p> : null}
              </div>
              {videosFiltered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">No MP4 files detected.</p>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--border)] pb-3">
                    <p className="text-xs text-[color:var(--text-secondary)]">
                      Raw files under <code className="text-[color:var(--text-muted)]">output/video/</code> — checkboxes delete files
                      only ({LIBRARY_PAGE_SIZE} per page); manifest is not updated.
                    </p>
                    <p className="tabular-nums text-xs text-[color:var(--text-muted)]">
                      {videosFiltered.length} file{videosFiltered.length === 1 ? "" : "s"} total
                    </p>
                  </div>
                  <LibraryBulkSelectionBar
                    pageKeys={videosPageData.slice}
                    selected={selectedVideoRels}
                    selectionCountTotal={selectedVideoRels.size}
                    deleteBusy={bulkDeleteBusy}
                    deleteDisabled={libraryImagesAdminRequired && !libraryImagesWriteToken.trim()}
                    onToggleSelectAllOnPage={() => {
                      const keys = videosPageData.slice;
                      setSelectedVideoRels((prev) => {
                        const next = new Set(prev);
                        const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                        if (allOn) for (const k of keys) next.delete(k);
                        else for (const k of keys) next.add(k);
                        return next;
                      });
                    }}
                    onClearSelection={() => setSelectedVideoRels(new Set())}
                    onDeleteSelected={() => void runBulkDeleteVideoRels()}
                  />
                  {buildsLayout === "grid" ? (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {videosPageData.slice.map((v) => {
                        const cid = contentIdFromVideoFilename(v);
                        const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                        const digest = digestKeywords(meta?.keywords);
                        const base = v.split("/").pop() ?? v;
                        return (
                          <li key={v} className="library-card relative flex flex-col overflow-hidden p-0">
                            <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                              <input
                                type="checkbox"
                                checked={selectedVideoRels.has(v)}
                                onChange={() => {
                                  setSelectedVideoRels((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(v)) next.delete(v);
                                    else next.add(v);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                                aria-label={`Select ${base}`}
                              />
                            </label>
                            <button
                              type="button"
                              className="group relative aspect-[9/16] w-full overflow-hidden border-0 bg-black/30 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                              onClick={() => setVideoScanDetailRel(v)}
                            >
                              <video
                                src={fileUrl(v)}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <span className="sr-only">Details for {base}</span>
                            </button>
                            <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                              <p className="truncate font-mono text-[10px] text-[#eab308]" title={cid ?? v}>
                                {cid ?? base}
                              </p>
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setVideoScanDetailRel(v)}
                              >
                                Details
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-3">
                      {videosPageData.slice.map((v) => {
                        const cid = contentIdFromVideoFilename(v);
                        const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                        const digest = digestKeywords(meta?.keywords);
                        const base = v.split("/").pop() ?? v;
                        return (
                          <li key={v} className="library-card flex gap-3 p-3">
                            <div className="flex shrink-0 flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                checked={selectedVideoRels.has(v)}
                                onChange={() => {
                                  setSelectedVideoRels((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(v)) next.delete(v);
                                    else next.add(v);
                                    return next;
                                  });
                                }}
                                className="mt-1 h-4 w-4"
                                aria-label={`Select ${base}`}
                              />
                              <button
                                type="button"
                                className="library-media-chrome relative h-28 w-20 shrink-0 overflow-hidden rounded-lg border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                onClick={() => setVideoScanDetailRel(v)}
                              >
                                <video src={fileUrl(v)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                <span className="sr-only">Details for {base}</span>
                              </button>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mono text-xs text-[#eab308]" title={cid ?? v}>
                                {cid ?? base}
                              </p>
                              <p className="mt-1 break-all text-[11px] text-[color:var(--text-muted)]">{v}</p>
                              {digest.tileCaption ? (
                                <p className="mt-2 line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="mt-2 text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setVideoScanDetailRel(v)}
                              >
                                Details · download · delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-4">
                    <LibraryPaginationBar
                      activePage={videosPageData.activePage}
                      pageCount={videosPageData.pageCount}
                      total={videosPageData.total}
                      pageSize={LIBRARY_PAGE_SIZE}
                      onPageChange={setBuildsVideosPage}
                      idPrefix="lib-video-scan"
                    />
                  </div>
                </>
              )}
            </Panel>

            {buildManifestDetailKey ? (
              (() => {
                const entry = manifestFiltered.find((x) => `${x.id}-${x.createdAt}` === buildManifestDetailKey);
                return entry ? (
                  <BuildManifestDetailDrawer
                    entry={entry}
                    libraryMetadataByContentId={libraryMetadataByContentId}
                    onClose={() => setBuildManifestDetailKey(null)}
                  />
                ) : null;
              })()
            ) : null}
            {videoScanDetailRel ? (
              <VideoFolderScanDetailDrawer
                videoRel={videoScanDetailRel}
                libraryMetadataByContentId={libraryMetadataByContentId}
                onClose={() => setVideoScanDetailRel(null)}
              />
            ) : null}
          </div>
        )}

        {tab === "backgroundVideo" && (
          <div id="panel-background-video" role="tabpanel" aria-labelledby="tab-background-video" className="relative space-y-8">
            {bulkDeleteMsg ? (
              <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {bulkDeleteMsg}
              </p>
            ) : null}
            <p className="text-xs text-[color:var(--text-secondary)]">
              To use a clip as the motion backdrop in News Shorts, choose{" "}
              <strong className="font-semibold text-[color:var(--text-primary)]">Use in News Shorts</strong> on a row — it
              opens the builder with that file selected.
            </p>
            {backdropsFiltered.length === 0 ? (
              <Panel title="Background video">
                <p className="text-sm text-[color:var(--text-muted)]">
                  No backdrop clips yet — generate one in the editor (Runway), save a{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">Video record</strong> in News Shorts
                  (<code className="text-[color:var(--text-secondary)]">camera-record.webm</code>, listed under{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">Direct videos</strong> below when
                  present), or place <code className="text-[color:var(--text-secondary)]">custom-bg.mp4</code> under{" "}
                  <code className="text-[color:var(--text-secondary)]">output/uploads/&lt;content-id&gt;/</code>.
                </p>
              </Panel>
            ) : null}

            {backdropsFiltered.length > 0 ? (
              <>
                <Panel title={`Direct videos (${directVideosFiltered.length})`}>
                  <p className="mb-3 text-xs text-[color:var(--text-secondary)]">
                    Clips saved from <strong className="font-semibold text-[color:var(--text-primary)]">News Shorts → Video Record</strong>{" "}
                    (<code className="text-[color:var(--text-secondary)]">camera-record.webm</code> /{" "}
                    <code className="text-[color:var(--text-secondary)]">camera-record.mp4</code>). Checkboxes delete files only (
                    {LIBRARY_PAGE_SIZE} per page).
                  </p>
                  {directVideosFiltered.length === 0 ? (
                    <p className="text-sm text-[color:var(--text-muted)]">No saved camera recordings yet.</p>
                  ) : (
                    <>
                      <LibraryBulkSelectionBar
                        pageKeys={directVideosPageData.slice}
                        selected={selectedBackdropRels}
                        selectionCountTotal={selectedBackdropRels.size}
                        deleteBusy={bulkDeleteBusy}
                        deleteDisabled={libraryImagesAdminRequired && !libraryImagesWriteToken.trim()}
                        onToggleSelectAllOnPage={() => {
                          const keys = directVideosPageData.slice;
                          setSelectedBackdropRels((prev) => {
                            const next = new Set(prev);
                            const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                            if (allOn) for (const k of keys) next.delete(k);
                            else for (const k of keys) next.add(k);
                            return next;
                          });
                        }}
                        onClearSelection={() => setSelectedBackdropRels(new Set())}
                        onDeleteSelected={() => void runBulkDeleteBackdropVideos()}
                      />
                      {backdropLayout === "grid" ? (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                          {directVideosPageData.slice.map((rel) => {
                            const cid = contentIdFromUploadsBackdropVideoRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card relative flex flex-col overflow-hidden p-0">
                                <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedBackdropRels.has(rel)}
                                    onChange={() => {
                                      setSelectedBackdropRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4"
                                    aria-label={`Select ${rel}`}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="group relative aspect-video w-full overflow-hidden border-0 bg-black/25 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                  onClick={() => setBackdropDetail({ rel, variant: "direct" })}
                                >
                                  <video
                                    src={fileUrl(rel)}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                  />
                                  <span className="sr-only">Open details for {cid ?? rel}</span>
                                </button>
                                <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                                  <p className="truncate font-mono text-[10px] text-[#eab308]" title={cid ?? rel}>
                                    {cid ?? rel.split("/").pop()}
                                  </p>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-x-2 gap-y-1 pt-0.5">
                                    <a
                                      href={newsShortsBackdropVideoHref(rel)}
                                      className="text-[11px] font-semibold text-[#86efac] hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Use in News Shorts
                                    </a>
                                    <button
                                      type="button"
                                      className="text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline"
                                      onClick={() => setBackdropDetail({ rel, variant: "direct" })}
                                    >
                                      Details
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <ul className="space-y-3">
                          {directVideosPageData.slice.map((rel) => {
                            const cid = contentIdFromUploadsBackdropVideoRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card flex gap-3 p-3">
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedBackdropRels.has(rel)}
                                    onChange={() => {
                                      setSelectedBackdropRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <button
                                    type="button"
                                    className="library-media-chrome relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                    onClick={() => setBackdropDetail({ rel, variant: "direct" })}
                                  >
                                    <video src={fileUrl(rel)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                    <span className="sr-only">Details</span>
                                  </button>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-xs text-[#eab308]">{cid ?? rel}</p>
                                      <p className="truncate text-[11px] text-[color:var(--text-muted)]">{rel}</p>
                                    </div>
                                    <a
                                      href={newsShortsBackdropVideoHref(rel)}
                                      className="shrink-0 rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-center text-xs font-semibold text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent-hover)]"
                                    >
                                      Use in News Shorts
                                    </a>
                                  </div>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setBackdropDetail({ rel, variant: "direct" })}
                                  >
                                    Details · download · delete
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-4">
                        <LibraryPaginationBar
                          activePage={directVideosPageData.activePage}
                          pageCount={directVideosPageData.pageCount}
                          total={directVideosPageData.total}
                          pageSize={LIBRARY_PAGE_SIZE}
                          onPageChange={setBgDirectPage}
                          idPrefix="lib-bg-direct"
                        />
                      </div>
                    </>
                  )}
                </Panel>

                <Panel title={`Background clips — Runway / upload (${importedBackdropVideosFiltered.length})`}>
                  <p className="mb-3 text-xs text-[color:var(--text-secondary)]">
                    Editor and Runway imports as <code className="text-[color:var(--text-secondary)]">custom-bg.mp4</code>. Bulk
                    delete uses the same selection bar as direct videos ({LIBRARY_PAGE_SIZE} per page).
                  </p>
                  {importedBackdropVideosFiltered.length === 0 ? (
                    <p className="text-sm text-[color:var(--text-muted)]">No Runway or uploaded backdrop MP4s yet.</p>
                  ) : (
                    <>
                      <LibraryBulkSelectionBar
                        pageKeys={importedBackdropPageData.slice}
                        selected={selectedBackdropRels}
                        selectionCountTotal={selectedBackdropRels.size}
                        deleteBusy={bulkDeleteBusy}
                        deleteDisabled={libraryImagesAdminRequired && !libraryImagesWriteToken.trim()}
                        onToggleSelectAllOnPage={() => {
                          const keys = importedBackdropPageData.slice;
                          setSelectedBackdropRels((prev) => {
                            const next = new Set(prev);
                            const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                            if (allOn) for (const k of keys) next.delete(k);
                            else for (const k of keys) next.add(k);
                            return next;
                          });
                        }}
                        onClearSelection={() => setSelectedBackdropRels(new Set())}
                        onDeleteSelected={() => void runBulkDeleteBackdropVideos()}
                      />
                      {backdropLayout === "grid" ? (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                          {importedBackdropPageData.slice.map((rel) => {
                            const cid = contentIdFromUploadsBackdropVideoRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card relative flex flex-col overflow-hidden p-0">
                                <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedBackdropRels.has(rel)}
                                    onChange={() => {
                                      setSelectedBackdropRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="group relative aspect-[9/16] w-full overflow-hidden border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                                  onClick={() => setBackdropDetail({ rel, variant: "runway" })}
                                >
                                  <video
                                    src={fileUrl(rel)}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                  />
                                  <span className="sr-only">Open details for {cid ?? rel}</span>
                                </button>
                                <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                                  <p className="truncate font-mono text-[10px] text-[#eab308]" title={cid ?? rel}>
                                    {cid ?? rel.split("/").pop()}
                                  </p>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-x-2 gap-y-1 pt-0.5">
                                    <a
                                      href={newsShortsBackdropVideoHref(rel)}
                                      className="text-[11px] font-semibold text-[#86efac] hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Use in News Shorts
                                    </a>
                                    <button
                                      type="button"
                                      className="text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline"
                                      onClick={() => setBackdropDetail({ rel, variant: "runway" })}
                                    >
                                      Details
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <ul className="space-y-3">
                          {importedBackdropPageData.slice.map((rel) => {
                            const cid = contentIdFromUploadsBackdropVideoRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card flex gap-3 p-3">
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedBackdropRels.has(rel)}
                                    onChange={() => {
                                      setSelectedBackdropRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <button
                                    type="button"
                                    className="library-media-chrome relative h-32 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                    onClick={() => setBackdropDetail({ rel, variant: "runway" })}
                                  >
                                    <video src={fileUrl(rel)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                    <span className="sr-only">Details</span>
                                  </button>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-xs text-[#eab308]">{cid ?? rel}</p>
                                      <p className="truncate text-[11px] text-[color:var(--text-muted)]">{rel}</p>
                                    </div>
                                    <a
                                      href={newsShortsBackdropVideoHref(rel)}
                                      className="shrink-0 rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-center text-xs font-semibold text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent-hover)]"
                                    >
                                      Use in News Shorts
                                    </a>
                                  </div>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setBackdropDetail({ rel, variant: "runway" })}
                                  >
                                    Details · download · delete
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-4">
                        <LibraryPaginationBar
                          activePage={importedBackdropPageData.activePage}
                          pageCount={importedBackdropPageData.pageCount}
                          total={importedBackdropPageData.total}
                          pageSize={LIBRARY_PAGE_SIZE}
                          onPageChange={setBgImportedPage}
                          idPrefix="lib-bg-imported"
                        />
                      </div>
                    </>
                  )}
                </Panel>
              </>
            ) : null}
            {backdropDetail ? (
              <BackdropVideoDetailDrawer
                rel={backdropDetail.rel}
                variant={backdropDetail.variant}
                manifest={manifest}
                libraryMetadataByContentId={libraryMetadataByContentId}
                onClose={() => setBackdropDetail(null)}
              />
            ) : null}
          </div>
        )}

        {tab === "libraryImages" && (
          <div id="panel-library-images" role="tabpanel" aria-labelledby="tab-library-images" className="relative">
            {bulkDeleteMsg ? (
              <p className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {bulkDeleteMsg}
              </p>
            ) : null}
            <Panel title="Add images" className="mb-6">
              <p className="text-xs text-[color:var(--text-secondary)]">
                <strong className="text-[color:var(--text-primary)]">Upload</strong> stills or use{" "}
                <strong className="text-[color:var(--text-primary)]">text-to-image</strong> (OpenAI, Higgsfield, Runway) under{" "}
                <Link href="/tools/asset-library" className="font-semibold text-[#86efac] underline hover:text-[#bbf7d0]">
                  Tools → Asset library
                </Link>
                . This tab stays focused on browsing and housekeeping.
              </p>
            </Panel>
            <Panel title="Library images (background stills)">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                <p className="max-w-xl text-xs text-[color:var(--text-secondary)]">
                  <strong className="font-semibold text-[color:var(--text-primary)]">Use in News Shorts</strong> on a tile or in the
                  detail panel opens the builder with that still. Large keyword blobs stay in{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">Details</strong> so grids stay scannable.
                </p>
                {imagesFiltered.length > 0 ? (
                  <p className="shrink-0 tabular-nums text-xs text-[color:var(--text-muted)]">
                    Showing {imagesFiltered.length} image{imagesFiltered.length === 1 ? "" : "s"} total · {LIBRARY_PAGE_SIZE} per page
                  </p>
                ) : null}
              </div>
              {imagesFiltered.length > 0 ? (
                <div className="mb-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="text-xs text-[color:var(--text-secondary)]">
                    <strong className="text-[color:var(--text-primary)]">Bulk actions</strong> use the{" "}
                    <strong className="text-[color:var(--text-primary)]">{imagesFiltered.length}</strong> images matching current filters.
                    Adjust search / brand / language to widen or narrow scope — clear filters to target the full library.
                  </p>
                  {libraryImagesAdminRequired ? (
                    <label className="mt-3 block text-[11px] font-semibold uppercase text-[color:var(--text-muted)]">
                      Admin token
                      <input
                        type="password"
                        className="ui-input mt-1 w-full max-w-md px-3 py-2 text-sm placeholder:text-[color:var(--text-muted)]"
                        value={libraryImagesWriteToken}
                        onChange={(e) => setLibraryImagesWriteToken(e.target.value)}
                        placeholder="ADMIN_TOKEN from .env.local"
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <R365Button
                      type="button"
                      variant="ghost"
                      disabled={libraryImagesMutateBusy}
                      onClick={() => void runLibraryImagesDedupe()}
                    >
                      {libraryImagesMutateBusy ? "Working…" : "Remove duplicates"}
                    </R365Button>
                    <R365Button
                      type="button"
                      variant="danger"
                      disabled={libraryImagesMutateBusy}
                      onClick={() => void runLibraryImagesDeleteAllShown()}
                    >
                      Delete all shown
                    </R365Button>
                  </div>
                  {libraryImagesMutateMsg ? (
                    <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{libraryImagesMutateMsg}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[color:var(--text-muted)]">
                    Duplicates: identical bytes (SHA-256); newest modified file wins per group. Deletes only image files, not manifest rows.
                    Use checkboxes below for <strong className="text-[color:var(--text-primary)]">delete selected</strong> (current page — expand selection across pages as needed).
                  </p>
                </div>
              ) : null}
              {imagesFiltered.length > 0 ? (
                <LibraryBulkSelectionBar
                  pageKeys={imagesPageData.slice}
                  selected={selectedImageRels}
                  selectionCountTotal={selectedImageRels.size}
                  deleteBusy={bulkDeleteBusy || libraryImagesMutateBusy}
                  deleteDisabled={libraryImagesAdminRequired && !libraryImagesWriteToken.trim()}
                  onToggleSelectAllOnPage={() => {
                    const keys = imagesPageData.slice;
                    setSelectedImageRels((prev) => {
                      const next = new Set(prev);
                      const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                      if (allOn) for (const k of keys) next.delete(k);
                      else for (const k of keys) next.add(k);
                      return next;
                    });
                  }}
                  onClearSelection={() => setSelectedImageRels(new Set())}
                  onDeleteSelected={() => void runBulkDeleteLibraryImages()}
                />
              ) : null}
              {imagesFiltered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">
                  No background images yet — upload a still in the editor under{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">Background (before render)</strong>{" "}
                  or <strong className="font-semibold text-[color:var(--text-primary)]">Background video</strong> →{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">Image</strong>. Files are stored
                  under{" "}
                  <code className="text-[color:var(--text-secondary)]">output/images/library/&lt;content-id&gt;/</code>.
                </p>
              ) : (
                <>
                  {libraryImagesLayout === "grid" ? (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {imagesPageData.slice.map((rel) => {
                        const cid = contentIdFromAnyBackgroundImageRel(rel);
                        const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                        const base = rel.split("/").pop() ?? rel;
                        const digest = digestKeywords(meta?.keywords);
                        const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
                        const titleLine = meta?.title?.trim() || entry?.seoTitle?.trim();
                        return (
                          <li key={rel} className="library-card relative flex flex-col overflow-hidden p-0">
                            <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                              <input
                                type="checkbox"
                                checked={selectedImageRels.has(rel)}
                                onChange={() => {
                                  setSelectedImageRels((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(rel)) next.delete(rel);
                                    else next.add(rel);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                              />
                            </label>
                            <button
                              type="button"
                              className="group relative aspect-square w-full overflow-hidden border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                              onClick={() => setLibraryImageDetailRel(rel)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fileUrl(rel)}
                                alt=""
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                              <span className="sr-only">Open details for {cid ?? base}</span>
                            </button>
                            <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                              <p className="truncate font-mono text-[10px] leading-tight text-[#eab308]" title={cid ?? rel}>
                                {cid ?? base}
                              </p>
                              {titleLine ? (
                                <p className="line-clamp-2 text-[11px] leading-snug text-[color:var(--text-secondary)]">{titleLine}</p>
                              ) : null}
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[10px] leading-snug text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <div className="flex flex-wrap gap-x-2 gap-y-1 pt-0.5">
                                <a
                                  href={newsShortsBackdropImageHref(rel)}
                                  className="text-[11px] font-semibold text-[#86efac] hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Use in News Shorts
                                </a>
                                <button
                                  type="button"
                                  className="text-[11px] text-[color:var(--accent)] underline-offset-2 hover:underline"
                                  onClick={() => setLibraryImageDetailRel(rel)}
                                >
                                  Details
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-3">
                      {imagesPageData.slice.map((rel) => {
                        const cid = contentIdFromAnyBackgroundImageRel(rel);
                        const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                        const base = rel.split("/").pop() ?? rel;
                        const digest = digestKeywords(meta?.keywords);
                        const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
                        const titleLine = meta?.title?.trim() || entry?.seoTitle?.trim();
                        return (
                          <li key={rel} className="library-card flex gap-3 p-3">
                            <div className="flex shrink-0 flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                checked={selectedImageRels.has(rel)}
                                onChange={() => {
                                  setSelectedImageRels((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(rel)) next.delete(rel);
                                    else next.add(rel);
                                    return next;
                                  });
                                }}
                                className="mt-1 h-4 w-4"
                              />
                              <button
                                type="button"
                                className="library-media-chrome relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                onClick={() => setLibraryImageDetailRel(rel)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fileUrl(rel)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                                <span className="sr-only">Open details for {cid ?? base}</span>
                              </button>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-xs text-[#eab308]" title={cid ?? rel}>
                                    {cid ?? base}
                                  </p>
                                  {titleLine ? (
                                    <p className="mt-0.5 line-clamp-2 text-sm font-medium text-[color:var(--text-primary)]">{titleLine}</p>
                                  ) : (
                                    <p className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">{base}</p>
                                  )}
                                </div>
                                <a
                                  href={newsShortsBackdropImageHref(rel)}
                                  className="shrink-0 rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-center text-xs font-semibold text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent-hover)]"
                                >
                                  Use in News Shorts
                                </a>
                              </div>
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                  onClick={() => setLibraryImageDetailRel(rel)}
                                >
                                  Details · download · delete
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-4">
                    <LibraryPaginationBar
                      activePage={imagesPageData.activePage}
                      pageCount={imagesPageData.pageCount}
                      total={imagesPageData.total}
                      pageSize={LIBRARY_PAGE_SIZE}
                      onPageChange={setLibraryImagesPage}
                      idPrefix="lib-images"
                    />
                  </div>
                </>
              )}
            </Panel>
            {libraryImageDetailRel ? (
              <LibraryImageDetailDrawer
                rel={libraryImageDetailRel}
                manifest={manifest}
                libraryMetadataByContentId={libraryMetadataByContentId}
                libraryWriteToken={libraryImagesWriteToken}
                libraryWriteTokenRequired={libraryImagesAdminRequired}
                onClose={() => setLibraryImageDetailRel(null)}
                onImageFileDeleted={() => {
                  router.refresh();
                  setLibraryImageDetailRel(null);
                }}
              />
            ) : null}
          </div>
        )}

        {tab === "voiceRecordings" && (
          <div id="panel-voice-recordings" role="tabpanel" aria-labelledby="tab-voice-recordings" className="relative">
            {bulkDeleteMsg ? (
              <p className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {bulkDeleteMsg}
              </p>
            ) : null}
            <Panel title="Voice recordings and Audio Studio">
              {voiceRecordingsFiltered.length === 0 && audioStudioMediaFiltered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">
                  No saved voice takes yet. Record in <strong className="font-semibold text-[color:var(--text-primary)]">Audio Studio</strong> or{" "}
                  <strong className="font-semibold text-[color:var(--text-primary)]">News Shorts → Voice Record</strong>, then save the recording.
                </p>
              ) : (
                <div className="space-y-10">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                    <p className="max-w-xl text-xs text-[color:var(--text-secondary)]">
                      <strong className="font-semibold text-[color:var(--text-primary)]">Audio Studio</strong> clips are listed first, then{" "}
                      <strong className="font-semibold text-[color:var(--text-primary)]">News Shorts</strong> mic saves. Keyword summaries stay compact on tiles — open{" "}
                      <strong className="font-semibold text-[color:var(--text-primary)]">Details</strong> for the full player, downloads, and delete where applicable.
                    </p>
                    <p className="shrink-0 tabular-nums text-xs text-[color:var(--text-muted)]">
                      {audioStudioMediaFiltered.length} studio · {voiceRecordingsFiltered.length} recording
                      {voiceRecordingsFiltered.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {audioStudioMediaFiltered.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
                        Audio Studio ({audioStudioMediaFiltered.length})
                      </h3>
                      <LibraryBulkSelectionBar
                        pageKeys={audioStudioPageData.slice.map((a) => a.id)}
                        selected={selectedVoiceStudioIds}
                        selectionCountTotal={selectedVoiceStudioIds.size}
                        deleteBusy={bulkDeleteBusy}
                        deleteDisabled={false}
                        onToggleSelectAllOnPage={() => {
                          const keys = audioStudioPageData.slice.map((a) => a.id);
                          setSelectedVoiceStudioIds((prev) => {
                            const next = new Set(prev);
                            const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                            if (allOn) for (const k of keys) next.delete(k);
                            else for (const k of keys) next.add(k);
                            return next;
                          });
                        }}
                        onClearSelection={() => setSelectedVoiceStudioIds(new Set())}
                        onDeleteSelected={() => void runBulkDeleteVoiceStudio()}
                      />
                      {voiceLayout === "grid" ? (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                          {audioStudioPageData.slice.map((audio) => {
                            const digest = digestKeywords(libraryMetadataByContentId[audio.projectId]?.keywords);
                            return (
                              <li key={audio.id} className="library-card relative flex flex-col overflow-hidden p-0">
                                <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedVoiceStudioIds.has(audio.id)}
                                    onChange={() => {
                                      setSelectedVoiceStudioIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(audio.id)) next.delete(audio.id);
                                        else next.add(audio.id);
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="group relative flex aspect-square w-full items-center justify-center overflow-hidden border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                                  onClick={() => setVoiceDetail({ kind: "studio", id: audio.id })}
                                >
                                  <span className="text-4xl opacity-55 transition-opacity group-hover:opacity-80" aria-hidden>
                                    🎙️
                                  </span>
                                  <span className="sr-only">Open details for {audio.title}</span>
                                </button>
                                <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                                  <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[color:var(--text-primary)]">{audio.title}</p>
                                  <p className="truncate font-mono text-[10px] text-[#eab308]" title={audio.projectId}>
                                    {audio.projectId}
                                  </p>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start pt-0.5 text-[11px] font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setVoiceDetail({ kind: "studio", id: audio.id })}
                                  >
                                    Details
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <ul className="space-y-3">
                          {audioStudioPageData.slice.map((audio) => {
                            const digest = digestKeywords(libraryMetadataByContentId[audio.projectId]?.keywords);
                            return (
                              <li key={audio.id} className="library-card flex gap-3 p-3">
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedVoiceStudioIds.has(audio.id)}
                                    onChange={() => {
                                      setSelectedVoiceStudioIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(audio.id)) next.delete(audio.id);
                                        else next.add(audio.id);
                                        return next;
                                      });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <button
                                    type="button"
                                    className="library-media-chrome relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                    onClick={() => setVoiceDetail({ kind: "studio", id: audio.id })}
                                  >
                                    <span className="text-3xl opacity-60" aria-hidden>
                                      🎙️
                                    </span>
                                    <span className="sr-only">Details</span>
                                  </button>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-semibold text-[color:var(--text-primary)]">{audio.title}</p>
                                    <p className="truncate font-mono text-xs text-[#eab308]">{audio.projectId}</p>
                                    <p className="truncate text-[11px] text-[color:var(--text-muted)]">{audio.relPath}</p>
                                  </div>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setVoiceDetail({ kind: "studio", id: audio.id })}
                                  >
                                    Details · download · open in new tab
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <LibraryPaginationBar
                        activePage={audioStudioPageData.activePage}
                        pageCount={audioStudioPageData.pageCount}
                        total={audioStudioPageData.total}
                        pageSize={LIBRARY_PAGE_SIZE}
                        onPageChange={setVoiceStudioPage}
                        idPrefix="lib-voice-studio"
                      />
                    </section>
                  ) : null}

                  {voiceRecordingsFiltered.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
                        News Shorts recordings ({voiceRecordingsFiltered.length})
                      </h3>
                      <LibraryBulkSelectionBar
                        pageKeys={[...new Set(voiceRecPageData.slice)]}
                        selected={selectedVoiceRecRels}
                        selectionCountTotal={selectedVoiceRecRels.size}
                        deleteBusy={bulkDeleteBusy}
                        deleteDisabled={false}
                        onToggleSelectAllOnPage={() => {
                          const keys = [...new Set(voiceRecPageData.slice)];
                          setSelectedVoiceRecRels((prev) => {
                            const next = new Set(prev);
                            const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                            if (allOn) for (const k of keys) next.delete(k);
                            else for (const k of keys) next.add(k);
                            return next;
                          });
                        }}
                        onClearSelection={() => setSelectedVoiceRecRels(new Set())}
                        onDeleteSelected={() => void runBulkDeleteVoiceRecordings()}
                      />
                      {voiceLayout === "grid" ? (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                          {voiceRecPageData.slice.map((rel) => {
                            const cid = contentIdFromVoiceRecordingRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
                            const base = rel.split("/").pop() ?? rel;
                            const title =
                              meta?.title?.trim() || entry?.seoTitle?.trim() || (cid ? `Voice · ${cid}` : base);
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card relative flex flex-col overflow-hidden p-0">
                                <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedVoiceRecRels.has(rel)}
                                    onChange={() => {
                                      setSelectedVoiceRecRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="group relative flex aspect-square w-full items-center justify-center overflow-hidden border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                                  onClick={() => setVoiceDetail({ kind: "recording", rel })}
                                >
                                  <span className="text-4xl opacity-55 transition-opacity group-hover:opacity-80" aria-hidden>
                                    🎤
                                  </span>
                                  <span className="sr-only">Open details for {title}</span>
                                </button>
                                <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                                  <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[color:var(--text-primary)]">{title}</p>
                                  <p className="truncate font-mono text-[10px] text-[#eab308]" title={cid ?? rel}>
                                    {cid ?? base}
                                  </p>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start pt-0.5 text-[11px] font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setVoiceDetail({ kind: "recording", rel })}
                                  >
                                    Details
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <ul className="space-y-3">
                          {voiceRecPageData.slice.map((rel) => {
                            const cid = contentIdFromVoiceRecordingRel(rel);
                            const meta = cid ? libraryMetadataByContentId[cid] : undefined;
                            const entry = cid ? manifest.find((m) => m.id === cid) : undefined;
                            const base = rel.split("/").pop() ?? rel;
                            const title =
                              meta?.title?.trim() || entry?.seoTitle?.trim() || (cid ? `Voice · ${cid}` : base);
                            const digest = digestKeywords(meta?.keywords);
                            return (
                              <li key={rel} className="library-card flex gap-3 p-3">
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedVoiceRecRels.has(rel)}
                                    onChange={() => {
                                      setSelectedVoiceRecRels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(rel)) next.delete(rel);
                                        else next.add(rel);
                                        return next;
                                      });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <button
                                    type="button"
                                    className="library-media-chrome relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                    onClick={() => setVoiceDetail({ kind: "recording", rel })}
                                  >
                                    <span className="text-3xl opacity-60" aria-hidden>
                                      🎤
                                    </span>
                                    <span className="sr-only">Details</span>
                                  </button>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-semibold text-[color:var(--text-primary)]">{title}</p>
                                    <p className="truncate font-mono text-xs text-[#eab308]">{cid ?? rel}</p>
                                    <p className="truncate text-[11px] text-[color:var(--text-muted)]">{rel}</p>
                                  </div>
                                  {digest.tileCaption ? (
                                    <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                    onClick={() => setVoiceDetail({ kind: "recording", rel })}
                                  >
                                    Details · download · delete
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <LibraryPaginationBar
                        activePage={voiceRecPageData.activePage}
                        pageCount={voiceRecPageData.pageCount}
                        total={voiceRecPageData.total}
                        pageSize={LIBRARY_PAGE_SIZE}
                        onPageChange={setVoiceRecPage}
                        idPrefix="lib-voice-rec"
                      />
                    </section>
                  ) : null}
                </div>
              )}
            </Panel>
            {voiceDetail?.kind === "studio" ? (
              (() => {
                const a = audioStudioMediaFiltered.find((x) => x.id === voiceDetail.id);
                return a ? <AudioStudioDetailDrawer audio={a} onClose={() => setVoiceDetail(null)} /> : null;
              })()
            ) : voiceDetail?.kind === "recording" ? (
              <VoiceRecordingDetailDrawer
                rel={voiceDetail.rel}
                manifest={manifest}
                libraryMetadataByContentId={libraryMetadataByContentId}
                onClose={() => setVoiceDetail(null)}
              />
            ) : null}
          </div>
        )}

        {tab === "podcasts" && (
          <div id="panel-podcasts" role="tabpanel" aria-labelledby="tab-podcasts" className="relative">
            {bulkDeleteMsg ? (
              <p className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {bulkDeleteMsg}
              </p>
            ) : null}
            <Panel title="Podcasts (Podcast Template)">
              {podcastAudiosFiltered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">
                  No generated podcast audio yet — create and generate from <strong className="font-semibold text-[color:var(--text-primary)]">Podcast Template</strong>.
                </p>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                    <p className="max-w-xl text-xs text-[color:var(--text-secondary)]">
                      Tiles stay lightweight — open <strong className="font-semibold text-[color:var(--text-primary)]">Details</strong> for the full episode player, paths, source URL, and downloads.
                    </p>
                    <p className="shrink-0 tabular-nums text-xs text-[color:var(--text-muted)]">
                      {podcastAudiosFiltered.length} episode{podcastAudiosFiltered.length === 1 ? "" : "s"} (filters)
                    </p>
                  </div>
                  <LibraryBulkSelectionBar
                    pageKeys={[...new Set(podcastsPageData.slice.map((p) => p.projectId))]}
                    selected={selectedPodcastProjectIds}
                    selectionCountTotal={selectedPodcastProjectIds.size}
                    deleteBusy={bulkDeleteBusy}
                    deleteDisabled={false}
                    onToggleSelectAllOnPage={() => {
                      const keys = [...new Set(podcastsPageData.slice.map((p) => p.projectId))];
                      setSelectedPodcastProjectIds((prev) => {
                        const next = new Set(prev);
                        const allOn = keys.length > 0 && keys.every((k) => next.has(k));
                        if (allOn) for (const k of keys) next.delete(k);
                        else for (const k of keys) next.add(k);
                        return next;
                      });
                    }}
                    onClearSelection={() => setSelectedPodcastProjectIds(new Set())}
                    onDeleteSelected={() => void runBulkDeletePodcastOutputs()}
                  />
                  {podcastsLayout === "grid" ? (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {podcastsPageData.slice.map((pod) => {
                        const compositeKey = `${pod.projectId}-${pod.outputAudioRel}`;
                        const digest = digestKeywords(libraryMetadataByContentId[pod.projectId]?.keywords);
                        return (
                          <li key={compositeKey} className="library-card relative flex flex-col overflow-hidden p-0">
                            <label className="absolute left-1 top-1 z-10 flex cursor-pointer items-center justify-center rounded bg-black/55 p-1 shadow-sm">
                              <input
                                type="checkbox"
                                checked={selectedPodcastProjectIds.has(pod.projectId)}
                                onChange={() => {
                                  setSelectedPodcastProjectIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(pod.projectId)) next.delete(pod.projectId);
                                    else next.add(pod.projectId);
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                              />
                            </label>
                            <button
                              type="button"
                              className="group relative flex aspect-square w-full items-center justify-center overflow-hidden border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-muted)]"
                              onClick={() => setPodcastDetailKey(compositeKey)}
                            >
                              <span className="text-4xl opacity-55 transition-opacity group-hover:opacity-80" aria-hidden>
                                🎧
                              </span>
                              <span className="sr-only">Open details for {pod.title}</span>
                            </button>
                            <div className="flex flex-col gap-1 border-t border-[color:var(--border)] p-2">
                              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[color:var(--text-primary)]">{pod.title}</p>
                              <p className="truncate font-mono text-[10px] text-[#eab308]" title={pod.projectId}>
                                {pod.projectId}
                              </p>
                              <p className="truncate text-[10px] text-[color:var(--text-muted)]" title={pod.outputAudioRel}>
                                {pod.outputAudioRel.split("/").pop()}
                              </p>
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[10px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="self-start pt-0.5 text-[11px] font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setPodcastDetailKey(compositeKey)}
                              >
                                Details
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-3">
                      {podcastsPageData.slice.map((pod) => {
                        const compositeKey = `${pod.projectId}-${pod.outputAudioRel}`;
                        const digest = digestKeywords(libraryMetadataByContentId[pod.projectId]?.keywords);
                        return (
                          <li key={compositeKey} className="library-card flex gap-3 p-3">
                            <div className="flex shrink-0 flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                checked={selectedPodcastProjectIds.has(pod.projectId)}
                                onChange={() => {
                                  setSelectedPodcastProjectIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(pod.projectId)) next.delete(pod.projectId);
                                    else next.add(pod.projectId);
                                    return next;
                                  });
                                }}
                                className="mt-1 h-4 w-4"
                              />
                              <button
                                type="button"
                                className="library-media-chrome relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-0 bg-gradient-to-br from-[color:var(--surface-muted)] to-black/30 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)]"
                                onClick={() => setPodcastDetailKey(compositeKey)}
                              >
                                <span className="text-3xl opacity-60" aria-hidden>
                                  🎧
                                </span>
                                <span className="sr-only">Details</span>
                              </button>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-semibold text-[color:var(--text-primary)]">{pod.title}</p>
                                <p className="truncate font-mono text-xs text-[#eab308]">{pod.projectId}</p>
                                <p className="truncate text-[11px] text-[color:var(--text-muted)]">{pod.outputAudioRel}</p>
                                <p className="text-[11px] text-[color:var(--text-muted)]">
                                  Updated {new Date(pod.updatedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                                </p>
                              </div>
                              {digest.tileCaption ? (
                                <p className="line-clamp-2 text-[11px] text-[color:var(--text-muted)]">{digest.tileCaption}</p>
                              ) : null}
                              <button
                                type="button"
                                className="self-start text-xs font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
                                onClick={() => setPodcastDetailKey(compositeKey)}
                              >
                                Details · download · open in new tab
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <LibraryPaginationBar
                    activePage={podcastsPageData.activePage}
                    pageCount={podcastsPageData.pageCount}
                    total={podcastsPageData.total}
                    pageSize={LIBRARY_PAGE_SIZE}
                    onPageChange={setPodcastsPage}
                    idPrefix="lib-podcasts"
                  />
                </>
              )}
            </Panel>
            {podcastDetailKey ? (
              (() => {
                const pod = podcastAudiosFiltered.find(
                  (p) => `${p.projectId}-${p.outputAudioRel}` === podcastDetailKey,
                );
                return pod ? <PodcastDetailDrawer pod={pod} onClose={() => setPodcastDetailKey(null)} /> : null;
              })()
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
