/*
 * useCanvasWorkspace
 *
 * Coordinator hook for the canvas editor.
 * Owns all canvas state, derived values, and action callbacks.
 * CanvasWorkspace.tsx consumes this hook and renders pure JSX only.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOptionalBrowserSupabaseClient } from "@carver/db/client";
import { useCanvasLibrary } from "./useCanvasLibrary";
import {
  coerceCanvasSnapshotDocument,
  type CanvasGenerationAssistantMessage,
  type CanvasSnapshotDocument,
  type CarverAiJobRecord,
} from "@carver/shared";
import { buildCanvasThemeStyle } from "../components/core/canvasThemeStyle";
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
  inferObjectTypeFromTag,
} from "../types/canvas";
import { MAX_MASK_HISTORY } from "../utils/regionMask";
import {
  buildCanvasGenerationContext,
  buildCanvasSnapshotWithGraph,
} from "../utils/canvasGenerationContext";
import { hydrateCanvasStateFromSnapshot } from "../utils/canvasSnapshotHydration";
import {
  createGeneratedOutputNode,
  resolveGenerationContextAssets,
} from "../utils/canvasGenerationHelpers";
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
} from "../utils/presetGroupHelpers";

// Lấy node đang được chọn từ trạng thái selection hiện tại của canvas.
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

type PendingGenerationJob = {
  jobId: string;
  projectId: string;
  targetNodeId: string;
};

type CreateAiJobResponse = {
  success?: boolean;
  data?: {
    job?: CarverAiJobRecord;
    creditsRemaining?: number;
  };
  error?: string;
};

type GetAiJobResponse = CreateAiJobResponse;

type SnapshotMeta = {
  snapshotId: string;
  version: number;
  createdAt: string;
};

type SnapshotRouteResponse = {
  success?: boolean;
  data?: {
    document?: CanvasSnapshotDocument;
    snapshot?: SnapshotMeta | null;
  };
  error?: string;
};

type ProfileRouteResponse = {
  profile?: {
    credits_amount?: number;
  };
  error?: string;
};

type BrowserSupabaseClient = NonNullable<ReturnType<typeof getOptionalBrowserSupabaseClient>>;

function requireCanvasSupabaseClient(client: BrowserSupabaseClient | null) {
  if (!client) {
    throw new Error("Please sign in before loading or saving project snapshots.");
  }

  return client;
}

async function getAccessToken(client: BrowserSupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in before loading or saving project snapshots.");
  }

  return accessToken;
}

async function authedFetch(
  client: BrowserSupabaseClient,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const accessToken = await getAccessToken(client);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}

function createSnapshotFingerprint(document: CanvasSnapshotDocument) {
  return JSON.stringify(document);
}

function getTerminalGenerationStatusMessage(job: CarverAiJobRecord) {
  if (job.status === "failed") {
    return job.errorMessage || "AI generation failed.";
  }

  if (job.status === "cancelled") {
    return "AI generation was cancelled.";
  }

  switch (job.jobResult?.stage) {
    case "generated":
      return "Generated image added to chat and canvas";
    case "prompt_compiled":
      return "Prompt compiled successfully, but no generated image was returned.";
    case "brief_ready":
      return "Generation brief is ready, but this job did not produce an image.";
    default:
      return "Generation completed";
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const INITIAL_MARKERS: Marker[] = [];

const INITIAL_OBJECTS: AddedObject[] = [];

// ── Animation helper (side-effect, canvas-local) ───────────────────────────

// Chạy animation xuất hiện nhẹ cho các phần tử mới trên canvas.
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

// ── Hook ──────────────────────────────────────────────────────────────────────

// Hook trung tâm quản lý state, derived state và action của workspace canvas.
export function useCanvasWorkspace(params: { projectId?: string } = {}) {
  // ── DOM Refs ────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const leftSidebarPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // ── Canvas entities ─────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: "none" });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
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
  const [pendingGenerationJob, setPendingGenerationJob] = useState<PendingGenerationJob | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showFeasibilityReviewPanel, setShowFeasibilityReviewPanel] = useState(false);
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
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotSaving, setIsSnapshotSaving] = useState(false);
  const [currentSnapshotMeta, setCurrentSnapshotMeta] = useState<SnapshotMeta | null>(null);
  const [hasUnsavedSnapshotChanges, setHasUnsavedSnapshotChanges] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState<number | null>(null);
  const handledGenerationJobIdsRef = useRef<Set<string>>(new Set());
  const savedSnapshotFingerprintRef = useRef<string | null>(null);
  const snapshotLoadRequestRef = useRef(0);
  const snapshotSaveInFlightRef = useRef(false);

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
  const supabase = getOptionalBrowserSupabaseClient();

  const refreshProfileCredits = useCallback(async () => {
    const client = requireCanvasSupabaseClient(supabase);
    const response = await authedFetch(client, "/api/profiles", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as ProfileRouteResponse;

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load profile credits.");
    }

    setCreditsAmount(
      typeof payload.profile?.credits_amount === "number" ? payload.profile.credits_amount : null,
    );
  }, [supabase]);

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
    let cancelled = false;

    const loadProfileCredits = async () => {
      try {
        await refreshProfileCredits();
      } catch {
        if (!cancelled) {
          setCreditsAmount(null);
        }
      }
    };

    void loadProfileCredits();

    return () => {
      cancelled = true;
    };
  }, [refreshProfileCredits]);

  const applyHydratedSnapshotState = (document: CanvasSnapshotDocument) => {
    const hydrated = hydrateCanvasStateFromSnapshot(document);

    setNodes(hydrated.nodes);
    setEdges(hydrated.edges);
    setPromptText(hydrated.promptText);
    setActiveGenerationTargetId(hydrated.activeGenerationTargetId);
    setActiveNodeId(hydrated.activeGenerationTargetId);
    setSelectedItem(
      hydrated.activeGenerationTargetId
        ? { type: "node", id: hydrated.activeGenerationTargetId }
        : { type: "none" },
    );
    setPendingGenerationJob(null);
    setGenerationAssistantMessages([]);
    setMarkers(INITIAL_MARKERS);
    setAddedObjects(INITIAL_OBJECTS);
    setSketchLines([]);
    setSketchGroups([]);
    setPenStrokes([]);
    setSelectedSketchLineIds([]);
    handledGenerationJobIdsRef.current.clear();
  };

  const applyCompletedGenerationJob = useCallback((params: {
    job: CarverAiJobRecord;
    targetNodeId?: string | null;
    syncAssistantMessage?: boolean;
  }) => {
    const assistantMessage = params.job.jobResult?.assistantMessage ?? null;
    if (params.syncAssistantMessage !== false && assistantMessage) {
      setGenerationAssistantMessages((messages) =>
        messages.some((message) => message.id === assistantMessage.id)
          ? messages
          : [...messages, assistantMessage],
      );
    }

    const generatedImage = params.job.jobResult?.generatedImages?.[0] ?? null;
    if (!generatedImage) {
      showToast(getTerminalGenerationStatusMessage(params.job));
      return;
    }

    const targetNode =
      (params.targetNodeId
        ? nodes.find((node) => node.id === params.targetNodeId)
        : null) ?? activeGenerationTarget;
    const outputNode = createGeneratedOutputNode({
      generatedImage,
      prompt: generatedImage.prompt || params.job.prompt || "Generated concept",
      targetNode,
      existingNodes: nodes,
    });

    setNodes((items) => [...items, outputNode]);
    setActiveGenerationTargetId(outputNode.id);
    setActiveNodeId(outputNode.id);
    setSelectedItem({ type: "node", id: outputNode.id });
    showToast(getTerminalGenerationStatusMessage(params.job));
  }, [activeGenerationTarget, nodes]);

  const saveSnapshot = async () => {
    if (!params.projectId) {
      showToast("Open this canvas with a projectId before saving snapshots.");
      return;
    }

    if (snapshotSaveInFlightRef.current) {
      return;
    }

    snapshotSaveInFlightRef.current = true;
    setIsSnapshotSaving(true);

    const snapshotDocument = buildCanvasSnapshotWithGraph({
      nodes,
      edges,
      activeGenerationTargetId,
    });
    const snapshotFingerprint = createSnapshotFingerprint(snapshotDocument);

    try {
      const response = await authedFetch(
        requireCanvasSupabaseClient(supabase),
        `/api/projects/${params.projectId}/snapshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snapshot: snapshotDocument,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as SnapshotRouteResponse;

      if (!response.ok || !payload.data?.snapshot) {
        throw new Error(payload.error || "Unable to save the current snapshot.");
      }

      savedSnapshotFingerprintRef.current = snapshotFingerprint;
      setCurrentSnapshotMeta(payload.data.snapshot);
      setHasUnsavedSnapshotChanges(false);
      showToast(`Snapshot saved as v${payload.data.snapshot.version}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save the current snapshot.");
    } finally {
      snapshotSaveInFlightRef.current = false;
      setIsSnapshotSaving(false);
    }
  };

  useEffect(() => {
    if (!activeGenerationTargetId) return;
    if (nodes.some((node) => node.id === activeGenerationTargetId && !isPresetGroupNode(node))) return;

    queueMicrotask(() => {
      setActiveGenerationTargetId((current) =>
        current === activeGenerationTargetId ? null : current,
      );
      setPromptText((current) => (current.length > 0 ? "" : current));
    });
  }, [activeGenerationTargetId, nodes]);

  useEffect(() => {
    if (!activeNodeId) return;
    if (nodes.some((node) => node.id === activeNodeId)) return;

    queueMicrotask(() => {
      setActiveNodeId((current) => (current === activeNodeId ? null : current));
    });
  }, [activeNodeId, nodes]);

  useEffect(() => {
    if (!params.projectId) {
      savedSnapshotFingerprintRef.current = null;
      queueMicrotask(() => {
        setIsSnapshotLoading(false);
        setCurrentSnapshotMeta(null);
        setHasUnsavedSnapshotChanges(false);
      });
      return;
    }

    let cancelled = false;
    const requestId = snapshotLoadRequestRef.current + 1;
    snapshotLoadRequestRef.current = requestId;
    savedSnapshotFingerprintRef.current = null;
    queueMicrotask(() => {
      setCurrentSnapshotMeta(null);
      setHasUnsavedSnapshotChanges(false);
    });

    const loadSnapshot = async () => {
      setIsSnapshotLoading(true);

      try {
        const response = await authedFetch(
          requireCanvasSupabaseClient(supabase),
          `/api/projects/${params.projectId}/snapshot`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as SnapshotRouteResponse;

        if (!response.ok || !payload.data?.document) {
          throw new Error(payload.error || "Unable to load the current canvas snapshot.");
        }

        const document = coerceCanvasSnapshotDocument(payload.data.document);
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        applyHydratedSnapshotState(document);
        savedSnapshotFingerprintRef.current = createSnapshotFingerprint(document);
        setCurrentSnapshotMeta(payload.data.snapshot ?? null);
        setHasUnsavedSnapshotChanges(false);
      } catch (error) {
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        const emptyDocument = coerceCanvasSnapshotDocument(undefined);
        applyHydratedSnapshotState(emptyDocument);
        savedSnapshotFingerprintRef.current = createSnapshotFingerprint(emptyDocument);
        setCurrentSnapshotMeta(null);
        setHasUnsavedSnapshotChanges(false);
        showToast(
          error instanceof Error
            ? error.message
            : "Unable to load the current canvas snapshot.",
        );
      } finally {
        if (!cancelled && requestId === snapshotLoadRequestRef.current) {
          setIsSnapshotLoading(false);
        }
      }
    };

    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [params.projectId, supabase]);

  useEffect(() => {
    if (!params.projectId || savedSnapshotFingerprintRef.current === null) {
      setHasUnsavedSnapshotChanges(false);
      return;
    }

    const currentFingerprint = createSnapshotFingerprint(
      buildCanvasSnapshotWithGraph({
        nodes,
        edges,
        activeGenerationTargetId,
      }),
    );
    setHasUnsavedSnapshotChanges(savedSnapshotFingerprintRef.current !== currentFingerprint);
  }, [activeGenerationTargetId, edges, nodes, params.projectId]);

  useEffect(() => {
    if (!pendingGenerationJob) return;
    if (handledGenerationJobIdsRef.current.has(pendingGenerationJob.jobId)) {
      setPendingGenerationJob((current) =>
        current?.jobId === pendingGenerationJob.jobId ? null : current,
      );
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;
    let isRequestInFlight = false;

    const pollJob = async () => {
      if (cancelled || isRequestInFlight) return;
      isRequestInFlight = true;

      try {
        const response = await authedFetch(
          requireCanvasSupabaseClient(supabase),
          `/api/projects/${pendingGenerationJob.projectId}/ai-jobs/${pendingGenerationJob.jobId}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as GetAiJobResponse;

        if (!response.ok || !payload.data?.job) {
          throw new Error(payload.error || "Unable to load AI job status.");
        }

        const job = payload.data.job;
        if (handledGenerationJobIdsRef.current.has(job.id)) {
          return;
        }
        if (job.status === "queued" || job.status === "running") {
          return;
        }

        handledGenerationJobIdsRef.current.add(job.id);
        setPendingGenerationJob((current) => (current?.jobId === job.id ? null : current));

        if (job.status === "failed") {
          showToast(getTerminalGenerationStatusMessage(job));
          return;
        }

        if (job.status === "cancelled") {
          showToast(getTerminalGenerationStatusMessage(job));
          return;
        }

        applyCompletedGenerationJob({
          job,
          targetNodeId: pendingGenerationJob.targetNodeId,
          syncAssistantMessage: true,
        });
      } catch (error) {
        setPendingGenerationJob((current) =>
          current?.jobId === pendingGenerationJob.jobId ? null : current,
        );
        showToast(error instanceof Error ? error.message : "Unable to load AI job status.");
      } finally {
        isRequestInFlight = false;
      }
    };

    void pollJob();
    intervalId = window.setInterval(() => {
      void pollJob();
    }, 2000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [applyCompletedGenerationJob, pendingGenerationJob, supabase]);


  // ── Actions ─────────────────────────────────────────────────────────────────

  // Hiển thị toast ngắn và tự ẩn sau một khoảng thời gian cố định.
  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  // Bật hoặc tắt panel trái theo tab người dùng chọn.
  const toggleLeftSidebarPanel = (panel: LeftSidebarPanelId) => {
    setLeftSidebar((current) =>
      current.open && current.panel === panel
        ? { ...current, open: false }
        : { open: true, panel },
    );
  };

  // Mở lại panel trái mà không đổi tab hiện tại.
  const openLeftSidebar = () => {
    setLeftSidebar((current) => ({ ...current, open: true }));
  };

  // Đổi tool đang hoạt động và chặn các tool cần chọn ảnh trước.
  const handleTool = (tool: EditorTool) => {
    if (tool === "region" && !selectedNode) {
      showToast("Select an image first");
      return;
    }

    setActiveTool(tool);
    if (tool === "add-object") setShowAddObjectMenu(true);
  };

  // Đồng bộ selection với node active và target dùng cho generate.
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

  // Thêm một nét bút mới và chuyển selection sang nét vừa vẽ.
  const addPenStroke = (stroke: PenStrokeObject) => {
    setPenStrokes((items) => [...items, stroke]);
    setSelectedItem({ type: "pen-stroke", id: stroke.id });
    setSelectedSketchLineIds([]);
  };

  // Thay toàn bộ danh sách nét bút, thường dùng sau thao tác erase hoặc undo.
  const replacePenStrokes = (nextStrokes: PenStrokeObject[]) => {
    setPenStrokes(nextStrokes);
    setSelectedItem((current) => {
      if (current.type !== "pen-stroke") return current;
      return nextStrokes.some((stroke) => stroke.id === current.id) ? current : { type: "none" };
    });
  };

  // Xóa một nét bút và dọn selection nếu đang chọn nét đó.
  const deletePenStroke = (strokeId: string) => {
    setPenStrokes((items) => items.filter((stroke) => stroke.id !== strokeId));
    setSelectedItem((current) =>
      current.type === "pen-stroke" && current.id === strokeId ? { type: "none" } : current,
    );
  };

  // Xử lý click lên ảnh theo tool hiện tại, ví dụ đặt marker vị trí.
  const handleImageAction = (x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here" }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
    }
  };

  // Thêm object mẫu lên canvas và trả tool về chế độ chọn.
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

  // Nhận ảnh upload rồi thêm chúng vào folder thư viện dưới dạng asset cục bộ.
  const uploadAssetsToFolder = async (folderId: string, files: FileList | File[]) => {
    try {
      await library.uploadAssetsToFolder(folderId, files);
      showToast("Images added to cloud library");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to upload images.");
    }
  };

  // Xóa asset trong thư viện và thu hồi object URL nếu có.
  const removeLibraryAsset = async (folderId: string, assetId: string) => {
    try {
      await library.removeAssetFromFolder(folderId, assetId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete library asset.");
    }
  };

  // Xóa cả folder thư viện và dọn toàn bộ object URL thuộc folder đó.
  const deleteLibraryFolder = async (folderId: string) => {
    try {
      await library.deleteFolder(folderId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete library folder.");
    }
  };

  // Tạo mới hoặc cập nhật preset group bằng danh sách preset con mới.
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

  // Đổi preset con đang active trong preset group.
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

  // Xóa một preset con và cập nhật lại các cạnh nối liên quan.
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

  // Đổi thứ tự hiển thị của preset con trong preset group.
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

  // Thêm sketch line mới và chọn ngay line đó.
  const addSketchLine = (line: SketchLine) => {
    setSketchLines((items) => [...items, line]);
    setSelectedSketchLineIds([line.id]);
    setSelectedItem({ type: "sketchLine", id: line.id });
  };

  // Chọn một sketch line, hỗ trợ cả chọn cộng dồn.
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

  // Gom các sketch line đã chọn thành một sketch group có bounds và loại đối tượng.
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

  // Cập nhật prompt đang soạn và đồng bộ vào target node hiện tại.
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

  // Chuẩn bị context từ canvas, gọi API generate và thêm ảnh kết quả trở lại canvas.
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

    if (!activeGenerationTarget) {
      showToast("Select a target image first");
      return;
    }

    if (!params.projectId) {
      showToast("Open this canvas with a projectId to use background generation.");
      return;
    }

    if (!activeGenerationContext) {
      showToast("Unable to build generation context");
      return;
    }

    const effectivePrompt =
      promptText || activeGenerationContext.target.prompt || "Canvas generation request";
    const regionPayload =
      activeTool === "region" && selectedNode?.regionMask
        ? {
            imageId: selectedNode.id,
            prompt: promptText.trim(),
            mask: selectedNode.regionMask,
          }
        : null;

    try {
      const client = requireCanvasSupabaseClient(supabase);
      const resolvedGenerationContext = await resolveGenerationContextAssets(activeGenerationContext);

      const snapshot = buildCanvasSnapshotWithGraph({
        nodes,
        edges,
        activeGenerationTargetId,
      });
      const payload = {
        projectId: params.projectId,
        prompt: effectivePrompt,
        canvasGraphContext: resolvedGenerationContext,
        targetNodeId: activeGenerationTarget.id,
        snapshot,
        promptMode: "auto",
        executionMode: regionPayload ? "region_edit" : "image_edit",
        jobType: regionPayload ? "refine_concept" : "generate_concept",
        mask: regionPayload
          ? {
              dataUrl: regionPayload.mask.dataUrl,
              width: regionPayload.mask.width,
              height: regionPayload.mask.height,
              selectionRatio: regionPayload.mask.selectionRatio,
            }
          : undefined,
      };

      const response = await authedFetch(client, `/api/projects/${params.projectId}/ai-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as CreateAiJobResponse;

      if (!response.ok) {
        throw new Error(result.error || "Unable to generate from current canvas context.");
      }

      const job = result.data?.job;
      if (!job) {
        throw new Error("The AI job was created without a usable job payload.");
      }

      if (typeof result.data?.creditsRemaining === "number") {
        setCreditsAmount(result.data.creditsRemaining);
      }

      if (handledGenerationJobIdsRef.current.has(job.id)) {
        handledGenerationJobIdsRef.current.delete(job.id);
      }

      setPendingGenerationJob({
        jobId: job.id,
        projectId: params.projectId,
        targetNodeId: activeGenerationTarget.id,
      });

      if (job.status === "queued") {
        showToast("Generation queued");
        return;
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to generate from current canvas context.");
    }
  };

  // Đóng modal nhiều góc nhìn; phần generate riêng chưa được cài đặt.
  const generateAngles = () => {
    setShowMultiAngleModal(false);
  };

  // Đóng quick edit modal; phần áp dụng chỉnh sửa nhanh chưa được cài đặt.
  const applyQuickEdit = () => {
    setShowQuickEditModal(false);
  };

  // Lưu checkpoint mask hiện tại để phục vụ undo/redo vùng chọn.
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

  // Ghi mask mới vào node đang chỉnh sửa vùng.
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

  // Hoàn tác thay đổi mask gần nhất của node.
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

  // Làm lại thay đổi mask vừa undo của node.
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

    // Library sub-hook (folders, create, rename, etc. passed to CanvasLeftSidebar)
    library,

    // ── Canvas state ──────────────────────────────────────────────────────────
    state: {
      selectedItem,
      activeTool,
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
      pendingGenerationJob,
      leftSidebar,
      miniMapOpen,
      rightPanelOpen,
      canvasThemeColor,
      language,
      selectedLibraryAssetId,
      pendingLibraryInsertAsset,
      pendingPresetGroupInsert,
      isSnapshotLoading,
      isSnapshotSaving,
      currentSnapshotMeta,
      hasUnsavedSnapshotChanges,
      creditsAmount,
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
      showFeasibilityReviewPanel,
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
      setPendingGenerationJob,

      // Generation
      generateConcept,
      generateAngles,
      applyQuickEdit,
      applyCompletedGenerationJob,
      saveSnapshot,
      refreshProfileCredits,

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
      setShowFeasibilityReviewPanel,
      setShowGroupNameModal,
    },
  };
}

export type CanvasWorkspaceHook = ReturnType<typeof useCanvasWorkspace>;
