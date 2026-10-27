import fs from "fs/promises";
import path from "path";
import { renderSceneToPng, withSharedPuppeteerBrowser } from "@/app/features/render/scene-renderer";
import { coalesceGlobalBackgroundImageRel } from "@/app/lib/background-image-rel";
import {
  assertCrossContentBackdropRel,
  normalizeContentIdForFilename,
  resolveEditorBackdropDataUrl,
} from "@/app/lib/editor-upload";
import { outputDir } from "@/app/lib/paths";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";
import type { SceneSpec } from "@/types";
import { writeLibraryBlobAsset } from "@/app/lib/library-blob-assets";
import { resolveF1TemplateDataForRender, resolvePublicImageDataUrl } from "@/app/lib/f1-driver-images";

export type RenderScenesBody = {
  contentId: string;
  scenes: SceneSpec[];
  width?: number;
  height?: number;
  backgroundImageRel?: string | null;
  backgroundImageRelBySceneId?: Record<string, string> | null;
  backgroundVideoFrameRel?: string | null;
  backgroundVideoRel?: string | null;
  motionBackdropOpaqueOpacity?: number;
  motionBackdropDimStrength?: number;
  editorCompositorImageUrl?: string | null;
  editorCompositorBySceneId?: Record<string, string> | null;
  pixelRatio?: number;
  editorSubtitleOverlayOnly?: boolean;
};

export type RenderedSceneImage = {
  sceneId: string;
  path: string;
  rel: string;
  underlayPath?: string;
  underlayRel?: string;
  diskRel?: string;
  diskUnderlayRel?: string;
};

