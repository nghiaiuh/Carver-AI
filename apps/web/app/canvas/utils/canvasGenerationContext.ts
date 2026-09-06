"use client";

import type {
  AddedObject,
  CanvasEdge,
  CanvasImageGeneratorOutput,
  CanvasNode,
  Marker,
  PenSettings,
  PenStrokeObject,
  CanvasPresetGroupNode,
  SketchGroup,
  SketchLine,
  ImageConnectionRole,
} from "../types/canvas";
import {
  isCanvasImageGeneratorNode,
  isCanvasImageOutputGalleryNode,
  isCanvasTextNode,
  isCanvasContextGroupNode,
  isCanvasCameraShotSetNode,
} from "../types/canvas";
import type {
  CanvasGenerationContext,
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CanvasSnapshotDocument,
} from "@carver/shared";
import { createEmptyCanvasSnapshotDocument, normalizeCameraShotDirective } from "@carver/shared";
import { isAssistantNode, isPresetGroupNode } from "./presetGroupHelpers";
import { resolveContextGroupItems } from "./contextGroupHelpers";
import { getCanvasEdgeSourceNodes } from "./canvasNodeGroups";
import { normalizeCanvasViewportZoom } from "./canvasViewport";
import {
  sanitizePersistedSnapshotImageUrl,
  sanitizeSourceImageForSnapshot,
} from "./canvasSnapshotHydration";

function normalizeRole(role?: string | null): ImageConnectionRole {
  return (role as ImageConnectionRole) ?? "generic_reference";
}

function toSnapshotReferenceRole(role: ImageConnectionRole) {
  if (role === "structure_reference") return "architecture_reference" as const;
  if (role === "output_result") return "generic_reference" as const;
  return role;
}

function sanitizePersistedNodeImageUrl(node: CanvasNode) {
  if (node.sourceImage?.assetId) {
    return "";
  }

  return (
    sanitizePersistedSnapshotImageUrl(node.imageUrl) ||
    sanitizePersistedSnapshotImageUrl(node.sourceImage?.url)
  );
}

function sanitizePersistedPresetImageUrl(child: CanvasPresetGroupNode["presetGroup"]["children"][number]) {
  if (child.assetId || child.sourceImage?.assetId) {
    return "";
  }

  return (
    sanitizePersistedSnapshotImageUrl(child.imageSrc) ||
    sanitizePersistedSnapshotImageUrl(child.sourceImage?.url)
  );
}

function sanitizePersistedGeneratorOutput(output: CanvasImageGeneratorOutput) {
  return {
    ...output,
    imageUrl: output.assetId ? "" : sanitizePersistedSnapshotImageUrl(output.imageUrl),
  };
}

function sanitizeMaskDataForSnapshot(mask: CanvasNode["regionMask"]) {
  if (
    !mask ||
    !Number.isFinite(mask.width) ||
    !Number.isFinite(mask.height) ||
    typeof mask.dataUrl !== "string" ||
    !mask.dataUrl.startsWith("data:image/") ||
    !Number.isFinite(mask.selectionRatio) ||
    !Number.isFinite(mask.updatedAt)
  ) {
    return undefined;
  }

  return {
    width: mask.width,
    height: mask.height,
    dataUrl: mask.dataUrl,
    selectionRatio: mask.selectionRatio,
    updatedAt: mask.updatedAt,
  };
}

function sanitizeMaskHistoryForSnapshot(maskHistory: CanvasNode["maskHistory"]) {
  if (!maskHistory) {
    return undefined;
  }

  const sanitizeMaskEntry = (mask: CanvasNode["regionMask"]) =>
    sanitizeMaskDataForSnapshot(mask) ?? null;

  return {
    past: maskHistory.past.map(sanitizeMaskEntry).slice(-10),
    future: maskHistory.future.map(sanitizeMaskEntry).slice(-10),
  };
}

