import type { CanvasGenerationContext, GeneratedCanvasImage } from "@carver/shared";
import type { CanvasNode } from "../types/canvas";
import { getDefaultInputPorts } from "../types/canvas";

// Convert a Blob into a data URL so the backend can receive local canvas images safely.
async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image data."));
    };
    reader.onerror = () => reject(new Error("Unable to read image data."));
    reader.readAsDataURL(blob);
  });
}

// Normalize image URLs before generation, especially local/blob-backed canvas images.
export async function resolveImageUrlForGeneration(imageUrl: string, assetId?: string) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (typeof window === "undefined") return imageUrl;

  if (assetId) {
    return imageUrl;
  }

  try {
    const normalizedUrl = new URL(imageUrl, window.location.origin);
    const isSameOrigin = normalizedUrl.origin === window.location.origin;

    if (imageUrl.startsWith("blob:") || isSameOrigin) {
      const response = await fetch(normalizedUrl.toString());
      if (!response.ok) throw new Error("Unable to load canvas image.");
      return blobToDataUrl(await response.blob());
    }

    return normalizedUrl.toString();
  } catch {
    return imageUrl;
  }
}

// Resolve every image reference in the generation context into a backend-safe URL.
export async function resolveGenerationContextAssets(context: CanvasGenerationContext) {
  return {
    ...context,
    target: {
      ...context.target,
      imageUrl: await resolveImageUrlForGeneration(context.target.imageUrl, context.target.assetId),
    },
    imageReferences: await Promise.all(
      context.imageReferences.map(async (reference) => ({
        ...reference,
        imageUrl: await resolveImageUrlForGeneration(reference.imageUrl, reference.assetId),
      })),
    ),
    presetReferences: await Promise.all(
      context.presetReferences.map(async (reference) => ({
        ...reference,
        imageSrc: await resolveImageUrlForGeneration(reference.imageSrc, reference.assetId),
      })),
    ),
  };
}

// Keep generated nodes within a usable visual range while preserving image ratio.
function getGeneratedNodeSize(image: GeneratedCanvasImage, targetNode?: CanvasNode | null) {
  const fallbackWidth = targetNode?.width ?? image.width ?? 320;
  const fallbackHeight = targetNode?.height ?? image.height ?? 240;
  const sourceWidth = image.width ?? targetNode?.sourceImage?.width ?? fallbackWidth;
  const sourceHeight = image.height ?? targetNode?.sourceImage?.height ?? fallbackHeight;
  const ratio =
    sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : fallbackWidth / fallbackHeight;
  const width = Math.min(Math.max(fallbackWidth, 260), 420);
  const height = width / ratio;

  if (height <= 320) return { width, height };

  return {
    width: 320 * ratio,
    height: 320,
  };
}

// Create a canvas output node from a generated image so it can be inserted back onto the board.
export function createGeneratedOutputNode(params: {
  generatedImage: GeneratedCanvasImage;
  prompt: string;
  targetNode?: CanvasNode | null;
  existingNodes?: CanvasNode[];
}): CanvasNode {
  const { generatedImage, prompt, targetNode } = params;
  const nodeSize = getGeneratedNodeSize(generatedImage, targetNode);
  const fallbackX =
    params.existingNodes && params.existingNodes.length > 0
      ? Math.max(...params.existingNodes.map((node) => node.x + node.width * (node.scale ?? 1))) + 80
      : 120;
  const fallbackY =
    params.existingNodes && params.existingNodes.length > 0
      ? Math.max(...params.existingNodes.map((node) => node.y), 120)
      : 120;

  return {
    id: `node-generated-${Date.now()}`,
    x: targetNode ? targetNode.x + targetNode.width * (targetNode.scale ?? 1) + 80 : fallbackX,
    y: targetNode ? targetNode.y : fallbackY,
    width: nodeSize.width,
    height: nodeSize.height,
    scale: 1,
    inputPorts: getDefaultInputPorts(),
    imageUrl: generatedImage.imageUrl,
    sourceImage: {
      assetId: generatedImage.assetId,
      url: generatedImage.imageUrl,
      width: generatedImage.width,
      height: generatedImage.height,
      mimeType: generatedImage.mimeType,
      name: generatedImage.title,
      quality: "original",
    },
    title: generatedImage.title || "Generated concept",
    prompt,
    role: "output",
  };
}
