import type {
  CanvasGraphSourceImage,
  CanvasSnapshotDocument,
} from "@carver/shared";
import type {
  CanvasEdge,
  ImageConnectionRole,
  CanvasNode,
  CanvasPresetChild,
  CanvasPresetGroupNode,
  CanvasSourceImage,
  PresetGroupCategory,
} from "../types/canvas";
import { getDefaultInputPorts } from "../types/canvas";
import { isPresetGroupNode, syncPresetGroupPreview } from "./presetGroupHelpers";

const DEFAULT_IMAGE_NODE_WIDTH = 240;
const DEFAULT_IMAGE_NODE_HEIGHT = 180;
const DEFAULT_PRESET_GROUP_CATEGORY: PresetGroupCategory = "environment";

const CANVAS_NODE_ROLES = new Set<CanvasNode["role"]>([
  "layout",
  "style",
  "material",
  "object",
  "mask",
  "reference",
  "output",
]);

const IMAGE_CONNECTION_ROLES = new Set<ImageConnectionRole>([
  "material_reference",
  "style_reference",
  "architecture_reference",
  "structure_reference",
  "plant_reference",
  "layout_reference",
  "direct_edit_target",
  "output_result",
  "generic_reference",
]);

const PRESET_GROUP_CATEGORIES = new Set<PresetGroupCategory>([
  "environment",
  "material",
  "garden-styles",
  "plants",
  "water-features",
  "hardscape",
  "rocks-terrain",
  "decor",
  "lighting",
  "planting-zones",
]);

type HydratedCanvasSnapshotState = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  activeGenerationTargetId: string | null;
  promptText: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableStringValue(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return stringValue(value);
}

function sanitizeNodeRole(value: unknown): CanvasNode["role"] {
  return typeof value === "string" && CANVAS_NODE_ROLES.has(value as CanvasNode["role"])
    ? (value as CanvasNode["role"])
    : "reference";
}

function sanitizePresetGroupCategory(value: unknown): PresetGroupCategory {
  return typeof value === "string" && PRESET_GROUP_CATEGORIES.has(value as PresetGroupCategory)
    ? (value as PresetGroupCategory)
    : DEFAULT_PRESET_GROUP_CATEGORY;
}

function sanitizeEdgeRole(value: unknown): ImageConnectionRole | undefined {
  return typeof value === "string" && IMAGE_CONNECTION_ROLES.has(value as ImageConnectionRole)
    ? (value as ImageConnectionRole)
    : undefined;
}