function resolveSnapshotGeneratedOutput(sourceNode: CanvasNode, nodes: CanvasNode[]) {
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

function snapshotCameraShotSet(params: {
  node: Extract<CanvasNode, { kind: "camera-shot-set" }>;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}) {
  const sourceEdges = params.edges.filter(
    (edge) => edge.targetId === params.node.id && !edge.sourceGroupId,
  );
  const sourceNode = sourceEdges.length === 1
    ? params.nodes.find((node) => node.id === sourceEdges[0]?.sourceId)
    : undefined;
  const sourceOutput = sourceNode ? resolveSnapshotGeneratedOutput(sourceNode, params.nodes) : null;
  const sourceWidth = sourceOutput?.width ?? sourceNode?.sourceImage?.width;
  const sourceHeight = sourceOutput?.height ?? sourceNode?.sourceImage?.height;
  const aspectRatio =
    typeof sourceWidth === "number" && Number.isFinite(sourceWidth) && sourceWidth > 0 &&
    typeof sourceHeight === "number" && Number.isFinite(sourceHeight) && sourceHeight > 0
      ? sourceWidth / sourceHeight
      : 1;
  const inputAssetIds = [sourceOutput?.assetId ?? sourceNode?.sourceImage?.assetId].filter(
    (assetId): assetId is string => typeof assetId === "string" && assetId.length > 0,
  );

  return {
    mode: params.node.cameraShotSet.mode,
    cameras: params.node.cameraShotSet.cameras.map((camera, order) => {
      const shot = params.node.cameraShotSet.mode === "plan"
        ? {
            shotSetNodeId: params.node.id,
            shotId: camera.id,
            shotName: camera.name,
            order,
            mode: "plan" as const,
            plan: { ...camera.plan },
          }
        : {
            shotSetNodeId: params.node.id,
            shotId: camera.id,
            shotName: camera.name,
            order,
            mode: "orbit" as const,
            orbit: { ...camera.orbit },
          };

      try {
        return {
          ...camera,
          plan: { ...camera.plan },
          orbit: { ...camera.orbit },
          cameraSpec: normalizeCameraShotDirective({ shot, aspectRatio, inputAssetIds }).cameraSpec,
        };
      } catch {
        // Keep a legacy-compatible raw camera instead of persisting invalid geometry.
        const { cameraSpec: _cameraSpec, ...legacyCamera } = camera;
        return { ...legacyCamera, plan: { ...camera.plan }, orbit: { ...camera.orbit } };
      }
    }),
    selectedCameraId: params.node.cameraShotSet.selectedCameraId,
    cameraDisplayMode: params.node.cameraShotSet.cameraDisplayMode,
  };
}

export function getInboundEdgesForTarget(targetNodeId: string, edges: CanvasEdge[]) {
  return edges.filter((edge) => edge.targetId === targetNodeId);
}

export function resolveConnectedImageReferences(
  targetNodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasGenerationImageReference[] {
  const references = new Map<string, CanvasGenerationImageReference>();

  for (const edge of getInboundEdgesForTarget(targetNodeId, edges)) {
    if (edge.sourcePresetChildId) continue;

    const sourceNodes = getCanvasEdgeSourceNodes(nodes, edge);
    for (const sourceNode of sourceNodes) {
      if (isPresetGroupNode(sourceNode) || isAssistantNode(sourceNode) || isCanvasTextNode(sourceNode)) continue;

    if (isCanvasContextGroupNode(sourceNode)) {
      for (const item of resolveContextGroupItems(sourceNode, nodes)) {
        const key = `${sourceNode.id}:${item.id}`;
        if (references.has(key)) continue;
        references.set(key, {
          nodeId: sourceNode.id,
          title: item.title,
          imageUrl: item.imageUrl,
          assetId: item.assetId,
          role: normalizeRole(edge.role ?? item.role),
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
    const gallerySource = galleryGeneratorNodeId
      ? nodes.find(
          (candidate): candidate is Extract<CanvasNode, { kind: "image-generator" }> =>
            candidate.id === galleryGeneratorNodeId &&
            isCanvasImageGeneratorNode(candidate),
        )
      : null;
    const galleryOutput = gallerySource?.imageGenerator.outputs.find(
      (output) => output.assetId === gallerySelectedOutputAssetId,
    ) ?? gallerySource?.imageGenerator.outputs[0];

    const key = `${sourceNode.id}:${edge.sourcePresetChildId ?? "node"}:${edge.targetPresetChildId ?? "target"}`;
    if (references.has(key)) continue;

    references.set(key, {
      nodeId: sourceNode.id,
      title: sourceNode.title,
      imageUrl: galleryOutput?.imageUrl ?? sourceNode.imageUrl,
      assetId: galleryOutput?.assetId ?? sourceNode.sourceImage?.assetId,
      role: normalizeRole(edge.role),
      sourcePresetChildId: edge.sourcePresetChildId ?? null,
    });
    }
  }

  return [...references.values()];
}

function findPresetChild(node: CanvasPresetGroupNode, childId: string) {
  return node.presetGroup.children.find((child) => child.id === childId) ?? null;
}

export function resolveConnectedPresetReferences(
  targetNodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasGenerationPresetReference[] {
  const explicitChildKeys = new Set<string>();
  const references = new Map<string, CanvasGenerationPresetReference>();

  const inboundEdges = getInboundEdgesForTarget(targetNodeId, edges);

  for (const edge of inboundEdges) {
    if (!edge.sourcePresetChildId) continue;

    const sourceNode = nodes.find((node) => node.id === edge.sourceId);
    if (!sourceNode || !isPresetGroupNode(sourceNode)) continue;

    const child = findPresetChild(sourceNode, edge.sourcePresetChildId);
    if (!child) continue;

    const key = `${sourceNode.id}:${child.id}`;
    explicitChildKeys.add(key);
      references.set(key, {
        nodeId: sourceNode.id,
        category: sourceNode.presetGroup.category,
        childId: child.id,
        slot: child.slot,
        label: child.label,
        imageSrc: child.imageSrc,
        assetId: child.assetId ?? child.sourceImage?.assetId,
        role: normalizeRole(edge.role ?? child.metadata?.roleHint),
      });
  }

  for (const edge of inboundEdges) {
    if (edge.sourcePresetChildId) continue;

    const sourceNode = nodes.find((node) => node.id === edge.sourceId);
    if (!sourceNode || !isPresetGroupNode(sourceNode)) continue;

    for (const child of sourceNode.presetGroup.children) {
      const childKey = `${sourceNode.id}:${child.id}`;
      if (explicitChildKeys.has(childKey)) continue;
      if (references.has(childKey)) continue;

      references.set(childKey, {
        nodeId: sourceNode.id,
        category: sourceNode.presetGroup.category,
        childId: child.id,
        slot: child.slot,
        label: child.label,
        imageSrc: child.imageSrc,
        assetId: child.assetId ?? child.sourceImage?.assetId,
        role: normalizeRole(child.metadata?.roleHint ?? edge.role),
      });
    }
  }

  return [...references.values()];
}

export function buildCanvasGenerationContext(
  targetNodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  promptText: string,
): CanvasGenerationContext | null {
  const target = nodes.find((node) => node.id === targetNodeId);
  if (
    !target ||
    isPresetGroupNode(target) ||
    isCanvasContextGroupNode(target) ||
    isAssistantNode(target) ||
    isCanvasTextNode(target) ||
    isCanvasImageGeneratorNode(target) ||
    isCanvasImageOutputGalleryNode(target) ||
    isCanvasCameraShotSetNode(target)
  ) {
    return null;
  }

  const imageReferences = resolveConnectedImageReferences(targetNodeId, nodes, edges);
  const presetReferences = resolveConnectedPresetReferences(targetNodeId, nodes, edges);
  const preserveRules = [
    "Preserve original camera angle.",
    "Preserve original perspective.",
    "Preserve object scale and proportions.",
  ];

  return {
    target: {
      nodeId: target.id,
      title: target.title,
      imageUrl: target.imageUrl,
      assetId: target.sourceImage?.assetId,
      role: "direct_edit_target",
      prompt: promptText.trim() || target.prompt || null,
    },
    imageReferences,
    presetReferences,
    preserveRules,
    referenceSummary: `Connected ${imageReferences.length} image reference(s) and ${presetReferences.length} preset reference(s).`,
    connectionSummary: [
      `Target: ${target.title}`,
      imageReferences.length > 0 ? `Image references: ${imageReferences.map((item) => item.title).join(", ")}` : "Image references: none",
      presetReferences.length > 0 ? `Preset references: ${presetReferences.map((item) => item.label).join(", ")}` : "Preset references: none",
    ].join(" "),
  };
}

export function buildCanvasSnapshotWithGraph(params: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  activeGenerationTargetId: string | null;
  markers?: Marker[];
  addedObjects?: AddedObject[];
  sketchLines?: SketchLine[];
  sketchGroups?: SketchGroup[];
  penStrokes?: PenStrokeObject[];
  penSettings?: PenSettings;
  viewportZoom?: number;
}): CanvasSnapshotDocument {
  const snapshot = createEmptyCanvasSnapshotDocument();
  const addedObjects = params.addedObjects ?? [];
  const sketchGroups = params.sketchGroups ?? [];
  const markers = params.markers ?? [];
  const contextGroups = params.nodes.filter(isCanvasContextGroupNode);

  // Scene Graph Lite is deterministic: user-created objects, marks, and sketch
  // groups become trusted scene evidence without an extra vision-model charge.
  const semanticObjects = addedObjects.map((object) => ({
    id: object.id,
    assetId: object.selectedAssetIds?.[0],
    kind: object.label,
    label: object.label,
    bounds: { x: object.x, y: object.y, width: object.w, height: object.h },
    rotation: object.rotation,
    metadata: { coordinateSpace: "target-image-percent", source: "canvas-object" },
  }));
  const semanticRegions = [
    ...sketchGroups.map((group) => ({
      id: group.id,
      label: group.nameTag,
      bounds: {
        x: group.bounds.x,
        y: group.bounds.y,
        width: group.bounds.w,
        height: group.bounds.h,
      },
      editable: false,
      metadata: { objectType: group.objectType, source: "sketch-group" },
    })),
    ...markers.map((marker) => ({
      id: marker.id,
      label: marker.label,
      bounds: { x: marker.x, y: marker.y, width: 1, height: 1 },
      editable: true,
      metadata: { coordinateSpace: "target-image-percent", source: "canvas-marker" },
    })),
  ];
  const semanticLocks = [
    ...(params.activeGenerationTargetId
      ? [
          {
            id: `layout-${params.activeGenerationTargetId}`,
            targetType: "global" as const,
            type: "layout" as const,
            strength: "hard" as const,
            reason: "Preserve the selected site image layout by default.",
          },
          {
            id: `camera-${params.activeGenerationTargetId}`,
            targetType: "camera" as const,
            type: "camera" as const,
            strength: "hard" as const,
            reason: "Preserve the selected site image camera and perspective by default.",
          },
        ]
      : []),
    ...semanticObjects.map((object) => ({
      id: `object-position-${object.id}`,
      targetType: "object" as const,
      targetId: object.id,
      type: "position" as const,
      strength: "hard" as const,
      reason: "Preserve this user-placed landscape object unless it is explicitly targeted.",
    })),
    ...sketchGroups.map((group) => ({
      id: `sketch-shape-${group.id}`,
      targetType: "region" as const,
      targetId: group.id,
      type: "shape" as const,
      strength: "soft" as const,
      reason: "Keep the user sketch as a spatial design cue.",
    })),
  ];
  const contextReferences = contextGroups.flatMap((group) =>
    resolveContextGroupItems(group, params.nodes).map((item) => ({
      assetId: item.assetId,
      label: item.title,
      role: toSnapshotReferenceRole(item.role),
      objectId: group.id,
      notes: group.contextGroup.kind,
    })),
  );

  return {
    ...snapshot,
    camera: {
      ...snapshot.camera,
      zoom: normalizeCanvasViewportZoom(params.viewportZoom),
    },
    objects: semanticObjects,
    regions: semanticRegions,
    locks: semanticLocks,
    references: contextReferences,
    graph: {
      activeGenerationTargetId: params.activeGenerationTargetId,
      nodes: params.nodes.map((node) => ({
        id: node.id,
        kind: isPresetGroupNode(node)
          ? "presetGroup"
          : isCanvasContextGroupNode(node)
            ? "context-group"
          : isAssistantNode(node)
            ? "assistant"
            : isCanvasTextNode(node)
              ? "text"
              : isCanvasImageGeneratorNode(node)
                ? "image-generator"
                : isCanvasImageOutputGalleryNode(node)
                  ? "image-output-gallery"
                  : isCanvasCameraShotSetNode(node)
                    ? "camera-shot-set"
                  : "image",
        title: node.title,
        role: node.role,
        imageUrl: sanitizePersistedNodeImageUrl(node),
        prompt: node.prompt,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        groupId: node.groupId,
        groupLabel: node.groupLabel,
        groupColor: node.groupColor,
        scale: node.scale,
        sourceImage: sanitizeSourceImageForSnapshot(node.sourceImage),
        regionMask: sanitizeMaskDataForSnapshot(node.regionMask),
        maskHistory: sanitizeMaskHistoryForSnapshot(node.maskHistory),
        presetGroup: isPresetGroupNode(node)
          ? {
              category: node.presetGroup.category,
              activeChildId: node.presetGroup.activeChildId,
              sourceFolderId: node.presetGroup.sourceFolderId,
              children: node.presetGroup.children.map((child) => ({
                id: child.id,
                slot: child.slot,
                label: child.label,
                imageSrc: sanitizePersistedPresetImageUrl(child),
                prompt: child.prompt,
                order: child.order,
                assetId: child.assetId,
                sourceFolderId: child.sourceFolderId,
                sourceImage: sanitizeSourceImageForSnapshot(child.sourceImage),
                metadata: child.metadata,
              })),
            }
          : undefined,
        contextGroup: isCanvasContextGroupNode(node)
          ? {
              kind: node.contextGroup.kind,
              description: node.contextGroup.description,
              items: node.contextGroup.items.map((item) => ({
                ...item,
                imageUrl: sanitizePersistedSnapshotImageUrl(item.imageUrl),
              })),
            }
          : undefined,
        cameraShotSet: isCanvasCameraShotSetNode(node)
          ? snapshotCameraShotSet({ node, nodes: params.nodes, edges: params.edges })
          : undefined,
        assistant: isAssistantNode(node) ? node.assistant : undefined,
        imageGenerator: isCanvasImageGeneratorNode(node)
          ? {
              ...node.imageGenerator,
              outputs: node.imageGenerator.outputs.map(sanitizePersistedGeneratorOutput),
            }
          : undefined,
        imageOutputGallery: isCanvasImageOutputGalleryNode(node)
          ? node.imageOutputGallery
          : undefined,
        text: isCanvasTextNode(node) ? node.text : undefined,
      })),
      edges: params.edges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        sourceGroupId: edge.sourceGroupId,
        targetId: edge.targetId,
        kind: edge.kind,
        sourcePortId: edge.sourcePortId,
        targetPortId: edge.targetPortId,
        targetPresetChildId: edge.targetPresetChildId ?? null,
        sourcePresetChildId: edge.sourcePresetChildId ?? null,
        label: edge.label,
        role: edge.role,
        fromHandle: edge.fromHandle,
        toHandle: edge.toHandle,
        createdAt: edge.createdAt,
      })),
    },
    markers: markers.map((marker) => ({
      id: marker.id,
      x: marker.x,
      y: marker.y,
      label: marker.label,
      targetNodeId: marker.targetNodeId,
    })),
    addedObjects: addedObjects.map((object) => ({
      id: object.id,
      x: object.x,
      y: object.y,
      w: object.w,
      h: object.h,
      rotation: object.rotation,
      label: object.label,
      targetNodeId: object.targetNodeId,
      selectedAssetIds: object.selectedAssetIds,
    })),
    sketchLines: (params.sketchLines ?? []).map((line) => ({
      id: line.id,
      points: line.points.map((point) => ({ x: point.x, y: point.y })),
      color: line.color,
      width: line.width,
      groupId: line.groupId,
    })),
    sketchGroups: sketchGroups.map((group) => ({
      id: group.id,
      nameTag: group.nameTag,
      objectType: group.objectType,
      lineIds: [...group.lineIds],
      bounds: {
        x: group.bounds.x,
        y: group.bounds.y,
        w: group.bounds.w,
        h: group.bounds.h,
      },
      selectedAssetIds: [...group.selectedAssetIds],
    })),
    penStrokes: (params.penStrokes ?? []).map((stroke) => ({
      id: stroke.id,
      type: "pen-stroke",
      points: stroke.points.map((point) => ({ x: point.x, y: point.y })),
      color: stroke.color,
      opacity: stroke.opacity,
      strokeWidth: stroke.strokeWidth,
      drawingMode: stroke.drawingMode,
      geometryShape: stroke.geometryShape,
      createdAt: stroke.createdAt,
    })),
    penSettings: params.penSettings
      ? {
          color: params.penSettings.color,
          opacity: params.penSettings.opacity,
          strokeWidth: params.penSettings.strokeWidth,
          drawingMode: params.penSettings.drawingMode,
          geometryShape: params.penSettings.geometryShape,
        }
      : snapshot.penSettings,
  };
}
