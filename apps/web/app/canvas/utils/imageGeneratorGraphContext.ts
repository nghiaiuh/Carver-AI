import type {
  CanvasGenerationContext,
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  ImageGeneratorGraphContext,
  ImageGeneratorTextReference,
} from "@carver/shared";
import type { CanvasNode, CanvasPresetGroupNode } from "../types/canvas";
import {
  isCanvasImageGeneratorNode,
  isCanvasImageOutputGalleryNode,
  isCanvasTextNode,
  isCanvasContextGroupNode,
  isCanvasCameraShotSetNode,
} from "../types/canvas";
import { isAssistantNode, isImageGeneratorNode, isPresetGroupNode } from "./presetGroupHelpers";
import { resolveContextGroupItems } from "./contextGroupHelpers";
import { getCameraShotSetPrompt } from "./cameraShotHelpers";

type InboundEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePresetChildId?: string | null;
  sourcePortId?: string;
  createdAt?: string;
  role?: string;
};

function extractAssetIdFromGatewayUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "https://carver.local");
    return parsed.pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/content$/i)?.[1];
  } catch {
    return undefined;
  }
}

export function resolveConnectedImageAssetId(params: {
  imageUrl?: string;
  sourceImageUrl?: string;
  assetId?: string;
}) {
  // Runtime gateway URLs are refreshed from current asset metadata. Prefer
  // their stable ID when an older draft still carries stale source metadata.
  return (
    extractAssetIdFromGatewayUrl(params.imageUrl) ??
    extractAssetIdFromGatewayUrl(params.sourceImageUrl) ??
    params.assetId
  );
}

function sortEdges(edges: InboundEdge[]) {
  return [...edges].sort((left, right) => {
    const leftCreated = left.createdAt ? Date.parse(left.createdAt) : Number.POSITIVE_INFINITY;
    const rightCreated = right.createdAt ? Date.parse(right.createdAt) : Number.POSITIVE_INFINITY;
    if (leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }

    return left.id.localeCompare(right.id);
  });
}

function getInboundEdgesForGenerator(nodeId: string, edges: InboundEdge[]) {
  return sortEdges(edges.filter((edge) => edge.targetId === nodeId));
}

function getConnectedTextContent(node: CanvasNode) {
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

function appendPresetReferences(
  references: CanvasGenerationPresetReference[],
  sourceNode: CanvasPresetGroupNode,
  edge: InboundEdge,
  seenKeys: Set<string>,
) {
  const selectedChildren = edge.sourcePresetChildId
    ? sourceNode.presetGroup.children.filter((child) => child.id === edge.sourcePresetChildId)
    : sourceNode.presetGroup.children;

  for (const child of selectedChildren) {
    const key = `${sourceNode.id}:${child.id}`;
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    references.push({
      nodeId: sourceNode.id,
      category: sourceNode.presetGroup.category,
      childId: child.id,
      slot: child.slot,
      label: child.label,
      imageSrc: child.imageSrc || child.sourceImage?.url || "",
      assetId: resolveConnectedImageAssetId({
        imageUrl: child.imageSrc,
        sourceImageUrl: child.sourceImage?.url,
        assetId: child.assetId ?? child.sourceImage?.assetId,
      }),
      role: edge.role ?? child.metadata?.roleHint ?? "generic_reference",
    });
  }
}

function buildConnectionSummary(params: {
  imageReferences: CanvasGenerationImageReference[];
  presetReferences: CanvasGenerationPresetReference[];
  textReferences: ImageGeneratorTextReference[];
}) {
  const imageSummary =
    params.imageReferences.length > 0
      ? `Image refs: ${params.imageReferences.map((reference) => reference.title).join(", ")}.`
      : "Image refs: none.";
  const presetSummary =
    params.presetReferences.length > 0
      ? `Preset refs: ${params.presetReferences.map((reference) => reference.label).join(", ")}.`
      : "Preset refs: none.";
  const textSummary =
    params.textReferences.length > 0
      ? `Text refs: ${params.textReferences.map((reference) => reference.title).join(", ")}.`
      : "Text refs: none.";

  return [imageSummary, presetSummary, textSummary].join(" ");
}

export function buildImageGeneratorGraphContext(
  generatorNodeId: string,
  nodes: CanvasNode[],
  edges: InboundEdge[],
): {
  generatorContext: ImageGeneratorGraphContext;
  executionContext: CanvasGenerationContext | null;
} | null {
  const generatorNode = nodes.find(
    (node): node is Extract<CanvasNode, { kind: "image-generator" }> =>
      node.id === generatorNodeId && isCanvasImageGeneratorNode(node),
  );
  if (!generatorNode) {
    return null;
  }

  const imageReferences: CanvasGenerationImageReference[] = [];
  const presetReferences: CanvasGenerationPresetReference[] = [];
  const textReferences: ImageGeneratorTextReference[] = [];
  const seenImageKeys = new Set<string>();
  const seenPresetKeys = new Set<string>();
  const seenTextKeys = new Set<string>();

  for (const edge of getInboundEdgesForGenerator(generatorNodeId, edges)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceId);
    if (!sourceNode || isImageGeneratorNode(sourceNode)) {
      continue;
    }

    if (isCanvasTextNode(sourceNode) || isAssistantNode(sourceNode) || isCanvasCameraShotSetNode(sourceNode)) {
      const content = getConnectedTextContent(sourceNode);
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
      appendPresetReferences(presetReferences, sourceNode, edge, seenPresetKeys);
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
          sourcePresetChildId: null,
        });
      }
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

    const key = `${sourceNode.id}:${edge.sourcePresetChildId ?? "node"}:${edge.sourcePortId ?? "image"}`;
    if (seenImageKeys.has(key)) {
      continue;
    }

    const imageUrl = galleryOutput?.imageUrl || sourceNode.imageUrl || sourceNode.sourceImage?.url || "";
    const assetId = resolveConnectedImageAssetId({
      imageUrl,
      sourceImageUrl: sourceNode.sourceImage?.url,
      assetId: galleryOutput?.assetId ?? sourceNode.sourceImage?.assetId,
    });
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
      sourcePresetChildId: edge.sourcePresetChildId ?? null,
    });
  }

  const executionTarget = imageReferences[0] ?? null;
  const executionContext = executionTarget
    ? {
        target: {
          nodeId: executionTarget.nodeId,
          title: executionTarget.title,
          imageUrl: executionTarget.imageUrl,
          assetId: executionTarget.assetId,
          role: "direct_edit_target",
          prompt: generatorNode.imageGenerator.prompt.trim() || null,
        },
        imageReferences: imageReferences.slice(1),
        presetReferences,
        preserveRules: [],
        referenceSummary: `Connected ${imageReferences.length} image reference(s), ${presetReferences.length} preset reference(s), and ${textReferences.length} text reference(s).`,
        connectionSummary: buildConnectionSummary({ imageReferences, presetReferences, textReferences }),
      }
    : null;

  return {
    generatorContext: {
      nodeId: generatorNode.id,
      nodeTitle: generatorNode.title,
      imageReferences,
      presetReferences,
      textReferences,
      connectionSummary: buildConnectionSummary({ imageReferences, presetReferences, textReferences }),
    },
    executionContext,
  };
}
