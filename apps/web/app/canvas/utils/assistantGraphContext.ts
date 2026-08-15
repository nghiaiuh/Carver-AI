import type { AssistantCardContext } from "@carver/shared";
import type { CanvasAssistantNode, CanvasNode, CanvasPresetGroupNode } from "../types/canvas";
import {
  isCanvasContextGroupNode,
  isCanvasImageGeneratorNode,
  isCanvasImageOutputGalleryNode,
  isCanvasTextNode,
  isCanvasCameraShotSetNode,
} from "../types/canvas";
import { isAssistantNode, isPresetGroupNode } from "./presetGroupHelpers";
import { resolveContextGroupItems } from "./contextGroupHelpers";
import { getCameraShotSetPrompt } from "./cameraShotHelpers";

function getInboundEdgesForAssistant(nodeId: string, edges: Array<{
  sourceId: string;
  targetId: string;
  sourcePresetChildId?: string | null;
  sourcePortId?: string;
  role?: string;
}>) {
  return edges.filter((edge) => edge.targetId === nodeId);
}

function getAssistantTextSourceContent(node: CanvasNode) {
  if (isCanvasTextNode(node)) {
    return node.text.content.trim();
  }

  if (isAssistantNode(node)) {
    return (node.assistant.response || node.assistant.prompt).trim();
  }

  if (isCanvasCameraShotSetNode(node)) {
    return getCameraShotSetPrompt(node);
  }

  return "";
}

function buildAssistantConnectionSummary(context: AssistantCardContext) {
  const textSummary =
    context.textReferences.length > 0
      ? `Text refs: ${context.textReferences.map((reference) => reference.title).join(", ")}.`
      : "Text refs: none.";
  const imageSummary =
    context.imageReferences.length > 0
      ? `Image refs: ${context.imageReferences.map((reference) => reference.childLabel ?? reference.title).join(", ")}.`
      : "Image refs: none.";

  return [textSummary, imageSummary].join(" ");
}

function appendPresetImageReferences(
  references: AssistantCardContext["imageReferences"],
  seenImageKeys: Set<string>,
  sourceNode: CanvasPresetGroupNode,
  edge: {
    sourcePresetChildId?: string | null;
    role?: string;
  },
) {
  const selectedChildren = edge.sourcePresetChildId
    ? sourceNode.presetGroup.children.filter((child) => child.id === edge.sourcePresetChildId)
    : sourceNode.presetGroup.children;

  for (const child of selectedChildren) {
    const key = `${sourceNode.id}:${child.id}`;
    const imageUrl = child.imageSrc || child.sourceImage?.url || "";
    if ((!imageUrl && !child.assetId && !child.sourceImage?.assetId) || seenImageKeys.has(key)) {
      continue;
    }

    seenImageKeys.add(key);
    references.push({
      nodeId: sourceNode.id,
      title: sourceNode.title,
      imageUrl,
      assetId: child.assetId ?? child.sourceImage?.assetId,
      role: edge.role ?? child.metadata?.roleHint ?? "generic_reference",
      sourceKind: "preset",
      childId: child.id,
      childLabel: child.label,
    });
  }
}

