import fs from "fs/promises";
import path from "path";
import { renderSceneToPng, withSharedPuppeteerBrowser } from "@/app/features/render/scene-renderer";
import { normalizeVoiceProviderPreference, resolveVoiceTrackWithFallback } from "@/app/features/audio";
import { buildShortVideo } from "@/app/features/video/video-builder";
import { assertVoiceRecordingRel, normalizeContentIdForFilename } from "@/app/lib/editor-upload";
import { buildVideoSlug } from "@/app/lib/seo-slug";
import { outputDir, outputVideoDir } from "@/app/lib/paths";
import {
  generateSocialVideoSeo,
  type SocialVideoSeoInput,
  type SocialVideoSeoTemplate,
} from "@/app/lib/social-video-seo";
import type { VoiceGender } from "@/types";
import type {
  BackingMusicConfig,
  NewsShortTemplateData,
  VideoRecordCirclePosition,
  VideoRecordLayout,
} from "@/app/features/news-shorts/types";
import {
  motionBackdropRelLooksLikeCameraRecording,
  newsShortRenderedImageRef,
  resolveMotionBackdropRel,
  resolveOutputAudioSource,
} from "@/app/lib/news-shorts-build-sources";
import { buildShortFormEngineExport } from "@/app/features/news-shorts/short-form-engine";
import {
  normalizeCreativeVideoFormat,
  videoDimensionsForCreativeFormat,
} from "@/app/features/news-shorts/creative-video-format";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";
import { persistVideoOutputToBlob } from "@/app/lib/video-blob-assets";
import {
  highlightWordsForCaption,
  sceneSubtitleLineForBurn,
  splitScriptIntoSceneCaptions,
} from "@/app/lib/script-scene-captions";
import {
  clampMotionBackdropDimStrength,
  clampMotionBackdropOpaqueOpacity,
} from "@/app/lib/news-short-motion-layout";
import { mergeNewsShortStyleForBrand } from "@/app/features/news-shorts/news-shorts-brand-templates";
import {
  newsShortSceneDataForSlide,
  resolvedPanelTextColorForNewsShort,
} from "@/app/lib/news-shorts-slide-render-data";

export type NewsShortsBuildBody = {
  contentId?: string;
  template: NewsShortTemplateData;
  images?: Array<{ sceneId: string; path: string; rel?: string }>;
  voiceoverScript?: string;
  additionalKeywords?: string[];
  /** Runway / upload motion backdrop (lower priority than videoRecordingRel). */
  backgroundVideoRel?: string;
  /**
   * Still under uploads — used for slide backdrops when there is no motion clip, and for Face in circle + camera-record
   * only. Omitted server-side when motion is Runway/upload video so video replaces the still.
   */
  backgroundImageRel?: string;
  /** Saved camera clip under uploads — wins over backgroundVideoRel when both are sent. */
  videoRecordingRel?: string;
  /** Compositing for backdrop clip: full frame, top half, or circular PiP. */
  videoRecordLayout?: VideoRecordLayout;
  /** Circular face-cam anchor (circle layout or dual Runway + camera). */
  videoRecordCirclePosition?: VideoRecordCirclePosition;
  voiceGender?: VoiceGender;
  voiceSpeed?: number;
  elevenlabsVoiceId?: string;
  voiceProviderPreference?: string;
  /** When set, use this file under `output/audio/` instead of ElevenLabs / TTS. */
  voiceRecordingRel?: string;
  /** Mux audio from the motion backdrop file instead of TTS / voice recording. */
  useVideoAudio?: boolean;
  burnSubtitles?: boolean;
  /** When true with burn on, hide headline/subline on PNGs and burn styled ASS instead of plain SRT. */
  burnSubtitlesReplaceSlideText?: boolean;
  backingMusic?: BackingMusicConfig;
  seoInput?: SocialVideoSeoInput;
  seoTemplate?: SocialVideoSeoTemplate;
};

function toTemplateId(type: string): string {
  if (type === "intro") return "news-short-intro";
  if (type === "outro") return "news-short-outro";
  return "news-short-content";
}

function deriveSearchKeywords(template: NewsShortTemplateData, extras: string[] = []): string[] {
  const pool = [
    template.title,
    template.author,
    template.sourceUrl,
    ...(template.tags ?? []),
    ...extras,
    ...template.slides.flatMap((s) => s.highlightWords ?? []),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of pool) {
    const keyword = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
  }
  return out.slice(0, 30);
}

