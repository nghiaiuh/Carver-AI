"use client";

import type {
  AddedObject,
  CanvasEdge,
  CanvasNode,
  Marker,
  PenStrokeObject,
  CanvasPresetGroupNode,
  SketchGroup,
  SketchLine,
  ImageConnectionRole,
} from "../types/canvas";
import type {
  CanvasGenerationContext,
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CanvasSnapshotDocument,
} from "@carver/shared";
import { createEmptyCanvasSnapshotDocument } from "@carver/shared";
import { isPresetGroupNode } from "./presetGroupHelpers";
import {
  sanitizePersistedSnapshotImageUrl,
  sanitizeSourceImageForSnapshot,
} from "./canvasSnapshotHydration";

function normalizeRole(role?: string | null): ImageConnectionRole {
  return (role as ImageConnectionRole) ?? "generic_reference";
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

    const sourceNode = nodes.find((node) => node.id === edge.sourceId);
    if (!sourceNode || isPresetGroupNode(sourceNode)) continue;

    const key = `${edge.sourceId}:${edge.sourcePresetChildId ?? "node"}:${edge.targetPresetChildId ?? "target"}`;
    if (references.has(key)) continue;

    references.set(key, {
      nodeId: sourceNode.id,
      title: sourceNode.title,
      imageUrl: sourceNode.imageUrl,
      assetId: sourceNode.sourceImage?.assetId,
      role: normalizeRole(edge.role),
      sourcePresetChildId: edge.sourcePresetChildId ?? null,
    });
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
  if (!target || isPresetGroupNode(target)) return null;

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
}): CanvasSnapshotDocument {
  const snapshot = createEmptyCanvasSnapshotDocument();

  return {
    ...snapshot,
    graph: {
      activeGenerationTargetId: params.activeGenerationTargetId,
      nodes: params.nodes.map((node) => ({
        id: node.id,
        kind: isPresetGroupNode(node) ? "presetGroup" : "image",
        title: node.title,
        role: node.role,
        imageUrl: sanitizePersistedNodeImageUrl(node),
        prompt: node.prompt,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
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
      })),
      edges: params.edges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
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
    markers: (params.markers ?? []).map((marker) => ({
      id: marker.id,
      x: marker.x,
      y: marker.y,
      label: marker.label,
    })),
    addedObjects: (params.addedObjects ?? []).map((object) => ({
      id: object.id,
      x: object.x,
      y: object.y,
      w: object.w,
      h: object.h,
      rotation: object.rotation,
      label: object.label,
      selectedAssetIds: object.selectedAssetIds,
    })),
    sketchLines: (params.sketchLines ?? []).map((line) => ({
      id: line.id,
      points: line.points.map((point) => ({ x: point.x, y: point.y })),
      color: line.color,
      width: line.width,
      groupId: line.groupId,
    })),
    sketchGroups: (params.sketchGroups ?? []).map((group) => ({
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
      createdAt: stroke.createdAt,
    })),
  };
}
