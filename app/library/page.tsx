import type { Metadata } from "next";
import { Suspense } from "react";
import path from "path";
import fs from "fs/promises";
import { LibraryClient } from "@/app/library/LibraryClient";
import { loadLibraryVideoCatalog } from "@/app/lib/library-video-catalog-load";
import { scanBackdropVideoRels } from "@/app/lib/scan-backdrop-videos";
import { scanLibraryBackgroundImageRels } from "@/app/lib/scan-library-background-images";
import { scanVoiceRecordingRels } from "@/app/lib/scan-voice-recordings";
import { BRAND_SHORTS, BRAND_SUITE, BRAND_TAGLINE } from "@/app/lib/brand";
import { readLibraryMetadataIndex } from "@/app/lib/library-metadata";
import { readAudioStudioStore } from "@/app/lib/audio-studio-store";
import { PODCAST_PROJECTS_FILE } from "@/lib/podcast-template/constants";
import type { PodcastProject } from "@/types/podcast-template";

type LibraryPodcastAudio = {
  projectId: string;
  title: string;
  outputAudioRel: string;
  updatedAt: string;
  sourceUrl?: string;
};

type LibraryAudioStudioMedia = {
  id: string;
  title: string;
  projectId: string;
  source: string;
  relPath: string;
  mimeType: string;
  createdAt: string;
};

export const metadata: Metadata = {
  title: `Video library | ${BRAND_SUITE}`,
  description: `Browse and download ${BRAND_SHORTS}: racing and football content with SEO-friendly names. ${BRAND_TAGLINE}`,
  openGraph: {
    title: `Video library | ${BRAND_SUITE}`,
    description: BRAND_TAGLINE,
  },
};

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const catalog = await loadLibraryVideoCatalog();
  const manifest = catalog.manifest;
  const videoRels = catalog.videos.map((item) => item.rel);

  const backdropVideos = await scanBackdropVideoRels();
  const libraryBackgroundImages = await scanLibraryBackgroundImageRels();
  const voiceRecordings = await scanVoiceRecordingRels();
  const libraryMetadataByContentId = await readLibraryMetadataIndex();
  let audioStudioMedia: LibraryAudioStudioMedia[] = [];
  try {
    const audioStore = await readAudioStudioStore();
    const files: LibraryAudioStudioMedia[] = audioStore.files.map((file) => ({
      id: file.id,
      title: file.title || file.originalName || file.name,
      projectId: file.projectId,
      source: file.source,
      relPath: file.relPath,
      mimeType: file.mimeType,
      createdAt: file.createdAt,
    }));
    const generated: LibraryAudioStudioMedia[] = audioStore.generatedAudio.map((audio) => ({
      id: audio.id,
      title: audio.title || `${audio.provider} generated audio`,
      projectId: audio.projectId,
      source: "generated",
      relPath: audio.relPath,
      mimeType: audio.mimeType,
      createdAt: audio.createdAt,
    }));
    audioStudioMedia = [...files, ...generated].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    audioStudioMedia = [];
  }
  let podcastAudios: LibraryPodcastAudio[] = [];
  try {
    const raw = await fs.readFile(path.join(process.cwd(), PODCAST_PROJECTS_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { projects?: Record<string, PodcastProject> };
    const projects = Object.values(parsed.projects ?? {});
    podcastAudios = projects
      .filter((p) => (p.outputAudioRel ?? "").trim().length > 0)
      .map((p) => ({
        projectId: p.id,
        title: (p.title || "Untitled podcast project").trim(),
        outputAudioRel: p.outputAudioRel!.trim(),
        updatedAt: p.updatedAt,
        sourceUrl: p.sourceUrl?.trim() || undefined,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    podcastAudios = [];
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border bg-[color:var(--surface)] p-6 shadow-[var(--shadow-card)] sm:p-8" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[color:var(--accent)]">Library</p>
        <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black tracking-tight text-[color:var(--text-primary)]">Asset library</h1>
            <p className="mt-4 text-lg leading-7 text-[color:var(--text-secondary)]">
              Browse recent builds, source media, background assets, voice recordings and podcast audio in one place.
              Use filters and tabs to find the output you need, then preview, download or clean up files.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[20rem]">
            <div className="rounded-2xl bg-[color:var(--surface-muted)] px-3 py-3">
              <p className="text-2xl font-black text-[color:var(--text-primary)]">{manifest.length}</p>
              <p className="mt-1 font-semibold text-[color:var(--text-muted)]">Builds</p>
            </div>
            <div className="rounded-2xl bg-[color:var(--surface-muted)] px-3 py-3">
              <p className="text-2xl font-black text-[color:var(--text-primary)]">{videoRels.length}</p>
              <p className="mt-1 font-semibold text-[color:var(--text-muted)]">Videos</p>
            </div>
            <div className="rounded-2xl bg-[color:var(--surface-muted)] px-3 py-3">
              <p className="text-2xl font-black text-[color:var(--text-primary)]">{libraryBackgroundImages.length}</p>
              <p className="mt-1 font-semibold text-[color:var(--text-muted)]">Images</p>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={<p className="text-sm text-[color:var(--text-muted)]">Loading library…</p>}>
        <LibraryClient
          manifest={manifest}
          videos={videoRels}
          backdropVideos={backdropVideos}
          libraryBackgroundImages={libraryBackgroundImages}
          voiceRecordings={voiceRecordings}
          audioStudioMedia={audioStudioMedia}
          podcastAudios={podcastAudios}
          libraryMetadataByContentId={libraryMetadataByContentId}
        />
      </Suspense>
    </div>
  );
}