function normalizeBackingMusic(raw?: BackingMusicConfig): BackingMusicConfig | undefined {
  if (!raw || raw.enabled !== true) return undefined;
  const assetRel = String(raw.assetRel ?? "").trim();
  if (!assetRel) return undefined;
  const volumeRaw = Number(raw.volume);
  const duckStrengthRaw = Number(raw.duckStrength);
  const clamp = (v: number, lo: number, hi: number, dflt: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  const intClamp = (v: number, lo: number, hi: number, dflt: number) =>
    Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : dflt;

  const trimStartMs = intClamp(Number(raw.trimStartMs), 0, 300_000, 0);
  const trimEndRaw = Number(raw.trimEndMs);
  const trimEndMs =
    Number.isFinite(trimEndRaw) && trimEndRaw > trimStartMs ? intClamp(trimEndRaw, trimStartMs + 1, 900_000, trimStartMs + 1) : undefined;

  return {
    enabled: true,
    sourceType: raw.sourceType,
    assetRel,
    volume: clamp(volumeRaw, 0, 1, 0.18),
    ducking: raw.ducking !== false,
    duckStrength: clamp(duckStrengthRaw, 0, 1, 0.55),
    duckAttackMs: intClamp(Number(raw.duckAttackMs), 10, 2_000, 80),
    duckReleaseMs: intClamp(Number(raw.duckReleaseMs), 40, 4_000, 350),
    duckUnderNarration: raw.duckUnderNarration !== false,
    duckUnderClipAudio: raw.duckUnderClipAudio !== false,
    loop: raw.loop !== false,
    fadeInMs: intClamp(Number(raw.fadeInMs), 0, 10_000, 300),
    fadeOutMs: intClamp(Number(raw.fadeOutMs), 0, 10_000, 800),
    trimStartMs,
    trimEndMs,
    offsetMs: intClamp(Number(raw.offsetMs), 0, 120_000, 0),
  };
}

export async function executeNewsShortsBuild(body: NewsShortsBuildBody) {
    const raw = body?.template;
    if (!raw || !Array.isArray(raw.slides) || raw.slides.length === 0) {
      throw new Error("template with slides is required");
    }
    const template: NewsShortTemplateData = {
      ...raw,
      style: mergeNewsShortStyleForBrand(raw.brandTemplateId, raw.style),
    };

    const contentId = normalizeContentIdForFilename(body.contentId ?? "");
    const styledSubtitleBurn =
      body.burnSubtitles !== false && body.burnSubtitlesReplaceSlideText === true;
    const requestedMotion = resolveMotionBackdropRel({
      videoRecordingRel: body.videoRecordingRel,
      backgroundVideoRel: body.backgroundVideoRel,
    });
    const hasRequestedMotionBackdrop = Boolean(requestedMotion.rel?.trim());
    const scenes = template.slides.map((slide, i) => {
      const heroImageForScene = hasRequestedMotionBackdrop ? "" : slide.imageUrl || template.heroImage;
      return {
      id: slide.id || `slide-${i + 1}`,
      templateId: toTemplateId(slide.type),
      durationSec: Math.max(3, Math.min(8, Number(slide.durationSec || 5))),
      caption: slide.headline || slide.subline || `Slide ${i + 1}`,
      data: newsShortSceneDataForSlide(template, slide, i, {
        heroImageForScene,
        styledSubtitleBurn,
        motionBackdropDimStrength: clampMotionBackdropDimStrength(
          template.style.motionBackdropDimStrength ?? 0.45,
        ),
        motionBackdropOpaqueOpacity: clampMotionBackdropOpaqueOpacity(
          template.style.motionBackdropOpaqueOpacity ?? 0.3,
        ),
      }),
      };
    });

    const providedImages = Array.isArray(body.images) ? body.images : [];
    const renderedRefs = scenes.map((scene, index) => {
      const match = providedImages.find((image) => image.sceneId === scene.id) ?? providedImages[index];
      return newsShortRenderedImageRef(match);
    });
    const canUseRenderedImages = renderedRefs.every((ref) => ref.length > 0);

    let images: Array<{ sceneId: string; path: string; rel?: string }> = [];
    if (!canUseRenderedImages) {
      await withSharedPuppeteerBrowser(async (browser) => {
        for (const scene of scenes) {
          const sceneDataForRender = hasRequestedMotionBackdrop
            ? { ...scene.data, editorTransparentBackground: true }
            : scene.data;
          const imagePath = await renderSceneToPng(
            {
              contentId,
              sceneId: scene.id,
              templateId: scene.templateId,
              data: sceneDataForRender,
            },
            { browser },
          );
          images.push({ sceneId: scene.id, path: imagePath });
        }
      });
    } else {
      images = scenes.map((scene, index) => {
        const ref = renderedRefs[index]!;
        return {
          sceneId: scene.id,
          path: ref,
          ...(ref.startsWith("images/library/") ? { rel: ref } : {}),
        };
      });
    }

    const scriptFromSlides = template.slides.map((s) => [s.headline, s.subline].filter(Boolean).join(". ")).join(". ");
    const script = (body.voiceoverScript || scriptFromSlides).replace(/\s+/g, " ").trim();
    const gender: VoiceGender = body.voiceGender === "male" ? "male" : "female";
    const speedRaw = Number(body.voiceSpeed);
    const speed = Number.isFinite(speedRaw) ? Math.max(0.5, Math.min(2, speedRaw)) : 1;

    const recRel = body.voiceRecordingRel?.trim();
    const camMotion = body.videoRecordingRel?.trim();
    const bgvMotion = body.backgroundVideoRel?.trim();
    const motion = resolveMotionBackdropRel({
      videoRecordingRel: body.videoRecordingRel,
      backgroundVideoRel: body.backgroundVideoRel,
    });
    const dualCompositeActive = Boolean(
      camMotion &&
        bgvMotion &&
        motionBackdropRelLooksLikeCameraRecording(camMotion) &&
        !motionBackdropRelLooksLikeCameraRecording(bgvMotion) &&
        camMotion !== bgvMotion,
    );
    const useVideoAudio =
      body.useVideoAudio === true && Boolean(dualCompositeActive ? bgvMotion : motion.rel);

    let audioPath: string | undefined;
    let voiceTrackProvider: string | undefined;
    let voiceFallbackReason: string | undefined;
    const requestedVoiceId = body.elevenlabsVoiceId?.trim() || undefined;
    if (!useVideoAudio) {
      if (recRel) {
        const norm = assertVoiceRecordingRel(recRel, contentId);
        audioPath = path.join(outputDir(), ...norm.split("/"));
        await fs.access(audioPath);
        voiceTrackProvider = "recording";
      } else {
        const audio = await resolveVoiceTrackWithFallback(script, contentId, {
          gender,
          speed,
          voiceId: requestedVoiceId,
          providerPreference: normalizeVoiceProviderPreference(body.voiceProviderPreference),
        });
        audioPath = audio.audioPath;
        voiceTrackProvider = audio.provider;
        voiceFallbackReason = audio.fallbackReason;
      }
    }

    const seoInput: SocialVideoSeoInput = body.seoInput ?? {
      headline: template.title || "PlanetF1 News Short",
      article_url: template.sourceUrl || "",
      article_text: (template.articleBody ?? []).join(" "),
      main_topic: template.tags?.[0] || "F1 news",
      entities: (template.tags ?? []).slice(0, 5),
      event: template.tags?.[1] || template.title || "latest update",
      publish_date: template.publishDate || "",
      tone: "analysis",
    };
    const generatedSeo = generateSocialVideoSeo(seoInput);
    const mergedSeo: SocialVideoSeoTemplate = {
      ...generatedSeo,
      ...(body.seoTemplate ?? {}),
      tags: body.seoTemplate?.tags?.length ? body.seoTemplate.tags : generatedSeo.tags,
      hashtags: body.seoTemplate?.hashtags?.length ? body.seoTemplate.hashtags : generatedSeo.hashtags,
      youtube_tags: body.seoTemplate?.youtube_tags?.length ? body.seoTemplate.youtube_tags : generatedSeo.youtube_tags,
    };
    const seoTitle = (mergedSeo.youtube_title || mergedSeo.title || template.title || "PlanetF1 News Short").slice(0, 300);
    const seoSlug = buildVideoSlug(seoTitle, contentId);
    const searchKeywords = deriveSearchKeywords(
      template,
      [
        ...(Array.isArray(body.additionalKeywords) ? body.additionalKeywords : []),
        ...(mergedSeo.tags ?? []),
        ...(mergedSeo.youtube_tags ?? []),
      ],
    );

    const audioSource = resolveOutputAudioSource({
      useVideoAudio,
      hasMotionBackdrop: Boolean(dualCompositeActive || motion.rel),
      voiceRecordingRel: recRel,
    });

    const motionRel = motion.rel?.trim() ?? "";
    /** Runway/upload motion replaces the global still for FFmpeg; still is kept only for circle + camera PiP. */
    const backgroundImageRelForBuild =
      (motionRel && !motionBackdropRelLooksLikeCameraRecording(motionRel)) || dualCompositeActive
        ? undefined
        : body.backgroundImageRel?.trim() || undefined;

    const seoDownloadFile = (mergedSeo.file_name || "").trim();
    const backingMusic = normalizeBackingMusic(body.backingMusic);

    const voiceScript = (body.voiceoverScript ?? "").trim();
    const voiceChunks =
      voiceScript.length > 0 && scenes.length > 0
        ? splitScriptIntoSceneCaptions(voiceScript, scenes.length)
        : null;

    const panelTextResolved = resolvedPanelTextColorForNewsShort(template);
    const outputDims = videoDimensionsForCreativeFormat(normalizeCreativeVideoFormat(template.creativeVideoFormat));

    const build = await buildShortVideo({
      contentId,
      format: "news-shorts",
      outputWidth: outputDims.width,
      outputHeight: outputDims.height,
      scenes: scenes.map((scene, idx) => {
        const slide = template.slides[idx]!;
        const hideMeta = idx === 0 || idx === 2;
        const scriptChunk = voiceChunks ? (voiceChunks[idx] ?? "").trim() : "";
        const captionOverride = (slide.captionText ?? "").trim();
        const voiceLine = captionOverride
          ? captionOverride
          : voiceScript && voiceChunks
            ? sceneSubtitleLineForBurn(scriptChunk, slide.headline, slide.subline ?? "").trim()
            : "";
        const useVoiceLine = Boolean(voiceLine);
        const useAssOverlayLine = styledSubtitleBurn && useVoiceLine;
        const slideCaption =
          [slide.headline, slide.subline].filter(Boolean).join(". ").trim() || scene.caption;
        const hlSource = useVoiceLine
          ? voiceLine
          : [slide.headline, slide.subline].filter(Boolean).join(" ").trim() || slideCaption;
        return {
          imagePath: newsShortRenderedImageRef(images[idx]) || images[idx]!.path,
          durationSec: scene.durationSec,
          caption: useVoiceLine ? voiceLine : slideCaption,
          subtitleHeadline: useAssOverlayLine ? voiceLine : slide.headline,
          subtitleSubline: useAssOverlayLine ? "" : hideMeta ? "" : slide.subline,
          highlightWords: highlightWordsForCaption(hlSource, slide.highlightWords),
        };
      }),
      audioPath,
      burnSubtitles: body.burnSubtitles ?? true,
      styledSubtitleBurn,
      subtitleStyle: styledSubtitleBurn
        ? {
            fontSize: template.style.fontSize,
            lineHeight: template.style.lineHeight,
            panelColor: template.style.panelColor,
            highlightColor: template.style.highlightColor,
            ...(panelTextResolved ? { panelTextColor: panelTextResolved } : {}),
            textBoxWidthPct: template.style.textBoxWidthPct,
            headlineFont: template.style.headlineFont ?? "roboto-condensed",
          }
        : undefined,
      seoTitle,
      seoSlug,
      seoDownloadFile: seoDownloadFile || undefined,
      backgroundVideoRel: dualCompositeActive ? bgvMotion : motion.rel,
      cameraOverlayRel: dualCompositeActive ? camMotion : undefined,
      backgroundImageRel: backgroundImageRelForBuild,
      videoRecordLayout: body.videoRecordLayout,
      videoRecordCirclePosition: body.videoRecordCirclePosition,
      useVideoAudio,
      backingMusic,
      searchKeywords,
    });

    const engineExport = buildShortFormEngineExport({
      contentId,
      template,
      slides: template.slides,
      scenes: scenes.map((s) => ({ id: s.id, durationSec: s.durationSec, caption: s.caption })),
      audioSource,
      dualCompositeActive,
      backgroundVideoRel: bgvMotion,
      videoRecordingRel: camMotion,
      resolvedMotionRel: motion.rel,
      backgroundImageRel: backgroundImageRelForBuild,
      videoRecordLayout: body.videoRecordLayout ?? "full",
      videoRecordCirclePosition: body.videoRecordCirclePosition ?? "middle-right",
      useVideoAudio,
      backingMusic,
      burnSubtitles: body.burnSubtitles ?? true,
    });
    const enginePath = path.join(outputVideoDir(), `${contentId}-short-engine.json`);
    await fs.writeFile(enginePath, JSON.stringify(engineExport, null, 2), "utf-8");
    const engineRel = path.relative(outputDir(), enginePath).split(path.sep).join("/");
    const videoRel = path.relative(outputDir(), build.videoPath).split(path.sep).join("/");
    if (shouldUseNetlifyBlobStore()) {
      const persisted = await persistVideoOutputToBlob(build.videoPath);
      if (!persisted) {
        throw new Error("Video encoded but could not be saved for preview. Try the build again.");
      }
    }

    return {
      ok: true as const,
      contentId,
      images,
      audioPath,
      videoPath: build.videoPath,
      videoRel,
      sceneDurationsSec: build.sceneDurationsSec,
      narrationDurationSec: build.narrationDurationSec,
      captionsBurned: build.captionsBurned,
      voiceTrackProvider,
      voiceFallbackReason,
      elevenlabsVoiceId: requestedVoiceId,
      srtPath: build.srtPath,
      ...(build.assPath
        ? { assPath: path.relative(outputDir(), build.assPath).split(path.sep).join("/") }
        : {}),
      concatPath: build.concatPath,
      audioSource,
      motionBackdropSource: dualCompositeActive ? "backgroundVideo" : motion.source,
      seo: mergedSeo,
      engine: engineExport,
      engineRel,
    };
}
