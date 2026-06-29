/*
 * useCanvasWorkspace
 *
 * Coordinator hook for the canvas editor.
 * Owns all canvas state, derived values, and action callbacks.
 * CanvasWorkspace.tsx consumes this hook and renders pure JSX only.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasLibrary } from "./useCanvasLibrary";
import type { CanvasGenerationAssistantMessage, GeneratedCanvasImage } from "@carver/shared";
import { buildCanvasThemeStyle } from "../components/core/canvasTheme";
import { DEFAULT_CANVAS_LANGUAGE } from "../i18n";
import useResizablePanel from "./useResizablePanel";
import { gsap } from "../../components/gsapSetup";
import type { LibraryAsset as CanvasLibraryAsset } from "../types/library";
import {
  type CanvasPresetChild,
  type CanvasPresetGroupNode,
  DEFAULT_CANVAS_THEME,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PEN_SETTINGS,
  DEFAULT_RIGHT_PANEL_WIDTH,
  type PresetGroupCategory,
  LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_RIGHT_PANEL_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
  MIN_RIGHT_PANEL_WIDTH,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  getDefaultInputPorts,
  inferObjectTypeFromTag,
} from "../types/canvas";
import { MAX_MASK_HISTORY } from "../utils/regionMask";
import { buildCanvasGenerationContext, buildCanvasSnapshotWithGraph } from "../utils/generationContext";
import type {
  AddedObject,
  CanvasEdge,
  MaskData,
  CanvasNode,
  EditorTool,
  LeftSidebarPanelId,
  Marker,
  PenSettings,
  PenStrokeObject,
  RegionBrushMode,
  RegionSelectionTool,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../types/canvas";
import {
  isPresetGroupNode,
  removePresetChildAndCleanupEdges,
  reorderPresetChildren,
  syncPresetGroupPreview,
  upsertPresetChild,
} from "../utils/presetGroup";

function getSelectedNodeFromSelection(nodes: CanvasNode[], selectedItem: SelectedItem) {
  if (selectedItem.type !== "node" && selectedItem.type !== "image" && selectedItem.type !== "presetChild") {
    return null;
  }

  const nodeId = selectedItem.type === "presetChild" ? selectedItem.nodeId : selectedItem.id;
  return nodes.find((node) => node.id === nodeId) ?? null;
}

type PendingPresetGroupInsert = {
  category: PresetGroupCategory;
  title: string;
  children: CanvasPresetChild[];
  sourceFolderId?: string;
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const INITIAL_MARKERS: Marker[] = [];

const INITIAL_OBJECTS: AddedObject[] = [];

// ── Animation helper (side-effect, canvas-local) ───────────────────────────

function animateIn(selector: string) {
  window.setTimeout(() => {
    const items = document.querySelectorAll(selector);
    gsap.fromTo(
      items,
      { y: 10, scale: 0.96, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.38, stagger: 0.05, ease: "power3.out" },
    );
  }, 20);
}

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

async function resolveImageUrlForGeneration(imageUrl: string) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (typeof window === "undefined") return imageUrl;

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

function getGeneratedNodeSize(image: GeneratedCanvasImage, targetNode: CanvasNode) {
  const sourceWidth = image.width ?? targetNode.sourceImage?.width ?? targetNode.width;
  const sourceHeight = image.height ?? targetNode.sourceImage?.height ?? targetNode.height;
  const ratio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : targetNode.width / targetNode.height;
  const width = Math.min(Math.max(targetNode.width, 260), 420);
  const height = width / ratio;

  if (height <= 320) return { width, height };

  return {
    width: 320 * ratio,
    height: 320,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCanvasWorkspace() {
  // ── DOM Refs ────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const leftSidebarPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // ── Canvas entities ─────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: "none" });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [gridVisible, setGridVisible] = useState(true);
  const [markers, setMarkers] = useState<Marker[]>(INITIAL_MARKERS);
  const [addedObjects, setAddedObjects] = useState<AddedObject[]>(INITIAL_OBJECTS);
  const [sketchLines, setSketchLines] = useState<SketchLine[]>([]);
  const [sketchGroups, setSketchGroups] = useState<SketchGroup[]>([]);
  const [penStrokes, setPenStrokes] = useState<PenStrokeObject[]>([]);
  const [penSettings, setPenSettings] = useState<PenSettings>(DEFAULT_PEN_SETTINGS);
  const [brushMode, setBrushMode] = useState<RegionBrushMode>("add");
  const [regionSelectionTool, setRegionSelectionTool] = useState<RegionSelectionTool>("brush");
  const [brushSize, setBrushSize] = useState<number>(80);
  const [brushSoftness, setBrushSoftness] = useState<number>(35);
  const [maskTrigger, setMaskTrigger] = useState<{ action: "invert" | "clear", timestamp: number } | null>(null);
  const [selectedSketchLineIds, setSelectedSketchLineIds] = useState<string[]>([]);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  // ── Generation / AI ─────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [activeGenerationTargetId, setActiveGenerationTargetId] = useState<string | null>(null);
  const [generationAssistantMessages, setGenerationAssistantMessages] = useState<CanvasGenerationAssistantMessage[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showRealityCheckPanel, setShowRealityCheckPanel] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [leftSidebar, setLeftSidebar] = useState<{ open: boolean; panel: LeftSidebarPanelId }>({
    open: true,
    panel: "library",
  });
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [canvasThemeColor, setCanvasThemeColor] = useState(DEFAULT_CANVAS_THEME);
  const [language, setLanguage] = useState(DEFAULT_CANVAS_LANGUAGE);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState<string | null>(null);
  const [pendingLibraryInsertAsset, setPendingLibraryInsertAsset] =
    useState<CanvasLibraryAsset | null>(null);
  const [pendingPresetGroupInsert, setPendingPresetGroupInsert] =
    useState<PendingPresetGroupInsert | null>(null);
  const uploadedLibraryAssetUrlsRef = useRef(new Map<string, string>());

  // ── Sub-hooks ───────────────────────────────────────────────────────────────
  const leftSidebarResize = useResizablePanel({
    panelRef: leftSidebarPanelRef,
    side: "left",
    defaultWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
    minWidth: MIN_LEFT_SIDEBAR_WIDTH,
    maxWidth: MAX_LEFT_SIDEBAR_WIDTH,
    storageKey: LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  });

  const rightPanelResize = useResizablePanel({
    panelRef: rightPanelRef,
    side: "right",
    defaultWidth: DEFAULT_RIGHT_PANEL_WIDTH,
    minWidth: MIN_RIGHT_PANEL_WIDTH,
    maxWidth: MAX_RIGHT_PANEL_WIDTH,
    storageKey: RIGHT_PANEL_WIDTH_STORAGE_KEY,
  });

  const library = useCanvasLibrary();

  // ── Derived values ──────────────────────────────────────────────────────────
  const canvasThemeStyle = buildCanvasThemeStyle(canvasThemeColor);
  const isResizingPanel = leftSidebarResize.isResizing || rightPanelResize.isResizing;
  const selectedNode = getSelectedNodeFromSelection(nodes, selectedItem);
  const activeGenerationTarget =
    activeGenerationTargetId
      ? nodes.find((node) => node.id === activeGenerationTargetId && !isPresetGroupNode(node)) ?? null
      : null;
  const activeGenerationContext =
    activeGenerationTarget
      ? buildCanvasGenerationContext(activeGenerationTarget.id, nodes, edges, promptText)
      : null;

  useEffect(() => {
    if (!activeGenerationTargetId) return;
    if (nodes.some((node) => node.id === activeGenerationTargetId && !isPresetGroupNode(node))) return;
    setActiveGenerationTargetId(null);
  }, [activeGenerationTargetId, nodes]);

  useEffect(() => {
    if (!activeNodeId) return;
    if (nodes.some((node) => node.id === activeNodeId)) return;
    setActiveNodeId(null);
  }, [activeNodeId, nodes]);

  useEffect(() => {
    return () => {
      uploadedLibraryAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      uploadedLibraryAssetUrlsRef.current.clear();
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const toggleLeftSidebarPanel = (panel: LeftSidebarPanelId) => {
    setLeftSidebar((current) =>
      current.open && current.panel === panel
        ? { ...current, open: false }
        : { open: true, panel },
    );
  };

  const openLeftSidebar = () => {
    setLeftSidebar((current) => ({ ...current, open: true }));
  };

  const handleTool = (tool: EditorTool) => {
    if (tool === "region" && !selectedNode) {
      showToast("Select an image first");
      return;
    }

    setActiveTool(tool);
    if (tool === "add-object") setShowAddObjectMenu(true);
  };

  const handleSelectItem = (item: SelectedItem) => {
    setSelectedItem(item);
    if (item.type !== "sketchLine") {
      setSelectedSketchLineIds([]);
    }

    if (item.type === "presetChild") {
      setActiveNodeId(item.nodeId);
      setActiveGenerationTargetId(null);
      return;
    }

    if (item.type === "node" || item.type === "image") {
      const nextNode = nodes.find((node) => node.id === item.id);
      setActiveNodeId(item.id);
      if (nextNode && !isPresetGroupNode(nextNode)) {
        setActiveGenerationTargetId(nextNode.id);
        setPromptText(nextNode.prompt ?? "");
        return;
      }

      setActiveGenerationTargetId(null);
      return;
    }

    setActiveNodeId(null);
    setActiveGenerationTargetId(null);
  };

  const addPenStroke = (stroke: PenStrokeObject) => {
    setPenStrokes((items) => [...items, stroke]);
    setSelectedItem({ type: "pen-stroke", id: stroke.id });
    setSelectedSketchLineIds([]);
  };

  const replacePenStrokes = (nextStrokes: PenStrokeObject[]) => {
    setPenStrokes(nextStrokes);
    setSelectedItem((current) => {
      if (current.type !== "pen-stroke") return current;
      return nextStrokes.some((stroke) => stroke.id === current.id) ? current : { type: "none" };
    });
  };

  const deletePenStroke = (strokeId: string) => {
    setPenStrokes((items) => items.filter((stroke) => stroke.id !== strokeId));
    setSelectedItem((current) =>
      current.type === "pen-stroke" && current.id === strokeId ? { type: "none" } : current,
    );
  };

  const handleImageAction = (x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here" }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
    }
  };

  const addObject = (label: string) => {
    const id = `object-${addedObjects.length + 1}`;
    setAddedObjects((items) => [
      ...items,
      {
        id,
        x: 44 + items.length * 4,
        y: 45 + items.length * 3,
        w: label === "People" ? 10 : 18,
        h: label === "Waterfall" ? 17 : 11,
        rotation: label === "Pathway" ? -10 : -4,
        label,
      },
    ]);
    setSelectedItem({ type: "object", id });
    setShowAddObjectMenu(false);
    setActiveTool("select");
    animateIn(".added-object");
  };

  const uploadAssetsToFolder = (folderId: string, files: FileList | File[]) => {
    Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .forEach((file) => {
        const objectUrl = URL.createObjectURL(file);
        const assetId = `asset_${Date.now()}_${file.name}`;
        uploadedLibraryAssetUrlsRef.current.set(assetId, objectUrl);
        library.addAssetToFolder(folderId, {
          id: assetId,
          src: objectUrl,
          thumbnailSrc: objectUrl,
          title: file.name.replace(/\.[^.]+$/, ""),
          source: "upload",
          createdAt: new Date().toISOString(),
          metadata: {
            originalWidth: undefined,
            originalHeight: undefined,
          },
        });
      });
    showToast("Images added to Library");
  };

  const removeLibraryAsset = (folderId: string, assetId: string) => {
    const objectUrl = uploadedLibraryAssetUrlsRef.current.get(assetId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      uploadedLibraryAssetUrlsRef.current.delete(assetId);
    }

    library.removeAssetFromFolder(folderId, assetId);
  };

  const deleteLibraryFolder = (folderId: string) => {
    const folder = library.folders.find((item) => item.id === folderId);
    folder?.assets.forEach((asset) => {
      const objectUrl = uploadedLibraryAssetUrlsRef.current.get(asset.id);
      if (!objectUrl) return;
      URL.revokeObjectURL(objectUrl);
      uploadedLibraryAssetUrlsRef.current.delete(asset.id);
    });

    library.deleteFolder(folderId);
  };

  const upsertPresetGroup = (params: PendingPresetGroupInsert, replaceAllChildren = false) => {
    const existingGroup = nodes.find(
      (node) =>
        isPresetGroupNode(node) &&
        node.presetGroup.category === params.category &&
        (params.sourceFolderId ? node.presetGroup.sourceFolderId === params.sourceFolderId : true),
    ) as CanvasPresetGroupNode | undefined;

    if (!existingGroup) {
      setPendingPresetGroupInsert(params);
      return;
    }

    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== existingGroup.id) return node;

        const nextChildren = replaceAllChildren
          ? params.children.map((child, index) => ({ ...child, order: index }))
          : params.children.reduce(
              (children, child) => upsertPresetChild(children, child, true),
              node.presetGroup.children,
            );
        const activeChildId =
          params.children.at(-1)?.id ??
          node.presetGroup.activeChildId;

        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            category: params.category,
            sourceFolderId: params.sourceFolderId ?? node.presetGroup.sourceFolderId,
            activeChildId,
            children: nextChildren,
          },
        });
      }),
    );
    setActiveNodeId(existingGroup.id);
    setSelectedItem({ type: "node", id: existingGroup.id });
  };

  const setActivePresetChild = (nodeId: string, childId: string) => {
    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            activeChildId: childId,
          },
        });
      }),
    );
    setActiveNodeId(nodeId);
    setSelectedItem({ type: "presetChild", nodeId, childId });
  };

  const removePresetChild = (nodeId: string, childId: string) => {
    const targetNode = nodes.find((node) => isPresetGroupNode(node) && node.id === nodeId) as CanvasPresetGroupNode | undefined;
    if (!targetNode) return;

    const { children, edges: nextEdges } = removePresetChildAndCleanupEdges(targetNode, childId, edges);
    setNodes((current) => {
      if (children.length === 0) {
        return current.filter((node) => node.id !== nodeId);
      }

      return current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            activeChildId:
              targetNode.presetGroup.activeChildId === childId
                ? children[0]?.id ?? null
                : node.presetGroup.activeChildId,
            children,
          },
        });
      });
    });
    setEdges(nextEdges);
    setSelectedItem({ type: "node", id: nodeId });
  };

  const movePresetChild = (nodeId: string, childId: string, direction: "left" | "right") => {
    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        const children = [...node.presetGroup.children].sort((a, b) => a.order - b.order);
        const childIndex = children.findIndex((child) => child.id === childId);
        if (childIndex === -1) return node;
        const swapIndex = direction === "left" ? childIndex - 1 : childIndex + 1;
        if (swapIndex < 0 || swapIndex >= children.length) return node;
        const nextIds = children.map((child) => child.id);
        [nextIds[childIndex], nextIds[swapIndex]] = [nextIds[swapIndex], nextIds[childIndex]];
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            children: reorderPresetChildren(children, nextIds),
          },
        });
      }),
    );
  };

  const addSketchLine = (line: SketchLine) => {
    setSketchLines((items) => [...items, line]);
    setSelectedSketchLineIds([line.id]);
    setSelectedItem({ type: "sketchLine", id: line.id });
  };

  const selectSketchLine = (id: string, additive: boolean) => {
    setSelectedSketchLineIds((items) => {
      return additive
        ? items.includes(id)
          ? items.filter((item) => item !== id)
          : [...items, id]
        : [id];
    });
    setSelectedItem({ type: "sketchLine", id });
  };

  const groupSelectedSketchLines = (nameTag: string) => {
    const lineIds = selectedSketchLineIds.filter((id) =>
      sketchLines.some((line) => line.id === id),
    );
    if (lineIds.length === 0) return;

    const selectedLines = sketchLines.filter((line) => lineIds.includes(line.id));
    const points = selectedLines.flatMap((line) => line.points);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const groupId = `sketch-group-${Date.now()}`;
    const objectType = inferObjectTypeFromTag(nameTag);

    const group: SketchGroup = {
      id: groupId,
      nameTag,
      objectType,
      lineIds,
      bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      selectedAssetIds: [],
    };

    setSketchLines((items) =>
      items.map((line) => (lineIds.includes(line.id) ? { ...line, groupId } : line)),
    );
    setSketchGroups((items) => [...items, group]);
    setSelectedSketchLineIds([]);
    setSelectedItem({ type: "sketchGroup", id: groupId });
    setShowGroupNameModal(false);
    showToast(`${nameTag} group created`);
  };

  const updatePromptText = (value: string) => {
    setPromptText(value);
    if (!activeGenerationTargetId) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === activeGenerationTargetId
          ? { ...node, prompt: value }
          : node,
      ),
    );
  };

  const generateConcept = async () => {
    if (activeTool === "region" && !selectedNode) {
      showToast("Select an image first");
      return;
    }

    if (activeTool === "region" && (!selectedNode?.regionMask || selectedNode.regionMask.selectionRatio <= 0)) {
      showToast("No region selected");
      return;
    }

    if (activeTool === "region" && !promptText.trim()) {
      showToast("Enter a prompt");
      return;
    }

    const targetNode =
      activeGenerationTargetId
        ? nodes.find((node) => node.id === activeGenerationTargetId) ?? null
        : null;

    if (!targetNode) {
      showToast("Select a target image first");
      return;
    }

    if (isPresetGroupNode(targetNode)) {
      showToast("Preset groups cannot be generated directly");
      return;
    }

    const generationContext = buildCanvasGenerationContext(
      targetNode.id,
      nodes,
      edges,
      promptText,
    );
    if (!generationContext) {
      showToast("Unable to build generation context");
      return;
    }

    const regionPayload =
      activeTool === "region" && selectedNode?.regionMask
        ? {
            imageId: selectedNode.id,
            prompt: promptText.trim(),
            mask: selectedNode.regionMask,
          }
        : null;

    try {
      const resolvedGenerationContext = {
        ...generationContext,
        target: {
          ...generationContext.target,
          imageUrl: await resolveImageUrlForGeneration(generationContext.target.imageUrl),
        },
        imageReferences: await Promise.all(
          generationContext.imageReferences.map(async (reference) => ({
            ...reference,
            imageUrl: await resolveImageUrlForGeneration(reference.imageUrl),
          })),
        ),
        presetReferences: await Promise.all(
          generationContext.presetReferences.map(async (reference) => ({
            ...reference,
            imageSrc: await resolveImageUrlForGeneration(reference.imageSrc),
          })),
        ),
      };

      const snapshot = buildCanvasSnapshotWithGraph({
        nodes,
        edges,
        activeGenerationTargetId,
      });
      const payload = {
        prompt: promptText || resolvedGenerationContext.target.prompt || "Canvas generation request",
        rawPrompt: promptText || resolvedGenerationContext.target.prompt || "Canvas generation request",
        generationMode: "image_editing",
        canvasGraphContext: resolvedGenerationContext,
        targetNodeId: targetNode.id,
        snapshot,
        imageContext: {
          directEditTarget: resolvedGenerationContext.target,
          imageReferences: resolvedGenerationContext.imageReferences,
          presetReferences: resolvedGenerationContext.presetReferences,
          regionPayload,
        },
        referenceImages: [
          ...resolvedGenerationContext.imageReferences.map((reference) => ({
            label: reference.title,
            role: reference.role,
            url: reference.imageUrl,
          })),
          ...resolvedGenerationContext.presetReferences.map((reference) => ({
            label: reference.label,
            role: reference.role,
            url: reference.imageSrc,
          })),
        ],
        projectContext: {
          connectionSummary: resolvedGenerationContext.connectionSummary,
          preserveRules: resolvedGenerationContext.preserveRules,
        },
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        promptMeta?: { enhancedPromptVisible?: string };
        generatedImages?: GeneratedCanvasImage[];
        assistantMessage?: CanvasGenerationAssistantMessage;
      };

      if (!response.ok) {
        throw new Error(result.error || "Unable to generate from current canvas context.");
      }

      const generatedImage = result.generatedImages?.[0] ?? null;
      if (!generatedImage) {
        showToast("Generation context prepared");
        return;
      }

      const nodeSize = getGeneratedNodeSize(generatedImage, targetNode);
      const outputNode: CanvasNode = {
        id: `node-generated-${Date.now()}`,
        x: targetNode.x + targetNode.width * (targetNode.scale ?? 1) + 80,
        y: targetNode.y,
        width: nodeSize.width,
        height: nodeSize.height,
        scale: 1,
        inputPorts: getDefaultInputPorts(),
        imageUrl: generatedImage.imageUrl,
        sourceImage: {
          url: generatedImage.imageUrl,
          width: generatedImage.width,
          height: generatedImage.height,
          mimeType: generatedImage.mimeType,
          name: generatedImage.title,
          quality: "original",
        },
        title: generatedImage.title || "Generated concept",
        prompt: result.promptMeta?.enhancedPromptVisible ?? generatedImage.prompt ?? payload.prompt,
        role: "output",
      };

      setNodes((items) => [...items, outputNode]);
      setActiveGenerationTargetId(outputNode.id);
      setActiveNodeId(outputNode.id);
      setSelectedItem({ type: "node", id: outputNode.id });

      if (result.assistantMessage) {
        setGenerationAssistantMessages((messages) => [...messages, result.assistantMessage as CanvasGenerationAssistantMessage]);
      }

      showToast("Generated image added to chat and canvas");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to generate from current canvas context.");
    }
  };

  const generateAngles = () => {
    setShowMultiAngleModal(false);
  };

  const applyQuickEdit = () => {
    setShowQuickEditModal(false);
  };

  const pushMaskHistoryCheckpoint = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory || { past: [], future: [] };
        const nextPast = [...history.past, node.regionMask].slice(-MAX_MASK_HISTORY);
        return {
          ...node,
          maskHistory: {
            past: nextPast,
            future: [],
          },
        };
      }),
    );
  };

  const commitMaskData = (nodeId: string, newMask: MaskData | undefined) => {
    setNodes((items) =>
      items.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              regionMask: newMask,
            }
          : node,
      ),
    );
  };

  const undoMask = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory;
        if (!history || history.past.length === 0) {
          showToast("Nothing to undo for this mask");
          return node;
        }
        const previousMask = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);
        const currentMask = node.regionMask;
        return {
          ...node,
          regionMask: previousMask,
          maskHistory: {
            past: newPast,
            future: [currentMask, ...history.future],
          },
        };
      }),
    );
  };

  const redoMask = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory;
        if (!history || history.future.length === 0) {
          showToast("Nothing to redo for this mask");
          return node;
        }
        const nextMask = history.future[0];
        const newFuture = history.future.slice(1);
        const currentMask = node.regionMask;
        return {
          ...node,
          regionMask: nextMask,
          maskHistory: {
            past: [...history.past, currentMask],
            future: newFuture,
          },
        };
      }),
    );
  };

  // ── Return shape ────────────────────────────────────────────────────────────

  return {
    // DOM refs (needed by CanvasWorkspace for GSAP / panel resizing)
    rootRef,
    leftSidebarPanelRef,
    rightPanelRef,

    // Panel resizing hooks (expose full object so Workspace can wire ResizeHandle)
    leftSidebarResize,
    rightPanelResize,

    // Library sub-hook (folders, create, rename, etc. passed to EditorLeftSidebar)
    library,

    // ── Canvas state ──────────────────────────────────────────────────────────
    state: {
      selectedItem,
      activeTool,
      gridVisible,
      markers,
      addedObjects,
      sketchLines,
      sketchGroups,
      penStrokes,
      penSettings,
      selectedSketchLineIds,
      nodes,
      edges,
      promptText,
      activeGenerationTargetId,
      generationAssistantMessages,
      activeNodeId,
      leftSidebar,
      miniMapOpen,
      rightPanelOpen,
      canvasThemeColor,
      language,
      selectedLibraryAssetId,
      pendingLibraryInsertAsset,
      pendingPresetGroupInsert,
      brushMode,
      regionSelectionTool,
      brushSize,
      brushSoftness,
      maskTrigger,
      // derived
      canvasThemeStyle,
      isResizingPanel,
      selectedNode,
      activeGenerationTarget,
      activeGenerationContext,
    },

    // ── Modal visibility ──────────────────────────────────────────────────────
    modals: {
      showQuickEditModal,
      showMultiAngleModal,
      showAddObjectMenu,
      showRealityCheckPanel,
      showGroupNameModal,
    },

    // ── Toast ─────────────────────────────────────────────────────────────────
    toast,

    // ── Actions / commands ────────────────────────────────────────────────────
    actions: {
      // Toast
      showToast,

      // Sidebar
      toggleLeftSidebarPanel,
      openLeftSidebar,
      closeLeftSidebar: () => setLeftSidebar((c) => ({ ...c, open: false })),
      toggleMiniMap: () => setMiniMapOpen((v) => !v),
      openRightPanel: () => setRightPanelOpen(true),
      closeRightPanel: () => setRightPanelOpen(false),

      // Tool & selection
      handleTool,
      exitRegionMode: () => setActiveTool("select"),
      handleSelectItem,

      // Pen strokes
      addPenStroke,
      replacePenStrokes,
      deletePenStroke,
      setPenSettings,

      // Region Brush
      setBrushMode,
      setRegionSelectionTool,
      setBrushSize,
      setBrushSoftness,
      pushMaskHistoryCheckpoint,
      commitMaskData,
      undoMask,
      redoMask,
      triggerMaskAction: (action: "invert" | "clear") => setMaskTrigger({ action, timestamp: Date.now() }),

      // Sketch
      addSketchLine,
      selectSketchLine,
      groupSelectedSketchLines,

      // Canvas entity mutations
      handleImageAction,
      addObject,
      uploadAssetsToFolder,
      deleteLibraryFolder,
      removeLibraryAsset,

      // Nodes & edges (passthrough setters for CanvasBoard)
      setNodes,
      setEdges,
      setActiveNodeId,

      // Prompt
      setPromptText: updatePromptText,
      setActiveGenerationTargetId,

      // Generation
      generateConcept,
      generateAngles,
      applyQuickEdit,

      // Library insert
      setSelectedLibraryAssetId,
      setPendingLibraryInsertAsset,
      consumePendingLibraryInsert: () => setPendingLibraryInsertAsset(null),
      queuePresetGroupInsert: setPendingPresetGroupInsert,
      consumePendingPresetGroupInsert: () => setPendingPresetGroupInsert(null),
      upsertPresetGroup,
      setActivePresetChild,
      removePresetChild,
      movePresetChild,

      // Theme
      setCanvasThemeColor,
      setLanguage,

      // Modal toggles
      setShowQuickEditModal,
      setShowMultiAngleModal,
      setShowAddObjectMenu,
      setShowRealityCheckPanel,
      setShowGroupNameModal,
      toggleGrid: () => setGridVisible((v) => !v),
    },
  };
}

export type CanvasWorkspaceHook = ReturnType<typeof useCanvasWorkspace>;