export class RenderScenesRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function executeRenderScenes(
  body: RenderScenesBody,
  hooks?: { onProgress?: (phase: string) => Promise<void> | void },
): Promise<{ contentId: string; images: RenderedSceneImage[] }> {
  if (!body?.contentId || !body?.scenes?.length) {
    throw new RenderScenesRequestError("contentId and scenes required");
  }

  const canonicalContentId = normalizeContentIdForFilename(String(body.contentId).trim());
  const videoRel = body.backgroundVideoRel?.trim();
  const motionBackdropExtra: Record<string, unknown> =
    videoRel && (body.motionBackdropOpaqueOpacity !== undefined || body.motionBackdropDimStrength !== undefined)
      ? {
          ...(body.motionBackdropOpaqueOpacity !== undefined
            ? { motionBackdropOpaqueOpacity: body.motionBackdropOpaqueOpacity }
            : {}),
          ...(body.motionBackdropDimStrength !== undefined
            ? { motionBackdropDimStrength: body.motionBackdropDimStrength }
            : {}),
        }
      : {};
  let backdropFields: Record<string, unknown> = {};
  const backdropBySceneDataUrl: Record<string, string> = {};

  if (videoRel) {
    try {
      assertCrossContentBackdropRel(videoRel);
    } catch {
      throw new RenderScenesRequestError("Invalid background video path");
    }
    backdropFields = { editorTransparentBackground: true };
  } else {
    let backdropDataUrl: string | undefined;
    try {
      const coalescedRel = coalesceGlobalBackgroundImageRel(body.backgroundImageRel, body.backgroundImageRelBySceneId);
      backdropDataUrl = await resolveEditorBackdropDataUrl(
        canonicalContentId,
        coalescedRel,
        body.backgroundVideoFrameRel,
      );
    } catch {
      throw new RenderScenesRequestError("Invalid background asset path");
    }
    if (backdropDataUrl) backdropFields = { editorBackgroundImageUrl: backdropDataUrl };
    const byScene = body.backgroundImageRelBySceneId;
    if (byScene && typeof byScene === "object") {
      for (const [sceneId, rel] of Object.entries(byScene)) {
        if (!sceneId || typeof rel !== "string") continue;
        const image = await resolveEditorBackdropDataUrl(canonicalContentId, rel, null);
        if (image) backdropBySceneDataUrl[sceneId] = image;
      }
    }
  }

  const legacyComp = body.editorCompositorImageUrl?.trim();
  const byScene = body.editorCompositorBySceneId;
  const hasPerScene =
    byScene &&
    typeof byScene === "object" &&
    Object.keys(byScene).some((key) => typeof byScene[key] === "string" && byScene[key]!.startsWith("data:image/"));
  const pixelRatio = typeof body.pixelRatio === "number" && body.pixelRatio >= 1 ? Math.min(3, body.pixelRatio) : 1;

  return withSharedPuppeteerBrowser(async (browser) => {
    const outDir = outputDir();
    const outputs: RenderedSceneImage[] = [];
    for (let index = 0; index < body.scenes.length; index += 1) {
      const scene = body.scenes[index]!;
      await hooks?.onProgress?.(`scene ${index + 1} of ${body.scenes.length}`);
      const sceneComp =
        hasPerScene && typeof byScene![scene.id] === "string" && byScene![scene.id]!.startsWith("data:image/")
          ? byScene![scene.id]!.trim()
          : typeof legacyComp === "string" && legacyComp.startsWith("data:image/")
            ? legacyComp
            : undefined;
      const sceneBg = backdropBySceneDataUrl[scene.id];
      const sceneBackdropUnderlay = {
        ...backdropFields,
        ...(sceneBg ? { editorBackgroundImageUrl: sceneBg } : {}),
      };
      const sceneBackdrop = {
        ...sceneBackdropUnderlay,
        ...(sceneComp !== undefined ? { editorCompositorImageUrl: sceneComp } : {}),
      };

      let sceneData: Record<string, unknown> = { ...scene.data };
      if (scene.templateId.startsWith("f1-grid") || scene.templateId.startsWith("f1-results")) {
        sceneData = await resolveF1TemplateDataForRender(sceneData);
      }
      const resolvedPlayerImageUrl = await resolvePublicImageDataUrl(sceneData.playerImageUrl);
      const resolvedLeftClubLogoUrl = await resolvePublicImageDataUrl(sceneData.leftClubLogoUrl);
      const resolvedRightClubLogoUrl = await resolvePublicImageDataUrl(sceneData.rightClubLogoUrl);
      const resolvedHeroImageUrl = await resolvePublicImageDataUrl(sceneData.heroImage);
      const merged = {
        ...sceneData,
        ...(typeof body.width === "number" ? { width: body.width } : {}),
        ...(typeof body.height === "number" ? { height: body.height } : {}),
        ...motionBackdropExtra,
        ...(resolvedPlayerImageUrl ? { playerImageUrl: resolvedPlayerImageUrl } : {}),
        ...(resolvedLeftClubLogoUrl ? { leftClubLogoUrl: resolvedLeftClubLogoUrl } : {}),
        ...(resolvedRightClubLogoUrl ? { rightClubLogoUrl: resolvedRightClubLogoUrl } : {}),
        ...(resolvedHeroImageUrl ? { heroImage: resolvedHeroImageUrl } : {}),
      };

      const imagePath = await renderSceneToPng(
        {
          contentId: canonicalContentId,
          sceneId: scene.id,
          templateId: scene.templateId,
          data: {
            ...merged,
            ...sceneBackdrop,
            ...(body.editorSubtitleOverlayOnly ? { editorSubtitleOverlayOnly: true } : {}),
          },
        },
        { browser, deviceScaleFactor: pixelRatio },
      );

      let underlayPath = imagePath;
      if (sceneComp !== undefined) {
        underlayPath = await renderSceneToPng(
          {
            contentId: canonicalContentId,
            sceneId: scene.id,
            templateId: scene.templateId,
            data: {
              ...merged,
              ...sceneBackdropUnderlay,
              ...(body.editorSubtitleOverlayOnly ? { editorSubtitleOverlayOnly: true } : {}),
            },
            fileSuffix: "underlay",
          },
          { browser, deviceScaleFactor: pixelRatio },
        );
      }

      const diskRel = path.relative(outDir, imagePath).split(path.sep).join("/");
      const diskUnderlayRel = path.relative(outDir, underlayPath).split(path.sep).join("/");
      const safeSceneId = normalizeContentIdForFilename(String(scene.id || "scene"));
      const rel = `images/library/${canonicalContentId}/render-${safeSceneId}.png`;
      const underlayRel =
        sceneComp !== undefined ? `images/library/${canonicalContentId}/render-${safeSceneId}-underlay.png` : rel;

      const publishRenderedPng = async (sourceAbs: string, publishRel: string) => {
        const destAbs = path.join(outDir, ...publishRel.split("/"));
        await fs.mkdir(path.dirname(destAbs), { recursive: true });
        await fs.copyFile(sourceAbs, destAbs);
        if (shouldUseNetlifyBlobStore()) {
          await writeLibraryBlobAsset(publishRel, await fs.readFile(destAbs), "image/png");
        }
      };

      await publishRenderedPng(imagePath, rel);
      if (underlayPath !== imagePath) await publishRenderedPng(underlayPath, underlayRel);
      outputs.push({
        sceneId: scene.id,
        path: imagePath,
        rel,
        underlayPath,
        underlayRel,
        diskRel,
        diskUnderlayRel,
      });
    }
    return { contentId: canonicalContentId, images: outputs };
  });
}
