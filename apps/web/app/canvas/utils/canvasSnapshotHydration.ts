import type {
  CanvasGraphSourceImage,
  CanvasSnapshotDocument,
} from "@carver/shared";
import type {
  AddedObject,
  CanvasEdge,
  CanvasImageGeneratorOutput,
  CanvasImageGeneratorState,
  ImageConnectionRole,
  Marker,
  CanvasNode,
  MaskData,
  MaskHistory,
  PenStrokeObject,
  PenSettings,
  CanvasPresetChild,
  CanvasAssistantState,
  CanvasPresetGroupNode,
  CanvasSourceImage,
  PresetGroupCategory,
  SketchGroup,
  SketchLine,
} from "../types/canvas";
import { DEFAULT_PEN_SETTINGS, getDefaultInputPorts } from "../types/canvas";
import {
  getAssistantInputPorts,
  getImageGeneratorInputPorts,
  getTextNodeInputPorts,
} from "./canvasNodePorts";
import { isPresetGroupNode, syncPresetGroupPreview } from "./presetGroupHelpers";
import { normalizeCanvasViewportZoom } from "./canvasViewport";

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
  "assistant",
  "text",
  "generator",
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
  viewportZoom: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  activeGenerationTargetId: string | null;
  promptText: string;
  markers: Marker[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  penStrokes: PenStrokeObject[];
  penSettings: PenSettings;
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

function sanitizeMaskData(mask: unknown): MaskData | undefined {
  const source = objectValue(mask);
  if (!source) {
    return undefined;
  }

  const dataUrl = stringValue(source.dataUrl);
  if (
    !dataUrl ||
    !dataUrl.startsWith("data:image/") ||
    typeof source.width !== "number" ||
    typeof source.height !== "number" ||
    typeof source.selectionRatio !== "number" ||
    typeof source.updatedAt !== "number"
  ) {
    return undefined;
  }

  return {
    width: source.width,
    height: source.height,
    dataUrl,
    selectionRatio: source.selectionRatio,
    updatedAt: source.updatedAt,
  };
}

function sanitizeMaskHistory(maskHistory: unknown): MaskHistory | undefined {
  const source = objectValue(maskHistory);
  if (!source) {
    return undefined;
  }

  const sanitizeEntries = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry) => sanitizeMaskData(entry))
          .slice(-10)
      : [];

  return {
    past: sanitizeEntries(source.past),
    future: sanitizeEntries(source.future),
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

function sanitizeAssistantState(value: unknown): CanvasAssistantState {
  const source = objectValue(value);
  const mode = source?.mode === "result" ? "result" : "prompt";
  const outputFormat = source?.outputFormat === "text" ? "text" : "list";
  const status =
    source?.status === "generating" ||
    source?.status === "completed" ||
    source?.status === "error"
      ? source.status
      : "idle";

  return {
    mode,
    prompt: stringValue(source?.prompt) ?? "",
    response: stringValue(source?.response) ?? "",
    model: stringValue(source?.model) ?? "GPT-5 Mini",
    outputFormat,
    status,
    errorMessage: stringValue(source?.errorMessage) ?? undefined,
    lastRunAt: stringValue(source?.lastRunAt) ?? undefined,
    lastUsedContextSummary: stringValue(source?.lastUsedContextSummary) ?? undefined,
  };
}

function sanitizeImageGeneratorOutput(value: unknown): CanvasImageGeneratorOutput | null {
  const source = objectValue(value);
  const title = stringValue(source?.title);
  const prompt = stringValue(source?.prompt);
  if (!title || !prompt) {
    return null;
  }

  return {
    assetId: stringValue(source?.assetId) ?? undefined,
    title,
    prompt,
    imageUrl: sanitizeRuntimeSnapshotImageUrl(source?.imageUrl),
    width: typeof source?.width === "number" ? source.width : null,
    height: typeof source?.height === "number" ? source.height : null,
    mimeType: stringValue(source?.mimeType) ?? undefined,
    provider: stringValue(source?.provider) ?? undefined,
  };
}

function sanitizeImageGeneratorState(value: unknown): CanvasImageGeneratorState {
  const source = objectValue(value);
  const outputs = Array.isArray(source?.outputs)
    ? source.outputs
        .map((output) => sanitizeImageGeneratorOutput(output))
        .filter((output): output is CanvasImageGeneratorOutput => output !== null)
    : [];
  const outputAssetIds = Array.isArray(source?.outputAssetIds)
    ? source.outputAssetIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : outputs
        .map((output) => output.assetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0);
  const persistedStatus =
    source?.status === "queued" ||
    source?.status === "generating" ||
    source?.status === "completed" ||
    source?.status === "error"
      ? source.status
      : "idle";
  const normalizedStatus =
    persistedStatus === "queued" || persistedStatus === "generating"
      ? outputAssetIds.length > 0
        ? "completed"
        : "idle"
      : persistedStatus;

  return {
    prompt: stringValue(source?.prompt) ?? "",
    model: stringValue(source?.model) ?? "auto",
    aspectRatio:
      source?.aspectRatio === "2:3" || source?.aspectRatio === "3:2" ? source.aspectRatio : "1:1",
    outputCount:
      typeof source?.outputCount === "number" && Number.isFinite(source.outputCount)
        ? Math.min(4, Math.max(1, Math.round(source.outputCount)))
        : 1,
    status: normalizedStatus,
    outputAssetIds,
    outputs,
    selectedOutputAssetId: stringValue(source?.selectedOutputAssetId) ?? outputAssetIds[0] ?? undefined,
    errorMessage: stringValue(source?.errorMessage) ?? undefined,
    lastRunAt: stringValue(source?.lastRunAt) ?? undefined,
  };
}

function sanitizeTextNodeState(value: unknown) {
  const source = objectValue(value);
  return { content: stringValue(source?.content) ?? "" };
}

function sanitizeGraphNode(node: unknown, index: number): CanvasNode | null {
  const source = objectValue(node);
  const id = stringValue(source?.id);
  if (!id) {
    return null;
  }

  const kind =
    source?.kind === "presetGroup"
      ? "presetGroup"
      : source?.kind === "assistant"
        ? "assistant"
        : source?.kind === "image-generator"
          ? "image-generator"
        : source?.kind === "text"
          ? "text"
          : "image";
  const title =
    stringValue(source?.title) ??
    (kind === "presetGroup"
      ? "Preset group"
      : kind === "assistant"
        ? "Assistant"
        : kind === "image-generator"
          ? "Image Generator"
          : kind === "text"
            ? "Text note"
            : "Untitled image");
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
      regionMask: sanitizeMaskData(source?.regionMask),
      maskHistory: sanitizeMaskHistory(source?.maskHistory),
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

  if (kind === "assistant") {
    return {
      id,
      kind: "assistant",
      title,
      role: "assistant",
      imageUrl: "",
      prompt: nullableStringValue(source?.prompt),
      x: numberValue(source?.x, index * 32),
      y: numberValue(source?.y, index * 24),
      width: Math.max(1, numberValue(source?.width, 620)),
      height: Math.max(1, numberValue(source?.height, 540)),
      scale:
        typeof source?.scale === "number" && Number.isFinite(source.scale) && source.scale > 0
          ? source.scale
          : 1,
      sourceImage: undefined,
      regionMask: undefined,
      maskHistory: undefined,
      inputPorts: getAssistantInputPorts(),
      assistant: sanitizeAssistantState(source?.assistant),
    };
  }

  if (kind === "image-generator") {
    const imageGenerator = sanitizeImageGeneratorState(source?.imageGenerator);
    const selectedOutput =
      imageGenerator.outputs.find((output) => output.assetId === imageGenerator.selectedOutputAssetId) ??
      imageGenerator.outputs[0] ??
      null;

    return {
      id,
      kind: "image-generator",
      title,
      role: "generator",
      imageUrl: selectedOutput?.imageUrl ?? "",
      prompt: nullableStringValue(source?.prompt),
      x: numberValue(source?.x, index * 32),
      y: numberValue(source?.y, index * 24),
      width: Math.max(1, numberValue(source?.width, 540)),
      height: Math.max(1, numberValue(source?.height, 500)),
      scale:
        typeof source?.scale === "number" && Number.isFinite(source.scale) && source.scale > 0
          ? source.scale
          : 1,
      sourceImage: selectedOutput
        ? {
            assetId: selectedOutput.assetId,
            url: selectedOutput.imageUrl,
            width: selectedOutput.width,
            height: selectedOutput.height,
            mimeType: selectedOutput.mimeType,
            name: selectedOutput.title,
            quality: "original",
          }
        : undefined,
      regionMask: undefined,
      maskHistory: undefined,
      inputPorts: getImageGeneratorInputPorts(),
      imageGenerator,
    };
  }

  if (kind === "text") {
    return {
      id,
      kind: "text",
      title,
      role: "text",
      imageUrl: "",
      prompt: nullableStringValue(source?.prompt),
      x: numberValue(source?.x, index * 32),
      y: numberValue(source?.y, index * 24),
      width: Math.max(1, numberValue(source?.width, 280)),
      height: Math.max(1, numberValue(source?.height, 180)),
      scale:
        typeof source?.scale === "number" && Number.isFinite(source.scale) && source.scale > 0
          ? source.scale
          : 1,
      sourceImage: undefined,
      regionMask: undefined,
      maskHistory: undefined,
      inputPorts: getTextNodeInputPorts(),
      text: sanitizeTextNodeState(source?.text),
    };
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
    regionMask: sanitizeMaskData(source?.regionMask),
    maskHistory: sanitizeMaskHistory(source?.maskHistory),
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
    kind: source?.kind === "text" || source?.kind === "image" ? source.kind : undefined,
    sourcePortId: stringValue(source?.sourcePortId) ?? undefined,
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

function sanitizeMarker(marker: unknown): Marker | null {
  const source = objectValue(marker);
  const id = stringValue(source?.id);
  const label = stringValue(source?.label);
  if (!id || !label) {
    return null;
  }

  return {
    id,
    x: numberValue(source?.x, 0),
    y: numberValue(source?.y, 0),
    label,
    targetNodeId: stringValue(source?.targetNodeId) ?? undefined,
  };
}

function sanitizeAddedObject(object: unknown): AddedObject | null {
  const source = objectValue(object);
  const id = stringValue(source?.id);
  const label = stringValue(source?.label);
  if (!id || !label) {
    return null;
  }

  return {
    id,
    x: numberValue(source?.x, 0),
    y: numberValue(source?.y, 0),
    w: Math.max(1, numberValue(source?.w, 160)),
    h: Math.max(1, numberValue(source?.h, 160)),
    rotation: numberValue(source?.rotation, 0),
    label,
    targetNodeId: stringValue(source?.targetNodeId) ?? undefined,
    selectedAssetIds: Array.isArray(source?.selectedAssetIds)
      ? source.selectedAssetIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function sanitizeSketchLine(line: unknown): SketchLine | null {
  const source = objectValue(line);
  const id = stringValue(source?.id);
  if (!id || !Array.isArray(source?.points)) {
    return null;
  }

  const points = source.points
    .map((point) => objectValue(point))
    .filter((point): point is Record<string, unknown> => point !== null)
    .map((point) => ({
      x: numberValue(point.x, 0),
      y: numberValue(point.y, 0),
    }));

  if (points.length === 0) {
    return null;
  }

  return {
    id,
    points,
    color: stringValue(source?.color) ?? "#000000",
    width: Math.max(1, numberValue(source?.width, 2)),
    groupId: stringValue(source?.groupId) ?? undefined,
  };
}

function sanitizeSketchGroup(group: unknown): SketchGroup | null {
  const source = objectValue(group);
  const id = stringValue(source?.id);
  const nameTag = stringValue(source?.nameTag);
  const objectType = stringValue(source?.objectType);
  const bounds = objectValue(source?.bounds);
  if (!id || !nameTag || !objectType || !bounds) {
    return null;
  }

  return {
    id,
    nameTag,
    objectType: objectType as SketchGroup["objectType"],
    lineIds: Array.isArray(source?.lineIds)
      ? source.lineIds.filter((item): item is string => typeof item === "string")
      : [],
    bounds: {
      x: numberValue(bounds.x, 0),
      y: numberValue(bounds.y, 0),
      w: Math.max(1, numberValue(bounds.w, 1)),
      h: Math.max(1, numberValue(bounds.h, 1)),
    },
    selectedAssetIds: Array.isArray(source?.selectedAssetIds)
      ? source.selectedAssetIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function sanitizePenStroke(stroke: unknown): PenStrokeObject | null {
  const source = objectValue(stroke);
  const id = stringValue(source?.id);
  if (!id || source?.type !== "pen-stroke" || !Array.isArray(source?.points)) {
    return null;
  }

  const points = source.points
    .map((point) => objectValue(point))
    .filter((point): point is Record<string, unknown> => point !== null)
    .map((point) => ({
      x: numberValue(point.x, 0),
      y: numberValue(point.y, 0),
    }));

  if (points.length === 0) {
    return null;
  }

  return {
    id,
    type: "pen-stroke",
    points,
    color: stringValue(source?.color) ?? "#000000",
    opacity: numberValue(source?.opacity, 1),
    strokeWidth: Math.max(1, numberValue(source?.strokeWidth, 1)),
    drawingMode: source?.drawingMode === "geometry" ? "geometry" : "freehand",
    geometryShape:
      source?.geometryShape === "square" ||
      source?.geometryShape === "circle" ||
      source?.geometryShape === "triangle" ||
      source?.geometryShape === "arrow" ||
      source?.geometryShape === "line"
        ? source.geometryShape
        : "rectangle",
    createdAt: stringValue(source?.createdAt) ?? new Date(0).toISOString(),
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

  const markers = Array.isArray(snapshot.markers)
    ? snapshot.markers
        .map(sanitizeMarker)
        .filter((marker): marker is Marker => marker !== null)
    : [];

  const addedObjects = Array.isArray(snapshot.addedObjects)
    ? snapshot.addedObjects
        .map(sanitizeAddedObject)
        .filter((object): object is AddedObject => object !== null)
    : [];

  const sketchLines = Array.isArray(snapshot.sketchLines)
    ? snapshot.sketchLines
        .map(sanitizeSketchLine)
        .filter((line): line is SketchLine => line !== null)
    : [];

  const sketchGroups = Array.isArray(snapshot.sketchGroups)
    ? snapshot.sketchGroups
        .map(sanitizeSketchGroup)
        .filter((group): group is SketchGroup => group !== null)
    : [];

  const penStrokes = Array.isArray(snapshot.penStrokes)
    ? snapshot.penStrokes
        .map(sanitizePenStroke)
        .filter((stroke): stroke is PenStrokeObject => stroke !== null)
    : [];

  const storedPenSettings = objectValue(snapshot.penSettings);
  const penSettings: PenSettings = {
    color: stringValue(storedPenSettings?.color) ?? DEFAULT_PEN_SETTINGS.color,
    opacity: Math.min(1, Math.max(0.1, numberValue(storedPenSettings?.opacity, DEFAULT_PEN_SETTINGS.opacity))),
    strokeWidth: Math.min(42, Math.max(2, numberValue(storedPenSettings?.strokeWidth, DEFAULT_PEN_SETTINGS.strokeWidth))),
    drawingMode: storedPenSettings?.drawingMode === "geometry" ? "geometry" : "freehand",
    geometryShape:
      storedPenSettings?.geometryShape === "square" ||
      storedPenSettings?.geometryShape === "circle" ||
      storedPenSettings?.geometryShape === "triangle" ||
      storedPenSettings?.geometryShape === "arrow" ||
      storedPenSettings?.geometryShape === "line"
        ? storedPenSettings.geometryShape
        : "rectangle",
  };

  return {
    viewportZoom: normalizeCanvasViewportZoom(snapshot.camera?.zoom),
    nodes,
    edges,
    activeGenerationTargetId,
    promptText,
    markers,
    addedObjects,
    sketchLines,
    sketchGroups,
    penStrokes,
    penSettings,
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
