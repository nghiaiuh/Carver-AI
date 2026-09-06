import type {
  CanvasGenerationContext,
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CameraShotGenerationContext,
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
import { getCanvasEdgeSourceNodes } from "./canvasNodeGroups";

type InboundEdge = {
  id: string;
  sourceId: string;
  sourceGroupId?: string;
  targetId: string;
  sourcePresetChildId?: string | null;
  sourcePortId?: string;
  targetPortId?: string;
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

/**
 * Resolves the output currently selected on an Image Generator or its gallery.
 * Canvas consumers use this instead of looking for image-node fields that these
 * derived nodes intentionally do not persist.
 */
export function resolveGeneratedNodeOutput(sourceNode: CanvasNode, nodes: CanvasNode[]) {
  const generatorNode = isCanvasImageGeneratorNode(sourceNode)
    ? sourceNode
    : isCanvasImageOutputGalleryNode(sourceNode)
      ? nodes.find(
          (candidate): candidate is Extract<CanvasNode, { kind: "image-generator" }> =>
            candidate.id === sourceNode.imageOutputGallery.generatorNodeId &&
            isCanvasImageGeneratorNode(candidate),
        )
      : null;
  if (!generatorNode) return null;

  const selectedAssetId = isCanvasImageOutputGalleryNode(sourceNode)
    ? sourceNode.imageOutputGallery.selectedOutputAssetId
    : generatorNode.imageGenerator.selectedOutputAssetId;

  return generatorNode.imageGenerator.outputs.find((output) => output.assetId === selectedAssetId)
    ?? generatorNode.imageGenerator.outputs[0]
    ?? null;
}

function buildCameraShotSetContext(params: {
  node: Extract<CanvasNode, { kind: "camera-shot-set" }>;
  nodes: CanvasNode[];
  edges: InboundEdge[];
  prompt: string;
}): CameraShotGenerationContext | null {
  const inputEdge = sortEdges(params.edges.filter((edge) => edge.targetId === params.node.id))[0];
  const sourceNode = inputEdge ? params.nodes.find((node) => node.id === inputEdge.sourceId) : null;
  if (!sourceNode || isCanvasTextNode(sourceNode) || isAssistantNode(sourceNode) || isCanvasCameraShotSetNode(sourceNode)) {
    return null;
  }

  const generatedOutput = resolveGeneratedNodeOutput(sourceNode, params.nodes);
  const assetId = resolveConnectedImageAssetId({
    imageUrl: generatedOutput?.imageUrl || sourceNode.imageUrl || sourceNode.sourceImage?.url || "",
    sourceImageUrl: sourceNode.sourceImage?.url,
    assetId: generatedOutput?.assetId ?? sourceNode.sourceImage?.assetId,
  });
  // Multi-angle is an image-edit operation. Its source must survive browser
  // reloads and signed gateway URL refreshes, so never build a camera request
  // from a transient URL alone.
  if (!assetId) return null;

  const shots = params.node.cameraShotSet.cameras
    .filter((camera) => camera.isVisible)
    .map((camera, order) => ({
      shotSetNodeId: params.node.id,
      shotId: camera.id,
      shotName: camera.name,
      order,
      mode: params.node.cameraShotSet.mode,
      ...(params.node.cameraShotSet.mode === "plan"
        ? { plan: { ...camera.plan } }
        : { orbit: { ...camera.orbit } }),
    }));
  if (shots.length === 0) return null;

  return {
    shotSetNodeId: params.node.id,
    source: {
      nodeId: sourceNode.id,
      title: sourceNode.title,
      imageUrl: "",
      assetId,
      role: "direct_edit_target",
      prompt: params.prompt.trim() || null,
    },
    shots,
  };
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
  let cameraShotSet: CameraShotGenerationContext | null = null;

  for (const edge of getInboundEdgesForGenerator(generatorNodeId, edges)) {
    const sourceNodes = getCanvasEdgeSourceNodes(nodes, edge);
    for (const sourceNode of sourceNodes) {
      if (isImageGeneratorNode(sourceNode)) continue;

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
        sourceKind: isCanvasTextNode(sourceNode)
          ? "text"
          : isCanvasCameraShotSetNode(sourceNode)
            ? "camera-shot-set"
            : "assistant",
      });
      if (isCanvasCameraShotSetNode(sourceNode) && !cameraShotSet) {
        cameraShotSet = buildCameraShotSetContext({
          node: sourceNode,
          nodes,
          edges,
          prompt: generatorNode.imageGenerator.prompt,
        });
      }
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

    const galleryOutput = resolveGeneratedNodeOutput(sourceNode, nodes);

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
  }

  const executionTarget = cameraShotSet?.source ?? imageReferences[0] ?? null;
  const executionImageReferences = cameraShotSet
    ? imageReferences.filter((reference) => reference.assetId !== cameraShotSet.source.assetId && reference.nodeId !== cameraShotSet.source.nodeId)
    : imageReferences;
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
        imageReferences: executionImageReferences.filter((reference) => reference.nodeId !== executionTarget.nodeId),
        presetReferences,
        preserveRules: [],
        referenceSummary: `Connected ${executionImageReferences.length} image reference(s), ${presetReferences.length} preset reference(s), and ${textReferences.length} text reference(s).`,
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
      ...(cameraShotSet ? { cameraShotSet } : {}),
      connectionSummary: buildConnectionSummary({ imageReferences, presetReferences, textReferences }),
    },
    executionContext,
  };
}