export function buildAssistantCardContext(
  assistantNodeId: string,
  nodes: CanvasNode[],
  edges: Array<{
    sourceId: string;
    targetId: string;
    sourcePresetChildId?: string | null;
    sourcePortId?: string;
    role?: string;
  }>,
): AssistantCardContext | null {
  const assistantNode = nodes.find((node): node is CanvasAssistantNode =>
    node.id === assistantNodeId && node.kind === "assistant",
  );
  if (!assistantNode) {
    return null;
  }

  const textReferences: AssistantCardContext["textReferences"] = [];
  const imageReferences: AssistantCardContext["imageReferences"] = [];
  const seenTextKeys = new Set<string>();
  const seenImageKeys = new Set<string>();

  for (const edge of getInboundEdgesForAssistant(assistantNodeId, edges)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceId);
    if (!sourceNode) {
      continue;
    }

    if (isCanvasTextNode(sourceNode) || isAssistantNode(sourceNode) || isCanvasCameraShotSetNode(sourceNode)) {
      const content = getAssistantTextSourceContent(sourceNode);
      const key = `${sourceNode.id}:${edge.sourcePortId ?? "text"}`;
      if (!content || seenTextKeys.has(key)) {
        continue;
      }

      seenTextKeys.add(key);
      textReferences.push({
        nodeId: sourceNode.id,
        title: sourceNode.title,
        content,
        sourceKind: isCanvasTextNode(sourceNode) ? "text" : "assistant",
      });
      continue;
    }

    if (isPresetGroupNode(sourceNode)) {
      appendPresetImageReferences(imageReferences, seenImageKeys, sourceNode, edge);
      continue;
    }

    if (isCanvasContextGroupNode(sourceNode)) {
      for (const item of resolveContextGroupItems(sourceNode, nodes)) {
        const key = `${sourceNode.id}:${item.id}`;
        if ((!item.imageUrl && !item.assetId) || seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        imageReferences.push({
          nodeId: item.sourceNodeId ?? sourceNode.id,
          title: item.title,
          imageUrl: item.imageUrl,
          assetId: item.assetId,
          role: edge.role ?? item.role,
          sourceKind: "image",
          childId: item.id,
          childLabel: item.title,
        });
      }
      continue;
    }

    const key = `${sourceNode.id}:${edge.sourcePortId ?? "image"}`;
    if (seenImageKeys.has(key)) {
      continue;
    }

    const galleryGeneratorNodeId = isCanvasImageOutputGalleryNode(sourceNode)
      ? sourceNode.imageOutputGallery.generatorNodeId
      : null;
    const gallerySelectedOutputAssetId = isCanvasImageOutputGalleryNode(sourceNode)
      ? sourceNode.imageOutputGallery.selectedOutputAssetId
      : undefined;
    const galleryGenerator = galleryGeneratorNodeId
      ? nodes.find(
          (candidate): candidate is Extract<CanvasNode, { kind: "image-generator" }> =>
            candidate.id === galleryGeneratorNodeId &&
            isCanvasImageGeneratorNode(candidate),
        )
      : null;
    const galleryOutput = galleryGenerator?.imageGenerator.outputs.find(
      (output) => output.assetId === gallerySelectedOutputAssetId,
    ) ?? galleryGenerator?.imageGenerator.outputs[0];
    const imageUrl = galleryOutput?.imageUrl || sourceNode.imageUrl || sourceNode.sourceImage?.url || "";
    const assetId = galleryOutput?.assetId ?? sourceNode.sourceImage?.assetId;
    if (!imageUrl && !assetId) {
      continue;
    }

    seenImageKeys.add(key);
    imageReferences.push({
      nodeId: sourceNode.id,
      title: sourceNode.title,
      imageUrl,
      assetId,
      role: edge.role ?? "generic_reference",
      sourceKind: "image",
      childId: null,
      childLabel: null,
    });
  }

  const context: AssistantCardContext = {
    nodeId: assistantNode.id,
    nodeTitle: assistantNode.title,
    textReferences: textReferences.slice(0, 16),
    imageReferences: imageReferences.slice(0, 16),
    connectionSummary: "",
  };

  return {
    ...context,
    connectionSummary: buildAssistantConnectionSummary(context),
  };
}

export async function resolveAssistantContextAssets(context: AssistantCardContext) {
  const resolveAssistantImageUrl = async (imageUrl: string) => {
    if (!imageUrl) {
      return imageUrl;
    }

    if (imageUrl.startsWith("data:")) {
      return imageUrl;
    }

    if (typeof window === "undefined") {
      return imageUrl;
    }

    try {
      const normalizedUrl = new URL(imageUrl, window.location.origin);
      const isSameOrigin = normalizedUrl.origin === window.location.origin;

      if (imageUrl.startsWith("blob:") || isSameOrigin) {
        const response = await fetch(normalizedUrl.toString());
        if (!response.ok) {
          throw new Error("Unable to load assistant reference image.");
        }

        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }

            reject(new Error("Unable to read assistant reference image."));
          };
          reader.onerror = () => reject(new Error("Unable to read assistant reference image."));
          reader.readAsDataURL(blob);
        });
      }

      return normalizedUrl.toString();
    } catch {
      return imageUrl;
    }
  };

  return {
    ...context,
    imageReferences: await Promise.all(
      context.imageReferences.map(async (reference) => ({
        ...reference,
        imageUrl: await resolveAssistantImageUrl(reference.imageUrl),
      })),
    ),
  };
}