export function sanitizePersistedSnapshotImageUrl(url: unknown): string {
  const normalizedUrl = stringValue(url);
  if (
    !normalizedUrl ||
    normalizedUrl.startsWith("data:") ||
    normalizedUrl.startsWith("blob:") ||
    normalizedUrl.startsWith("file:")
  ) {
    return "";
  }

  try {
    const parsed = new URL(normalizedUrl, "https://carver.local");
    if (parsed.pathname.startsWith("/api/assets/") && parsed.pathname.endsWith("/content")) {
      return normalizedUrl.startsWith("/")
        ? parsed.pathname
        : `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    // Keep non-URL values as-is after the explicit unsafe scheme checks above.
  }

  return normalizedUrl;
}

export function sanitizeRuntimeSnapshotImageUrl(url: unknown): string {
  const normalizedUrl = stringValue(url);
  if (
    !normalizedUrl ||
    normalizedUrl.startsWith("data:") ||
    normalizedUrl.startsWith("blob:") ||
    normalizedUrl.startsWith("file:")
  ) {
    return "";
  }

  return normalizedUrl;
}

function sanitizeSourceImage(sourceImage: unknown): CanvasSourceImage | undefined {
  const source = objectValue(sourceImage);
  const url = sanitizeRuntimeSnapshotImageUrl(source?.url);
  const assetId = stringValue(source?.assetId) ?? undefined;
  if (!url && !assetId) {
    return undefined;
  }

  return {
    assetId,
    url,
    width: typeof source?.width === "number" ? source.width : null,
    height: typeof source?.height === "number" ? source.height : null,
    mimeType: stringValue(source?.mimeType) ?? undefined,
    sizeBytes: typeof source?.sizeBytes === "number" ? source.sizeBytes : undefined,
    name: stringValue(source?.name) ?? undefined,
    quality: "original",
  };
}

function sanitizePresetChild(child: unknown, index: number): CanvasPresetChild | null {
  const source = objectValue(child);
  const id = stringValue(source?.id);
  const slot = stringValue(source?.slot);
  const label = stringValue(source?.label);
  if (!id || !slot || !label) {
    return null;
  }

  return {
    id,
    slot,
    label,
    imageSrc: sanitizeRuntimeSnapshotImageUrl(source?.imageSrc),
    prompt: nullableStringValue(source?.prompt),
    order: typeof source?.order === "number" && Number.isFinite(source.order) ? source.order : index,
    assetId: stringValue(source?.assetId) ?? undefined,
    sourceFolderId: stringValue(source?.sourceFolderId) ?? undefined,
    sourceImage: sanitizeSourceImage(source?.sourceImage),
    metadata: objectValue(source?.metadata) as CanvasPresetChild["metadata"] | undefined,
  };
}

function sanitizeGraphNode(node: unknown, index: number): CanvasNode | null {
  const source = objectValue(node);
  const id = stringValue(source?.id);
  if (!id) {
    return null;
  }

  const kind = source?.kind === "presetGroup" ? "presetGroup" : "image";
  const title = stringValue(source?.title) ?? (kind === "presetGroup" ? "Preset group" : "Untitled image");
  const imageUrl =
    sanitizeRuntimeSnapshotImageUrl(source?.imageUrl) ||
    sanitizeRuntimeSnapshotImageUrl(objectValue(source?.sourceImage)?.url);
  const sourceImage = sanitizeSourceImage(source?.sourceImage);

  if (kind === "presetGroup") {
    const presetGroupSource = objectValue(source?.presetGroup);
    const children = Array.isArray(presetGroupSource?.children)
      ? presetGroupSource.children
          .map((child, childIndex) => sanitizePresetChild(child, childIndex))
          .filter((child): child is CanvasPresetChild => child !== null)
      : [];

    const presetNode: CanvasPresetGroupNode = syncPresetGroupPreview({
      id,
      kind: "presetGroup",
      title,
      role: sanitizeNodeRole(source?.role),
      imageUrl,
      prompt: nullableStringValue(source?.prompt),
      x: numberValue(source?.x, index * 32),
      y: numberValue(source?.y, index * 24),
      width: Math.max(1, numberValue(source?.width, DEFAULT_IMAGE_NODE_WIDTH)),
      height: Math.max(1, numberValue(source?.height, DEFAULT_IMAGE_NODE_HEIGHT)),
      scale:
        typeof source?.scale === "number" && Number.isFinite(source.scale) && source.scale > 0
          ? source.scale
          : 1,
      sourceImage,
      inputPorts: getDefaultInputPorts(),
      presetGroup: {
        category: sanitizePresetGroupCategory(presetGroupSource?.category),
        activeChildId: nullableStringValue(presetGroupSource?.activeChildId),
        sourceFolderId: stringValue(presetGroupSource?.sourceFolderId) ?? undefined,
        children,
      },
    });

    return presetNode;
  }

  return {
    id,
    kind: "image",
    title,
    role: sanitizeNodeRole(source?.role),
    imageUrl,
    prompt: nullableStringValue(source?.prompt),
    x: numberValue(source?.x, index * 32),
    y: numberValue(source?.y, index * 24),
    width: Math.max(1, numberValue(source?.width, DEFAULT_IMAGE_NODE_WIDTH)),
    height: Math.max(1, numberValue(source?.height, DEFAULT_IMAGE_NODE_HEIGHT)),
    scale:
      typeof source?.scale === "number" && Number.isFinite(source.scale) && source.scale > 0
        ? source.scale
        : 1,
    sourceImage,
    inputPorts: getDefaultInputPorts(),
  };
}

function sanitizeGraphEdge(edge: unknown): CanvasEdge | null {
  const source = objectValue(edge);
  const id = stringValue(source?.id);
  const sourceId = stringValue(source?.sourceId);
  const targetId = stringValue(source?.targetId);
  const targetPortId = stringValue(source?.targetPortId);
  const label = stringValue(source?.label) ?? "Reference";

  if (!id || !sourceId || !targetId || !targetPortId) {
    return null;
  }

  return {
    id,
    sourceId,
    targetId,
    targetPortId,
    targetPresetChildId: nullableStringValue(source?.targetPresetChildId),
    sourcePresetChildId: nullableStringValue(source?.sourcePresetChildId),
    label,
    role: sanitizeEdgeRole(source?.role),
    fromHandle: source?.fromHandle === "left" || source?.fromHandle === "right" ? source.fromHandle : undefined,
    toHandle: source?.toHandle === "left" || source?.toHandle === "right" ? source.toHandle : undefined,
    createdAt: stringValue(source?.createdAt) ?? undefined,
  };
}

export function hydrateCanvasStateFromSnapshot(
  snapshot: CanvasSnapshotDocument,
): HydratedCanvasSnapshotState {
  const nodes = snapshot.graph.nodes
    .map((node, index) => sanitizeGraphNode(node, index))
    .filter((node): node is CanvasNode => node !== null);

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = snapshot.graph.edges
    .map(sanitizeGraphEdge)
    .filter((edge): edge is CanvasEdge => edge !== null)
    .filter((edge) => {
      const sourceNode = nodeMap.get(edge.sourceId);
      const targetNode = nodeMap.get(edge.targetId);
      if (!sourceNode || !targetNode) {
        return false;
      }

      if (edge.sourcePresetChildId) {
        if (!isPresetGroupNode(sourceNode)) {
          return false;
        }

        if (!sourceNode.presetGroup.children.some((child) => child.id === edge.sourcePresetChildId)) {
          return false;
        }
      }

      if (edge.targetPresetChildId) {
        if (!isPresetGroupNode(targetNode)) {
          return false;
        }

        if (!targetNode.presetGroup.children.some((child) => child.id === edge.targetPresetChildId)) {
          return false;
        }
      }

      return true;
    });

  const activeGenerationTargetId = (() => {
    const candidate = stringValue(snapshot.graph.activeGenerationTargetId);
    if (!candidate) {
      return null;
    }

    const targetNode = nodeMap.get(candidate);
    return targetNode && !isPresetGroupNode(targetNode) ? targetNode.id : null;
  })();

  const promptText =
    activeGenerationTargetId && nodeMap.get(activeGenerationTargetId) && !isPresetGroupNode(nodeMap.get(activeGenerationTargetId)!)
      ? nodeMap.get(activeGenerationTargetId)!.prompt ?? ""
      : "";

  return {
    nodes,
    edges,
    activeGenerationTargetId,
    promptText,
  };
}

export function sanitizeSourceImageForSnapshot(
  sourceImage?: CanvasSourceImage,
): CanvasGraphSourceImage | undefined {
  const sanitizedUrl = sanitizePersistedSnapshotImageUrl(sourceImage?.url);
  if (!sanitizedUrl && !sourceImage?.assetId) {
    return undefined;
  }

  return {
    url: sanitizedUrl || undefined,
    assetId: sourceImage?.assetId,
    width: sourceImage?.width ?? null,
    height: sourceImage?.height ?? null,
    mimeType: sourceImage?.mimeType,
    sizeBytes: sourceImage?.sizeBytes,
    name: sourceImage?.name,
    quality: "original",
  };
}
