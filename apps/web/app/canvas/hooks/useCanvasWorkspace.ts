/*
 * useCanvasWorkspace
 *
 * Coordinator hook for the canvas editor.
 * Owns all canvas state, derived values, and action callbacks.
 * CanvasWorkspace.tsx consumes this hook and renders pure JSX only.
 */

"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { getOptionalBrowserSupabaseClient } from "@carver/db/client";
import { useCanvasLibrary } from "./useCanvasLibrary";
import {
  type AssistantCardContext,
  type AssistantCardRequestBody,
  applyCanvasDraftOperations,
  coerceCanvasSnapshotDocument,
  getCanvasOperationConflict,
  type CanvasGenerationAssistantMessage,
  type CanvasOperationV2,
  toCanvasOperationV2,
  type CanvasSnapshotDocument,
  type CarverAiJobRecord,
  type CarverAiJobSimulationConfig,
} from "@carver/shared";
import {
  getImageGeneratorCardSize,
  resolveImageGeneratorAspectRatio,
  shouldCreateImageOutputGallery,
} from "@carver/shared";
import {
  buildCanvasThemeStyle,
  CANVAS_THEME_STORAGE_KEY,
  DEFAULT_CANVAS_THEME,
  isCanvasTheme,
  type CanvasTheme,
} from "../components/core/canvasThemeStyle";
import { DEFAULT_CANVAS_LANGUAGE } from "../i18n";
import { gsap } from "../../components/gsapSetup";
import type { LibraryAsset as CanvasLibraryAsset } from "../types/library";
import {
  type CanvasPresetChild,
  type CanvasPresetGroupNode,
  DEFAULT_ASSISTANT_NODE_HEIGHT,
  DEFAULT_ASSISTANT_NODE_WIDTH,
  DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT,
  DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_WIDTH,
  DEFAULT_CONTEXT_GROUP_NODE_HEIGHT,
  DEFAULT_CONTEXT_GROUP_NODE_WIDTH,
  DEFAULT_CAMERA_SHOT_SET_NODE_HEIGHT,
  DEFAULT_CAMERA_SHOT_SET_NODE_WIDTH,
  DEFAULT_PEN_SETTINGS,
  IMAGE_GENERATOR_MAX_OUTPUT_COUNT,
  IMAGE_GENERATOR_MIN_OUTPUT_COUNT,
  MIN_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT,
  MIN_IMAGE_OUTPUT_GALLERY_NODE_WIDTH,
  type PresetGroupCategory,
  type CanvasContextGroupKind,
  type CanvasCameraShotPreset,
  type CanvasMultiAnglesMode,
  type CanvasCameraShotSetState,
  inferObjectTypeFromTag,
} from "../types/canvas";
import {
  getAssistantInputPorts,
  getCanvasNodeVisualScale,
  getImageGeneratorInputPorts,
  getImageOutputGalleryInputPorts,
  getContextGroupInputPorts,
  getCameraShotSetInputPorts,
} from "../utils/canvasNodePorts";
import {
  CONTEXT_GROUP_LABELS,
  createContextGroupItems,
} from "../utils/contextGroupHelpers";
import { areCameraShotSetStatesEqual, createCameraShotSet } from "../utils/cameraShotHelpers";
import { MAX_MASK_HISTORY } from "../utils/regionMask";
import {
  buildCanvasGenerationContext,
  buildCanvasSnapshotWithGraph,
} from "../utils/canvasGenerationContext";
import {
  applyResolvedAssetUrlsToSnapshot,
  collectSnapshotAssetIds,
} from "../utils/snapshotAssetRefs";
import {
  hydrateCanvasStateFromSnapshot,
} from "../utils/canvasSnapshotHydration";
import { DEFAULT_CANVAS_VIEWPORT_ZOOM, normalizeCanvasViewportZoom } from "../utils/canvasViewport";
import {
  createGeneratedOutputNode,
  resolveGenerationContextAssets,
} from "../utils/canvasGenerationHelpers";
import {
  buildImageGeneratorGraphContext,
} from "../utils/imageGeneratorGraphContext";
import {
  buildAssistantCardContext,
  resolveAssistantContextAssets,
} from "../utils/assistantGraphContext";
import type {
  AddedObject,
  CanvasEdge,
  CanvasImageGeneratorNode,
  CanvasImageOutputGalleryNode,
  MaskData,
  CanvasNode,
  EditorTool,
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
  isCanvasImageGeneratorNode,
  isCanvasImageOutputGalleryNode,
  isCanvasTextNode,
  isCanvasCameraShotSetNode,
} from "../types/canvas";
import {
  isAssistantNode,
  isPresetGroupNode,
  removePresetChildAndCleanupEdges,
  reorderPresetChildren,
  syncPresetGroupPreview,
  upsertPresetChild,
} from "../utils/presetGroupHelpers";
import {
  acknowledgeCanvasDraftOperations,
  applyRemoteCanvasDraftOperations,
  initializeCanvasDraftBranch,
  loadCanvasDraft,
  markCanvasDraftClean,
  pruneExpiredCanvasDrafts,
  recordCanvasDraftCloudSync,
  replaceEmptyCanvasDraftCheckpoint,
  saveCanvasDraft,
  type LocalCanvasDraftRecord,
  LOCAL_DRAFT_TTL_MS,
} from "../utils/localCanvasDraft";
import {
  estimateCanvasPayloadBytes,
  recordCanvasPersistenceBenchmarkEvent,
} from "../utils/persistenceBenchmark";
import {
  finishAiJobBenchmarkRun,
  recordAiJobPollRequest,
  startAiJobBenchmarkRun,
} from "../utils/aiJobBenchmark";

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
  targetType: "canvas-output" | "image-generator";
};

type ResolvedAssetUrls = {
  thumbUrl: string;
  previewUrl: string;
  originalUrl: string;
  expiresAt: string;
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

type AssistantRunRouteResponse = {
  success?: boolean;
  data?: {
    response?: string;
    model?: string;
    nodeId?: string;
    lastRunAt?: string;
    contextSummary?: string;
    usedImageCount?: number;
    usedTextCount?: number;
    creditsRemaining?: number | null;
  };
  error?: string;
};

type SnapshotMeta = {
  snapshotId: string;
  version: number;
  createdAt: string;
  snapshotKind?: "initial" | "manual" | "close" | "job_checkpoint";
  isUserVisible?: boolean;
  documentHash?: string | null;
};

type ProjectDraftMeta = {
  projectId: string;
  ownerId: string;
  baseSnapshotId: string | null;
  revision: number;
  documentHash: string | null;
  lastMutationId: string | null;
  updatedAt: string;
};

type SnapshotRouteResponse = {
  success?: boolean;
  data?: {
    document?: CanvasSnapshotDocument;
    snapshot?: SnapshotMeta | null;
    assetDeliveryWarning?: string;
  };
  error?: string;
};

type DraftRouteResponse = {
  success?: boolean;
  data?: {
    projectId: string;
    document?: CanvasSnapshotDocument | null;
    draft?: ProjectDraftMeta | null;
    ackedOperationIds?: string[];
    batchId?: string;
    rebased?: boolean;
    operations?: CanvasOperationV2[];
    assetDeliveryWarning?: string;
  };
  error?: string;
  code?: string;
};

type DraftFinalizeRouteResponse = {
  success?: boolean;
  data?: {
    projectId: string;
    snapshot?: SnapshotMeta & {
      baseSnapshotId?: string | null;
      draftRevision?: number;
    };
  };
  error?: string;
  code?: string;
};

type AssetResolveResponse = {
  success?: boolean;
  data?: {
    assets?: Record<string, {
      assetId: string;
      expiresAt: string;
      thumbUrl: string;
      previewUrl: string;
      originalUrl: string;
    }>;
  };
  error?: string;
};

type SnapshotAssetPersistResponse = {
  success?: boolean;
  data?: {
    images?: Array<{
      nodeId: string;
      assetId: string;
      imageUrl: string;
      expiresAt: string;
      mimeType: string;
      sizeBytes: number;
    }>;
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

async function authedKeepaliveFetch(
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
    keepalive: true,
  });
}

async function getSessionUserId(client: BrowserSupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  return data.session?.user.id ?? null;
}

function createSnapshotFingerprint(document: CanvasSnapshotDocument) {
  const serialized = JSON.stringify(document);
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function hasCanvasDocumentContent(document: CanvasSnapshotDocument) {
  return Boolean(
    document.graph.nodes.length ||
      document.graph.edges.length ||
      document.markers.length ||
      document.addedObjects.length ||
      document.sketchLines.length ||
      document.sketchGroups.length ||
      document.penStrokes.length ||
      document.objects.length ||
      document.regions.length ||
      document.locks.length ||
      document.references.length,
  );
}

// Local draft is the crash/reload recovery path, so it must land quickly after
// semantic canvas changes. Cloud draft stays lightly debounced to batch bursts.
const LOCAL_DRAFT_SAVE_DEBOUNCE_MS = 50;
const CLOUD_DRAFT_SYNC_DEBOUNCE_MS = 500;
const CLOUD_DRAFT_SYNC_MAX_WAIT_MS = 2_000;
const CLOUD_DRAFT_SYNC_RETRY_LIMIT = 4;
const CLOUD_DRAFT_SYNC_RETRY_BASE_MS = 2_000;
const DRAFT_BROADCAST_CHANNEL = "carver:canvas-draft";

function createDraftMutationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-mutation-${Date.now()}`;
}

function getCanvasDraftClientId() {
  const key = "carver:canvasDraftClientId";
  if (typeof window !== "undefined") {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = createDraftMutationId();
    window.sessionStorage.setItem(key, next);
    return next;
  }
  return createDraftMutationId();
}

function hasTransientSnapshotContent(document: CanvasSnapshotDocument) {
  const hasUnsafeUrl = (value: string | undefined) =>
    Boolean(
      value &&
      (value.startsWith("blob:") ||
        value.startsWith("data:") ||
        value.startsWith("file:") ||
        value.includes("base64,")),
    );

  return document.graph.nodes.some((node) => {
    if (hasUnsafeUrl(node.imageUrl) || hasUnsafeUrl(node.sourceImage?.url)) {
      return true;
    }

    return (
      node.presetGroup?.children.some(
        (child) => hasUnsafeUrl(child.imageSrc) || hasUnsafeUrl(child.sourceImage?.url),
      ) ?? false
    );
  });
}

async function resolveSnapshotRuntimeAssetUrls(
  client: BrowserSupabaseClient,
  document: CanvasSnapshotDocument,
) {
  const assetIds = collectSnapshotAssetIds(document);
  if (assetIds.length === 0) {
    return document;
  }

  const response = await authedFetch(client, "/api/assets/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assetIds,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as AssetResolveResponse;

  if (!response.ok || !payload.data?.assets) {
    throw new Error(payload.error || "Unable to resolve canvas assets.");
  }

  return applyResolvedAssetUrlsToSnapshot(document, payload.data.assets);
}

function getTerminalGenerationStatusMessage(job: CarverAiJobRecord) {
  switch (job.status as string) {
    case "failed":
    case "enqueue_failed":
      return job.errorMessage || "AI generation failed.";
    case "cancelled":
      return "AI generation was cancelled.";
    default:
      break;
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
  const [viewportZoom, setViewportZoom] = useState(DEFAULT_CANVAS_VIEWPORT_ZOOM);
  const [viewportResetVersion, setViewportResetVersion] = useState(0);
  const setCanvasViewportZoom = useCallback((value: number) => {
    const nextZoom = normalizeCanvasViewportZoom(value);
    setViewportZoom((currentZoom) => currentZoom === nextZoom ? currentZoom : nextZoom);
  }, []);
  const resetCanvasViewport = useCallback(() => {
    setViewportZoom(DEFAULT_CANVAS_VIEWPORT_ZOOM);
    setViewportResetVersion((current) => current + 1);
  }, []);
  const [canvasTheme, setCanvasThemeState] = useState<CanvasTheme>(DEFAULT_CANVAS_THEME);

  // Read browser preference after hydration so this client-only choice never affects SSR markup.
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const storedTheme = window.localStorage.getItem(CANVAS_THEME_STORAGE_KEY);
      if (isCanvasTheme(storedTheme)) {
        setCanvasThemeState(storedTheme);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const setCanvasTheme = useCallback((theme: CanvasTheme) => {
    setCanvasThemeState(theme);
    window.localStorage.setItem(CANVAS_THEME_STORAGE_KEY, theme);
  }, []);

  // ── Generation / AI ─────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [activeGenerationTargetId, setActiveGenerationTargetId] = useState<string | null>(null);
  const [generationAssistantMessages, setGenerationAssistantMessages] = useState<CanvasGenerationAssistantMessage[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [pendingGenerationJobs, setPendingGenerationJobs] = useState<PendingGenerationJob[]>([]);
  const generationPollInFlightJobIdsRef = useRef(new Set<string>());
  const [resolvedGeneratorAssetUrls, setResolvedGeneratorAssetUrls] = useState<Record<string, ResolvedAssetUrls>>({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showFeasibilityReviewPanel, setShowFeasibilityReviewPanel] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [language, setLanguage] = useState(DEFAULT_CANVAS_LANGUAGE);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState<string | null>(null);
  const [pendingLibraryInsertAsset, setPendingLibraryInsertAsset] =
    useState<CanvasLibraryAsset | null>(null);
  const [pendingPresetGroupInsert, setPendingPresetGroupInsert] =
    useState<PendingPresetGroupInsert | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [isSnapshotSaving, setIsSnapshotSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [currentSnapshotMeta, setCurrentSnapshotMeta] = useState<SnapshotMeta | null>(null);
  const [hasUnsavedSnapshotChanges, setHasUnsavedSnapshotChanges] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [draftConflict, setDraftConflict] = useState<LocalCanvasDraftRecord | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const handledGenerationJobIdsRef = useRef<Set<string>>(new Set());
  const savedSnapshotFingerprintRef = useRef<string | null>(null);
  const snapshotLoadRequestRef = useRef(0);
  const canvasPersistenceReadyRef = useRef(false);
  const snapshotSaveInFlightRef = useRef(false);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const lastPersistedLocalDraftFingerprintRef = useRef<string | null>(null);
  const cloudDraftSyncTimeoutRef = useRef<number | null>(null);
  const cloudDraftFirstDirtyAtRef = useRef<number | null>(null);
  const cloudDraftRetryTimeoutRef = useRef<number | null>(null);
  const cloudDraftRetryAttemptRef = useRef(0);
  const cloudDraftEntityConflictRef = useRef(false);
  const cloudDraftSyncInFlightRef = useRef(false);
  const remoteCanvasReconcileInFlightRef = useRef(false);
  const latestDraftMutationIdRef = useRef<string | null>(null);
  const latestSnapshotDocumentRef = useRef<CanvasSnapshotDocument>(coerceCanvasSnapshotDocument(undefined));
  const latestSnapshotFingerprintRef = useRef<string>("");
  const latestNodesRef = useRef<CanvasNode[]>([]);
  const latestEdgesRef = useRef<CanvasEdge[]>([]);
  const latestActiveGenerationTargetIdRef = useRef<string | null>(null);
  const cloudDraftMetaRef = useRef<{
    baseSnapshotId: string | null;
    revision: number | null;
    documentHash: string | null;
    lastMutationId: string | null;
  }>({
    baseSnapshotId: null,
    revision: null,
    documentHash: null,
    lastMutationId: null,
  });
  const snapshotBaselineRef = useRef<{
    snapshotId: string | null;
    version: number | null;
    documentHash: string | null;
  }>({
    snapshotId: null,
    version: null,
    documentHash: null,
  });
  const tabIdRef = useRef(getCanvasDraftClientId());
  const draftChannelRef = useRef<BroadcastChannel | null>(null);

  // ── Sub-hooks ───────────────────────────────────────────────────────────────
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
  const canvasThemeStyle = useMemo(() => buildCanvasThemeStyle(canvasTheme), [canvasTheme]);
  const isResizingPanel = false;
  const selectedNode = getSelectedNodeFromSelection(nodes, selectedItem);
  const activeGenerationTarget =
    activeGenerationTargetId
      ? nodes.find(
          (node) =>
            node.id === activeGenerationTargetId &&
            !isPresetGroupNode(node) &&
            !isAssistantNode(node) &&
            !isCanvasImageGeneratorNode(node) &&
            !isCanvasImageOutputGalleryNode(node) &&
            !isCanvasCameraShotSetNode(node) &&
            !isCanvasTextNode(node),
        ) ?? null
      : null;
  const activeGenerationContext =
    activeGenerationTarget
      ? buildCanvasGenerationContext(activeGenerationTarget.id, nodes, edges, promptText)
      : null;
  const currentSnapshotDocument = useMemo(
    () =>
      buildCanvasSnapshotWithGraph({
        nodes,
        edges,
        activeGenerationTargetId,
        markers,
        addedObjects,
        sketchLines,
        sketchGroups,
        penStrokes,
        penSettings,
        viewportZoom,
      }),
    [activeGenerationTargetId, addedObjects, edges, markers, nodes, penSettings, penStrokes, sketchGroups, sketchLines, viewportZoom],
  );
  const currentSnapshotFingerprint = useMemo(
    () => createSnapshotFingerprint(currentSnapshotDocument),
    [currentSnapshotDocument],
  );

  latestSnapshotDocumentRef.current = currentSnapshotDocument;
  latestSnapshotFingerprintRef.current = currentSnapshotFingerprint;
  latestNodesRef.current = nodes;
  latestEdgesRef.current = edges;
  latestActiveGenerationTargetIdRef.current = activeGenerationTargetId;

  const generatorAssetIdsKey = useMemo(() => {
    const generatorNodeIds = new Set(
      nodes.filter(isCanvasImageGeneratorNode).map((node) => node.id),
    );
    const assetIds = new Set(
      nodes
        .filter(isCanvasImageGeneratorNode)
        .flatMap((node) => node.imageGenerator.outputAssetIds)
        .filter(Boolean),
    );

    for (const edge of edges) {
      if (
        edge.targetPortId !== "image-generator-input-image" ||
        !generatorNodeIds.has(edge.targetId)
      ) {
        continue;
      }

      const sourceNode = nodes.find((node) => node.id === edge.sourceId);
      if (!sourceNode) {
        continue;
      }

      if (sourceNode.sourceImage?.assetId) {
        assetIds.add(sourceNode.sourceImage.assetId);
      }

      if (isPresetGroupNode(sourceNode)) {
        for (const child of sourceNode.presetGroup.children) {
          if (child.sourceImage?.assetId ?? child.assetId) {
            assetIds.add(child.sourceImage?.assetId ?? child.assetId!);
          }
        }
      }
    }

    return [...assetIds].sort().join("|");
  }, [edges, nodes]);

  useEffect(() => {
    if (!supabase || !generatorAssetIdsKey) {
      return;
    }

    const assetIds = generatorAssetIdsKey.split("|").filter(Boolean);
    if (assetIds.length === 0) {
      return;
    }

    let cancelled = false;

    const resolveGeneratorAssets = async () => {
      try {
        const client = requireCanvasSupabaseClient(supabase);
        const response = await authedFetch(client, "/api/assets/resolve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assetIds }),
        });
        const payload = (await response.json().catch(() => ({}))) as AssetResolveResponse;
        if (!response.ok || !payload.data?.assets || cancelled) {
          return;
        }

        setResolvedGeneratorAssetUrls((current) => ({
          ...current,
          ...payload.data!.assets!,
        }));
      } catch {
        // Image generator cards can keep showing persisted metadata and retry later.
      }
    };

    void resolveGeneratorAssets();

    // Delivery URLs are short-lived. Renew them before a card can render an expired reference.
    const refreshInterval = window.setInterval(resolveGeneratorAssets, 12 * 60 * 1000);
    const refreshOnFocus = () => void resolveGeneratorAssets();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [generatorAssetIdsKey, supabase]);

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

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => {
        setCurrentUserId(null);
        setIsAuthReady(true);
      });
      return;
    }

    let cancelled = false;

    const syncSession = async () => {
      try {
        const userId = await getSessionUserId(supabase);
        if (!cancelled) {
          setCurrentUserId(userId);
        }
      } finally {
        if (!cancelled) {
          setIsAuthReady(true);
        }
      }
    };

    void syncSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user.id ?? null);
      setIsAuthReady(true);

      if (!session?.user?.id) {
        void pruneExpiredCanvasDrafts().catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const applyHydratedSnapshotState = useCallback((document: CanvasSnapshotDocument) => {
    const hydrated = hydrateCanvasStateFromSnapshot(document);

    setCanvasViewportZoom(hydrated.viewportZoom);
    setNodes(hydrated.nodes);
    setEdges(hydrated.edges);
    setPromptText(hydrated.promptText);
    setMarkers(hydrated.markers);
    setAddedObjects(hydrated.addedObjects);
    setSketchLines(hydrated.sketchLines);
    setSketchGroups(hydrated.sketchGroups);
    setPenStrokes(hydrated.penStrokes);
    setPenSettings(hydrated.penSettings);
    setActiveGenerationTargetId(hydrated.activeGenerationTargetId);
    setActiveNodeId(hydrated.activeGenerationTargetId);
    setSelectedItem(
      hydrated.activeGenerationTargetId
        ? { type: "node", id: hydrated.activeGenerationTargetId }
        : { type: "none" },
    );
    setPendingGenerationJobs([]);
    setGenerationAssistantMessages([]);
    setSelectedSketchLineIds([]);
    handledGenerationJobIdsRef.current.clear();
  }, [setCanvasViewportZoom]);

  const applySnapshotBaseline = useCallback((document: CanvasSnapshotDocument, snapshot: SnapshotMeta | null) => {
    const documentHash = snapshot?.documentHash?.trim() || createSnapshotFingerprint(document);
    snapshotBaselineRef.current = {
      snapshotId: snapshot?.snapshotId ?? null,
      version: snapshot?.version ?? null,
      documentHash,
    };
    savedSnapshotFingerprintRef.current = documentHash;
    lastPersistedLocalDraftFingerprintRef.current = documentHash;
    setCurrentSnapshotMeta(
      snapshot
        ? {
          ...snapshot,
          documentHash,
        }
        : null,
    );
    setHasUnsavedSnapshotChanges(false);
  }, []);

  const applyCloudDraftMeta = useCallback((draft: ProjectDraftMeta | null) => {
    cloudDraftMetaRef.current = {
      baseSnapshotId: draft?.baseSnapshotId ?? null,
      revision: draft?.revision ?? null,
      documentHash: draft?.documentHash ?? null,
      lastMutationId: draft?.lastMutationId ?? null,
    };
  }, []);

  const persistCanvasNodeImageAsset = useCallback(async (assetParams: {
    blob: Blob;
    title: string;
    mimeType?: string;
    name?: string;
    role?: CanvasNode["role"];
    preserveTitle?: boolean;
  }) => {
    if (!params.projectId) {
      throw new Error("Open this canvas with a projectId before adding images.");
    }

    const client = requireCanvasSupabaseClient(supabase);
    const formData = new FormData();
    formData.set("file", assetParams.blob, assetParams.name ?? `${assetParams.title}.png`);
    formData.set("nodeId", `pending-${Date.now()}`);
    formData.set("title", assetParams.title);

    const response = await authedFetch(client, `/api/projects/${params.projectId}/snapshot/assets`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as SnapshotAssetPersistResponse;
    const persisted = payload.data?.images?.[0];

    if (!response.ok || !persisted) {
      throw new Error(payload.error || "Unable to persist the canvas image.");
    }

    return {
      imageUrl: persisted.imageUrl,
      assetId: persisted.assetId,
      mimeType: persisted.mimeType,
      sizeBytes: persisted.sizeBytes,
      name: assetParams.name ?? assetParams.title,
      role: assetParams.role,
      preserveTitle: assetParams.preserveTitle,
    };
  }, [params.projectId, supabase]);

  const restoreLocalDraftRecord = useCallback(async (record: LocalCanvasDraftRecord) => {
    const client = requireCanvasSupabaseClient(supabase);
    let resolvedDocument = record.document;
    let assetDeliveryWarning: string | null = null;
    try {
      resolvedDocument = await resolveSnapshotRuntimeAssetUrls(client, record.document);
    } catch {
      assetDeliveryWarning = "Local draft restored, but some canvas images could not be refreshed yet.";
    }

    applyHydratedSnapshotState(resolvedDocument);
    snapshotBaselineRef.current = {
      snapshotId: record.meta.basedOnSnapshotId ?? currentSnapshotMeta?.snapshotId ?? null,
      version: record.meta.basedOnVersion ?? currentSnapshotMeta?.version ?? null,
      documentHash: record.meta.basedOnHash ?? currentSnapshotMeta?.documentHash ?? null,
    };
    savedSnapshotFingerprintRef.current = record.meta.basedOnHash ?? currentSnapshotMeta?.documentHash ?? null;
    setHasUnsavedSnapshotChanges(
      Boolean(record.meta.documentHash && record.meta.documentHash !== record.meta.basedOnHash),
    );
    setDraftConflict(null);
    setDraftWarning(assetDeliveryWarning);
  }, [applyHydratedSnapshotState, currentSnapshotMeta, supabase]);

  const persistLocalDraftNow = useCallback(async (projectIdOverride?: string) => {
    const projectId = projectIdOverride ?? params.projectId;
    const attemptedAt = new Date().toISOString();
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const payloadBytes = estimateCanvasPayloadBytes(latestSnapshotDocumentRef.current);
    const snapshotFingerprint = latestSnapshotFingerprintRef.current;
    if (
      !currentUserId ||
      !projectId ||
      isSnapshotLoading ||
      !canvasPersistenceReadyRef.current ||
      !snapshotBaselineRef.current.documentHash
    ) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "local-draft-save",
        projectId: projectId ?? null,
        intent: "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "not-ready",
      });
      return false;
    }

    if (snapshotFingerprint === lastPersistedLocalDraftFingerprintRef.current) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "local-draft-save",
        projectId,
        intent: "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "dedupe",
      });
      return false;
    }

    const mutationId = createDraftMutationId();
    latestDraftMutationIdRef.current = mutationId;
    setIsDraftSaving(true);

    try {
      await saveCanvasDraft(currentUserId, projectId, latestSnapshotDocumentRef.current, {
        tabId: tabIdRef.current,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + LOCAL_DRAFT_TTL_MS).toISOString(),
        basedOnSnapshotId: snapshotBaselineRef.current.snapshotId ?? null,
        basedOnVersion: snapshotBaselineRef.current.version ?? null,
        basedOnHash: snapshotBaselineRef.current.documentHash ?? null,
        documentHash: latestSnapshotFingerprintRef.current,
        cloudDraftRevision: cloudDraftMetaRef.current.revision,
        cloudDraftHash: cloudDraftMetaRef.current.documentHash,
        lastMutationId: mutationId,
      });
      lastPersistedLocalDraftFingerprintRef.current = snapshotFingerprint;

      recordCanvasPersistenceBenchmarkEvent({
        operation: "local-draft-save",
        projectId,
        intent: "autosave",
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: false,
        result: "succeeded",
      });
      return true;
    } catch (error) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "local-draft-save",
        projectId,
        intent: "autosave",
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: false,
        result: "failed",
        errorMessage: error instanceof Error ? error.message : "Local draft save failed.",
      });
      throw error;
    } finally {
      setIsDraftSaving(false);
    }
  }, [currentUserId, isSnapshotLoading, params.projectId]);

  const applyCompletedGenerationJob = useCallback((params: {
    job: CarverAiJobRecord;
    targetNodeId?: string | null;
    targetType?: "canvas-output" | "image-generator";
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

    const generatedImages = params.job.jobResult?.generatedImages ?? [];
    if (generatedImages.length === 0) {
      showToast(getTerminalGenerationStatusMessage(params.job));
      return;
    }

    if (params.targetType === "image-generator" && params.targetNodeId) {
      setNodes((current) => {
        const nextNodes = current.map((node) => {
          if (node.id !== params.targetNodeId || node.kind !== "image-generator") {
            return node;
          }

          const outputs: CanvasImageGeneratorNode["imageGenerator"]["outputs"] = generatedImages.map((image) => ({
            assetId: image.assetId,
            title: image.title,
            prompt: image.prompt,
            imageUrl: image.imageUrl,
            width: image.width,
            height: image.height,
            mimeType: image.mimeType,
            provider: image.provider,
            cameraShot: image.cameraShot,
          }));
          const selectedOutputAssetId =
            node.imageGenerator.selectedOutputAssetId &&
            outputs.some((output) => output.assetId === node.imageGenerator.selectedOutputAssetId)
              ? node.imageGenerator.selectedOutputAssetId
              : outputs[0]?.assetId;
          const selectedOutput =
            outputs.find((output) => output.assetId === selectedOutputAssetId) ?? outputs[0] ?? null;
          const nextSize =
            node.imageGenerator.aspectRatio === "auto" && selectedOutput?.width && selectedOutput?.height
              ? getImageGeneratorCardSize({
                  ratio: resolveImageGeneratorAspectRatio({
                    requested: "auto",
                    inputWidth: selectedOutput.width,
                    inputHeight: selectedOutput.height,
                  }),
                  shortSide: Math.min(node.width, node.height),
                })
              : null;

          return {
            ...node,
            ...(nextSize ?? {}),
            imageUrl: selectedOutput?.imageUrl ?? "",
            sourceImage: selectedOutput
              ? {
                  assetId: selectedOutput.assetId,
                  url: selectedOutput.imageUrl,
                  width: selectedOutput.width,
                  height: selectedOutput.height,
                  mimeType: selectedOutput.mimeType,
                  name: selectedOutput.title,
                  quality: "original" as const,
                }
              : undefined,
            imageGenerator: {
              ...node.imageGenerator,
              status: "completed" as const,
              outputAssetIds: outputs
                .map((output) => output.assetId)
                .filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0),
              outputs,
              selectedOutputAssetId,
              errorMessage: undefined,
              lastRunAt: new Date().toISOString(),
              activeJobId: undefined,
            },
          };
        });
        const generator = nextNodes.find(
          (node): node is CanvasImageGeneratorNode =>
            node.id === params.targetNodeId && node.kind === "image-generator",
        );
        if (!generator) return nextNodes;

        const shouldRenderOutputGallery = shouldCreateImageOutputGallery(generator.imageGenerator.outputAssetIds);
        const galleryId = `image-output-gallery-${generator.id}`;
        const existingGallery = nextNodes.find(
          (node) => node.kind === "image-output-gallery" && node.imageOutputGallery.generatorNodeId === generator.id,
        );
        if (!shouldRenderOutputGallery) {
          return existingGallery
            ? nextNodes.filter((node) => node.id !== galleryId)
            : nextNodes;
        }

        const gallery: CanvasImageOutputGalleryNode = existingGallery && existingGallery.kind === "image-output-gallery"
          ? {
              ...existingGallery,
              width: Math.max(existingGallery.width, MIN_IMAGE_OUTPUT_GALLERY_NODE_WIDTH),
              height: Math.max(existingGallery.height, MIN_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT),
              imageOutputGallery: {
                ...existingGallery.imageOutputGallery,
                selectedOutputAssetId: generator.imageGenerator.selectedOutputAssetId,
              },
            }
          : {
              id: galleryId,
              kind: "image-output-gallery",
              x: generator.x + generator.width * getCanvasNodeVisualScale(generator) + 80,
              y: generator.y,
              width: DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_WIDTH,
              height: Math.max(
                DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT,
                Math.min(generator.height, 460),
              ),
              scale: 1,
              imageUrl: "",
              title: `${generator.title} Outputs`,
              prompt: null,
              role: "output",
              inputPorts: getImageOutputGalleryInputPorts(),
              imageOutputGallery: {
                generatorNodeId: generator.id,
                selectedOutputAssetId: generator.imageGenerator.selectedOutputAssetId,
              },
            };
        return existingGallery
          ? nextNodes.map((node) => node.id === gallery.id ? gallery : node)
          : [...nextNodes, gallery];
      });
      setEdges((current) => {
        const edgeId = `image-generator-gallery-edge-${params.targetNodeId}`;
        if (!shouldCreateImageOutputGallery(generatedImages.map((output) => output.assetId))) {
          return current.filter((edge) => edge.id !== edgeId);
        }
        return current.some((edge) => edge.id === edgeId)
          ? current
          : [
              ...current,
              {
                id: edgeId,
                sourceId: params.targetNodeId!,
                targetId: `image-output-gallery-${params.targetNodeId}`,
                sourcePortId: "image-generator-output-image",
                targetPortId: "image-output-gallery-input-image",
                kind: "image",
                label: "Generated output",
                role: "output_result",
                createdAt: new Date().toISOString(),
              },
            ];
      });
      setSelectedItem({ type: "node", id: params.targetNodeId });
      setActiveNodeId(params.targetNodeId);
      showToast(getTerminalGenerationStatusMessage(params.job));
      return;
    }

    const generatedImage = generatedImages[0];
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
  const applyCompletedGenerationJobEvent = useEffectEvent(applyCompletedGenerationJob);

  const syncCloudDraft = useCallback(async (syncParams: {
    projectId?: string;
    force?: boolean;
    quiet?: boolean;
    allowNonLeader?: boolean;
  } = {}) => {
    const projectId = syncParams.projectId ?? params.projectId;
    const attemptedAt = new Date().toISOString();
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const payloadBytes = estimateCanvasPayloadBytes(latestSnapshotDocumentRef.current);
    if (
      !projectId ||
      !currentUserId ||
      !canvasPersistenceReadyRef.current
    ) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId: projectId ?? null,
        intent: syncParams.force ? "manual" : "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "not-ready",
      });
      return false;
    }

    // A same-entity conflict already has a server-side recovery copy. Keep
    // the local operation journal untouched and pause cloud writes so the
    // autosave debounce cannot submit that same conflicting batch repeatedly.
    if (cloudDraftEntityConflictRef.current) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId,
        intent: syncParams.force ? "manual" : "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "conflict",
      });
      return false;
    }

    const localDraft = await loadCanvasDraft(currentUserId, projectId, tabIdRef.current);
    const pendingOperations = localDraft?.pendingOperations ?? [];
    if (pendingOperations.length === 0) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId,
        intent: "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "dedupe",
      });
      return false;
    }
    // Freeze the exact journal materialization that this batch represents.
    // New edits may continue locally while the request is in flight and must
    // become a later batch, never a mismatched hash for this ACK.
    const snapshotDocument = localDraft?.document ?? latestSnapshotDocumentRef.current;
    const snapshotFingerprint = createSnapshotFingerprint(snapshotDocument);

    if (cloudDraftSyncInFlightRef.current) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId,
        intent: syncParams.force ? "manual" : "autosave",
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "inflight",
      });
      return false;
    }

    cloudDraftSyncInFlightRef.current = true;
    let needsFollowUpSync = false;

    try {
      const client = requireCanvasSupabaseClient(supabase);
      // The first pending operation ID is a stable UUID for this batch. A
      // transport retry must reuse it, otherwise a lost response can become a
      // second write with the same mutations.
      const batchId = pendingOperations[0]?.operationId ?? createDraftMutationId();
      const response = await authedFetch(client, `/api/project-drafts/${projectId}/operations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId,
          clientId: tabIdRef.current,
          baseRevision: localDraft?.meta.cloudDraftRevision ?? cloudDraftMetaRef.current.revision ?? 0,
          operations: pendingOperations.map((operation) => toCanvasOperationV2(operation, {
            clientId: tabIdRef.current,
            clientSequence: operation.sequence,
          })),
          document: snapshotDocument,
          documentHash: snapshotFingerprint,
          baseSnapshotId: snapshotBaselineRef.current.snapshotId ?? null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as DraftRouteResponse;

      if (payload.code === "DRAFT_ENTITY_CONFLICT") {
        cloudDraftEntityConflictRef.current = true;
        cloudDraftFirstDirtyAtRef.current = null;
        cloudDraftRetryAttemptRef.current = 0;
        if (cloudDraftRetryTimeoutRef.current !== null) {
          window.clearTimeout(cloudDraftRetryTimeoutRef.current);
          cloudDraftRetryTimeoutRef.current = null;
        }
        setDraftConflict(localDraft);
        setDraftWarning("Some changes conflicted. A recovery copy was saved and cloud sync is paused to protect local changes.");
        showToast("Some changes conflicted. Local recovery was preserved.");
        recordCanvasPersistenceBenchmarkEvent({
          operation: "cloud-draft-sync",
          projectId,
          intent: syncParams.force ? "manual" : "autosave",
          attemptedAt,
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
          payloadBytes,
          requestSent: true,
          result: "skipped",
          skipReason: "conflict",
        });
        return false;
      }

      if (response.status === 409 || payload.code === "DRAFT_CONFLICT") {
        const syncError = new Error(payload.error || "The project draft changed before this batch could be committed.") as Error & {
          code?: string;
        };
        syncError.code = payload.code ?? "DRAFT_CONFLICT";
        throw syncError;
      }

      if (!response.ok || !payload.data?.draft) {
        const syncError = new Error(payload.error || "Unable to sync the project draft.") as Error & {
          code?: string;
        };
        syncError.code = payload.code;
        throw syncError;
      }

      const hasNewerLocalMutation =
        latestSnapshotFingerprintRef.current !== snapshotFingerprint;
      cloudDraftMetaRef.current = {
        baseSnapshotId: payload.data.draft.baseSnapshotId,
        revision: payload.data.draft.revision,
        documentHash: payload.data.draft.documentHash ?? snapshotFingerprint,
        lastMutationId: hasNewerLocalMutation
          ? latestDraftMutationIdRef.current
          : (payload.data.draft.lastMutationId ?? batchId),
      };
      if (!hasNewerLocalMutation) {
        latestDraftMutationIdRef.current = payload.data.draft.lastMutationId ?? batchId;
      }
      cloudDraftRetryAttemptRef.current = 0;
      cloudDraftFirstDirtyAtRef.current = null;
      if (cloudDraftRetryTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftRetryTimeoutRef.current);
        cloudDraftRetryTimeoutRef.current = null;
      }

      await recordCanvasDraftCloudSync(currentUserId, projectId, {
        cloudDraftRevision: payload.data.draft.revision,
        cloudDraftHash: payload.data.draft.documentHash ?? snapshotFingerprint,
        lastMutationId: payload.data.draft.lastMutationId ?? batchId,
      }, tabIdRef.current).catch(() => undefined);
      await acknowledgeCanvasDraftOperations(currentUserId, projectId, {
        clientId: tabIdRef.current,
        operationIds: payload.data.ackedOperationIds ?? pendingOperations.map((operation) => operation.operationId),
        cloudDraftRevision: payload.data.draft.revision,
        cloudDraftHash: payload.data.draft.documentHash ?? snapshotFingerprint,
        lastMutationId: payload.data.draft.lastMutationId ?? batchId,
      }).catch(() => undefined);

      draftChannelRef.current?.postMessage({
        type: "draft-acknowledged",
        userId: currentUserId,
        projectId,
        tabId: tabIdRef.current,
      });

      // An edit may have happened while this request was active. Its normal
      // debounce can skip because the previous write was in flight, so flush
      // the newer document after this acknowledgement completes.
      needsFollowUpSync = latestSnapshotFingerprintRef.current !== snapshotFingerprint;

      if (!syncParams.quiet) {
        setDraftWarning(null);
      }

      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId,
        intent: syncParams.force ? "manual" : "autosave",
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: true,
        result: "succeeded",
      });
      return true;
    } catch (error) {
      const errorCode =
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : null;
      // These failures require a deployment/configuration correction, so retrying
      // the same batch only spams the API while IndexedDB safely keeps the work.
      const canRetry = ![
        "AUTH_REQUIRED",
        "BAD_REQUEST",
        "PAYLOAD_TOO_LARGE",
        "DRAFT_PERMISSION_ERROR",
        "DRAFT_SCHEMA_ERROR",
      ].includes(errorCode ?? "");
      const retryAttempt = canRetry ? cloudDraftRetryAttemptRef.current + 1 : 0;
      cloudDraftRetryAttemptRef.current = retryAttempt;
      if (!syncParams.quiet) {
        setDraftWarning(
          error instanceof Error
            ? `${error.message} Changes are still saved locally on this device.`
            : "Unable to sync the project draft. Changes are still saved locally on this device.",
        );
      }

      // A failed cloud write must not silently stop autosave. Local IndexedDB
      // remains the recovery source, while a bounded retry restores cloud sync
      // after short network/token/provider interruptions. Conflicts return
      // before this catch and intentionally require user resolution instead.
      if (
        canRetry &&
        retryAttempt <= CLOUD_DRAFT_SYNC_RETRY_LIMIT &&
        typeof window !== "undefined" &&
        cloudDraftRetryTimeoutRef.current === null
      ) {
        const retryDelayMs = Math.min(
          CLOUD_DRAFT_SYNC_RETRY_BASE_MS * 2 ** (retryAttempt - 1),
          30_000,
        );
        cloudDraftRetryTimeoutRef.current = window.setTimeout(() => {
          cloudDraftRetryTimeoutRef.current = null;
          void syncCloudDraft({
            projectId,
            quiet: false,
            allowNonLeader: syncParams.allowNonLeader,
          });
        }, retryDelayMs);
      }
      recordCanvasPersistenceBenchmarkEvent({
        operation: "cloud-draft-sync",
        projectId,
        intent: syncParams.force ? "manual" : "autosave",
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: true,
        result: "failed",
        errorMessage: error instanceof Error ? error.message : "Cloud draft sync failed.",
      });
      return false;
    } finally {
      cloudDraftSyncInFlightRef.current = false;
      if (
        needsFollowUpSync &&
        typeof window !== "undefined" &&
        cloudDraftSyncTimeoutRef.current === null
      ) {
        cloudDraftSyncTimeoutRef.current = window.setTimeout(() => {
          cloudDraftSyncTimeoutRef.current = null;
          void syncCloudDraft({
            projectId,
            quiet: true,
            allowNonLeader: syncParams.allowNonLeader,
          });
        }, 0);
      }
    }
  }, [currentUserId, params.projectId, supabase]);

  const saveSnapshotDocument = useCallback(async (saveParams: {
    projectId?: string;
    reason: "manual" | "close";
    quiet?: boolean;
    keepalive?: boolean;
  }) => {
    const projectId = saveParams.projectId ?? params.projectId;
    const attemptedAt = new Date().toISOString();
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const payloadBytes = estimateCanvasPayloadBytes(latestSnapshotDocumentRef.current);
    if (!projectId) {
      if (!saveParams.quiet) {
        showToast("Open this canvas with a projectId before saving snapshots.");
      }
      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId: null,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "missing-project",
      });
      return false;
    }

    if (!canvasPersistenceReadyRef.current) {
      if (!saveParams.quiet) {
        showToast("Canvas data is still loading. Please wait before saving a version.");
      }
      return false;
    }

    const snapshotDocument = latestSnapshotDocumentRef.current;
    const snapshotFingerprint = latestSnapshotFingerprintRef.current;
    const baselineHash = snapshotBaselineRef.current.documentHash;
    const isDirty = Boolean(snapshotFingerprint && baselineHash && snapshotFingerprint !== baselineHash);

    if (!isDirty) {
      setHasUnsavedSnapshotChanges(false);
      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "not-dirty",
      });
      return false;
    }

    if (saveParams.reason === "close" && hasTransientSnapshotContent(snapshotDocument)) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "transient-content",
      });
      return false;
    }

    if (snapshotSaveInFlightRef.current) {
      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: 0,
        payloadBytes,
        requestSent: false,
        result: "skipped",
        skipReason: "inflight",
      });
      return false;
    }

    snapshotSaveInFlightRef.current = true;
    setIsSnapshotSaving(true);

    try {
      await persistLocalDraftNow(projectId).catch(() => undefined);
      const cloudDraftSynced = await syncCloudDraft({
        projectId,
        force: true,
        quiet: true,
        allowNonLeader: true,
      });

      const currentDraftRevision = cloudDraftMetaRef.current.revision;
      if (
        !cloudDraftSynced ||
        !currentDraftRevision ||
        cloudDraftMetaRef.current.documentHash !== snapshotFingerprint
      ) {
        recordCanvasPersistenceBenchmarkEvent({
          operation: "snapshot-finalize",
          projectId,
          intent: saveParams.reason,
          attemptedAt,
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
          payloadBytes,
          requestSent: false,
          result: "skipped",
          skipReason: "missing-revision",
        });
        throw new Error("Unable to finalize a version before the cloud draft is synced.");
      }

      const client = requireCanvasSupabaseClient(supabase);
      const fetcher = saveParams.keepalive ? authedKeepaliveFetch : authedFetch;
      const response = await fetcher(client, `/api/project-drafts/${projectId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: currentDraftRevision,
          reason: saveParams.reason,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as DraftFinalizeRouteResponse;

      if (response.status === 409 || payload.code === "DRAFT_CONFLICT") {
        setDraftWarning("Cloud draft changed in another tab or device before this version could be saved.");
        recordCanvasPersistenceBenchmarkEvent({
          operation: "snapshot-finalize",
          projectId,
          intent: saveParams.reason,
          attemptedAt,
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
          payloadBytes,
          requestSent: true,
          result: "skipped",
          skipReason: "conflict",
        });
        return false;
      }

      if (!response.ok || !payload.data?.snapshot) {
        throw new Error(payload.error || "Unable to save the current snapshot.");
      }

      const hasNewerLocalChanges = latestSnapshotFingerprintRef.current !== snapshotFingerprint;
      applySnapshotBaseline(snapshotDocument, payload.data.snapshot);
      cloudDraftMetaRef.current = {
        baseSnapshotId: payload.data.snapshot.snapshotId,
        revision: payload.data.snapshot.draftRevision ?? currentDraftRevision,
        documentHash: payload.data.snapshot.documentHash ?? snapshotFingerprint,
        lastMutationId: latestDraftMutationIdRef.current,
      };

      if (currentUserId && !hasNewerLocalChanges) {
        await markCanvasDraftClean(currentUserId, projectId, {
          tabId: tabIdRef.current,
          basedOnSnapshotId: payload.data.snapshot.snapshotId,
          basedOnVersion: payload.data.snapshot.version,
          basedOnHash: snapshotFingerprint,
          documentHash: snapshotFingerprint,
          cloudDraftRevision: cloudDraftMetaRef.current.revision,
          cloudDraftHash: cloudDraftMetaRef.current.documentHash,
          lastMutationId: cloudDraftMetaRef.current.lastMutationId,
        });
      }
      setDraftConflict(null);
      setHasUnsavedSnapshotChanges(hasNewerLocalChanges);
      setDraftWarning(
        hasNewerLocalChanges
          ? "A version was saved, but newer canvas changes are still being saved locally and synced to the cloud."
          : null,
      );

      if (!saveParams.quiet) {
        showToast(
          saveParams.reason === "manual"
            ? `Version saved as v${payload.data.snapshot.version}`
            : `Close version saved as v${payload.data.snapshot.version}`,
        );
      }

      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: true,
        result: "succeeded",
      });
      return true;
    } catch (error) {
      if (!saveParams.quiet) {
        showToast(
          error instanceof Error
            ? error.message
            : "Unable to save the current snapshot.",
        );
      }
      recordCanvasPersistenceBenchmarkEvent({
        operation: "snapshot-finalize",
        projectId,
        intent: saveParams.reason,
        attemptedAt,
        durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
        payloadBytes,
        requestSent: Boolean(projectId),
        result: "failed",
        errorMessage: error instanceof Error ? error.message : "Snapshot finalize failed.",
      });
      return false;
    } finally {
      snapshotSaveInFlightRef.current = false;
      setIsSnapshotSaving(false);
    }
  }, [applySnapshotBaseline, currentUserId, params.projectId, persistLocalDraftNow, supabase, syncCloudDraft]);

  useEffect(() => {
    if (!activeGenerationTargetId) return;
    if (nodes.some((node) => node.id === activeGenerationTargetId && !isPresetGroupNode(node) && !isAssistantNode(node))) return;

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

  const reconcileRemoteCanvasOperations = useCallback(async () => {
    if (
      !currentUserId ||
      !params.projectId ||
      cloudDraftEntityConflictRef.current ||
      remoteCanvasReconcileInFlightRef.current
    ) return;

    remoteCanvasReconcileInFlightRef.current = true;
    try {
      const afterRevision = cloudDraftMetaRef.current.revision ?? 0;
      const client = requireCanvasSupabaseClient(supabase);
      const response = await authedFetch(
        client,
        `/api/project-drafts/${params.projectId}/operations?afterRevision=${afterRevision}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as DraftRouteResponse;
      const remoteOperations = (payload.data?.operations ?? [])
        .filter((operation) => operation.clientId !== tabIdRef.current);
      if (!response.ok || remoteOperations.length === 0) return;

      const localDraft = await loadCanvasDraft(currentUserId, params.projectId, tabIdRef.current);
      const conflict = getCanvasOperationConflict(localDraft?.pendingOperations ?? [], remoteOperations);
      if (conflict.hasConflict) {
        // Keep the pending journal intact as the recovery branch, but do not
        // repeatedly re-read the same remote change on every canvas mutation.
        cloudDraftEntityConflictRef.current = true;
        cloudDraftFirstDirtyAtRef.current = null;
        if (cloudDraftSyncTimeoutRef.current !== null) {
          window.clearTimeout(cloudDraftSyncTimeoutRef.current);
          cloudDraftSyncTimeoutRef.current = null;
        }
        setDraftConflict(localDraft);
        setDraftWarning("Another tab changed the same canvas item. Your local changes remain in the recovery journal.");
        return;
      }

      const latestRevision = Math.max(
        afterRevision,
        ...remoteOperations.map((operation) => operation.committedRevision ?? afterRevision),
      );
      await applyRemoteCanvasDraftOperations(currentUserId, params.projectId, {
        clientId: tabIdRef.current,
        operations: remoteOperations.map((operation) => operation.payload),
        cloudDraftRevision: latestRevision,
      });
      applyHydratedSnapshotState(applyCanvasDraftOperations(
        latestSnapshotDocumentRef.current,
        remoteOperations.map((operation) => operation.payload),
      ));
      cloudDraftMetaRef.current = {
        ...cloudDraftMetaRef.current,
        revision: latestRevision,
      };
    } finally {
      remoteCanvasReconcileInFlightRef.current = false;
    }
  }, [applyHydratedSnapshotState, currentUserId, params.projectId, supabase]);

  useEffect(() => {
    if (!currentUserId || !params.projectId) {
      draftChannelRef.current?.close();
      draftChannelRef.current = null;
      return;
    }

    const channel = new BroadcastChannel(DRAFT_BROADCAST_CHANNEL);
    draftChannelRef.current = channel;
    channel.onmessage = (event) => {
      const message = event.data as
        | {
          type?: "draft-updated";
          userId?: string;
          projectId?: string;
          tabId?: string;
        }
        | {
          type?: "draft-leader";
          userId?: string;
          projectId?: string;
          tabId?: string;
        }
        | {
          type?: "draft-acknowledged";
          userId?: string;
          projectId?: string;
          tabId?: string;
        }
        | undefined;

      if (!message) {
        return;
      }

      if (
        message.userId !== currentUserId ||
        message.projectId !== params.projectId ||
        message.tabId === tabIdRef.current
      ) {
        return;
      }

      if (message.type === "draft-acknowledged") {
        void reconcileRemoteCanvasOperations().catch(() => undefined);
      }

      if (message.type === "draft-leader") {
        // Compatibility with messages from older tabs. New tabs rely on CAS
        // batches, so a leader is not part of correctness anymore.
        void reconcileRemoteCanvasOperations().catch(() => undefined);
      }
    };

    return () => {
      channel.close();
      if (draftChannelRef.current === channel) {
        draftChannelRef.current = null;
      }
    };
  }, [currentUserId, params.projectId, reconcileRemoteCanvasOperations]);

  useEffect(() => {
    const handleFocus = () => {
      void reconcileRemoteCanvasOperations().catch(() => undefined);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [reconcileRemoteCanvasOperations]);

  useEffect(() => {
    const projectId = params.projectId;
    canvasPersistenceReadyRef.current = false;
    cloudDraftEntityConflictRef.current = false;
    if (!projectId) {
      savedSnapshotFingerprintRef.current = null;
      applyCloudDraftMeta(null);
      snapshotBaselineRef.current = {
        snapshotId: null,
        version: null,
        documentHash: null,
      };
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
      if (cloudDraftSyncTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftSyncTimeoutRef.current);
        cloudDraftSyncTimeoutRef.current = null;
      }
      if (cloudDraftRetryTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftRetryTimeoutRef.current);
        cloudDraftRetryTimeoutRef.current = null;
      }
      cloudDraftRetryAttemptRef.current = 0;
      queueMicrotask(() => {
        setIsSnapshotLoading(false);
        setCurrentSnapshotMeta(null);
        setHasUnsavedSnapshotChanges(false);
        setDraftConflict(null);
        setDraftWarning(null);
      });
      return;
    }

    if (!isAuthReady) {
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
      const attemptedAt = new Date().toISOString();
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      try {
        const client = requireCanvasSupabaseClient(supabase);
        const [snapshotResponse, draftResponse] = await Promise.all([
          authedFetch(
            client,
            `/api/projects/${projectId}/snapshot`,
            {
              cache: "no-store",
            },
          ),
          authedFetch(
            client,
            `/api/project-drafts/${projectId}`,
            {
              cache: "no-store",
            },
          ),
        ]);
        const snapshotPayload = (await snapshotResponse.json().catch(() => ({}))) as SnapshotRouteResponse;
        const draftPayload = (await draftResponse.json().catch(() => ({}))) as DraftRouteResponse;

        const snapshotDocument = snapshotResponse.ok && snapshotPayload.data?.document
          ? coerceCanvasSnapshotDocument(snapshotPayload.data.document)
          : null;
        const cloudDraftDocument = draftResponse.ok && draftPayload.data?.document
          ? coerceCanvasSnapshotDocument(draftPayload.data.document)
          : null;
        const cloudDraftMeta = draftResponse.ok ? draftPayload.data?.draft ?? null : null;
        // A draft is a valid current canvas source. A transient/missing
        // immutable snapshot must never cause the client to hydrate an empty
        // document and overwrite that draft on the next autosave.
        const baseDocument = cloudDraftDocument ?? snapshotDocument;
        if (!baseDocument) {
          throw new Error(
            snapshotPayload.error || draftPayload.error || "Unable to load the current canvas document.",
          );
        }
        const snapshotMeta = snapshotDocument ? snapshotPayload.data?.snapshot ?? null : null;
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        applySnapshotBaseline(snapshotDocument ?? baseDocument, snapshotMeta);
        applyCloudDraftMeta(cloudDraftMeta);
        setDraftConflict(null);
        setDraftWarning(
          draftPayload.data?.assetDeliveryWarning ??
          snapshotPayload.data?.assetDeliveryWarning ??
          (cloudDraftMeta &&
            snapshotMeta?.snapshotId &&
            cloudDraftMeta.baseSnapshotId &&
            cloudDraftMeta.baseSnapshotId !== snapshotMeta.snapshotId
            ? "A cloud draft based on a different saved version was restored."
            : null),
        );

        const draftRecord =
          currentUserId ? await loadCanvasDraft(currentUserId, projectId, tabIdRef.current) : null;
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        if (!draftRecord) {
          if (currentUserId) {
            await initializeCanvasDraftBranch(currentUserId, projectId, {
              clientId: tabIdRef.current,
              document: baseDocument,
              documentHash: createSnapshotFingerprint(baseDocument),
              basedOnSnapshotId: snapshotMeta?.snapshotId ?? null,
              basedOnVersion: snapshotMeta?.version ?? null,
              basedOnHash: snapshotMeta?.documentHash ?? null,
              cloudDraftRevision: cloudDraftMeta?.revision ?? null,
              cloudDraftHash: cloudDraftMeta?.documentHash ?? null,
            });
          }
          applyHydratedSnapshotState(baseDocument);
          canvasPersistenceReadyRef.current = true;
          return;
        }

        if (
          cloudDraftDocument &&
          hasCanvasDocumentContent(cloudDraftDocument) &&
          !hasCanvasDocumentContent(draftRecord.document) &&
          draftRecord.pendingOperations.length === 0
        ) {
          // This branch was created from an empty pre-hydration canvas. It has
          // no user operations to recover, so safely repair it from cloud.
          await replaceEmptyCanvasDraftCheckpoint(currentUserId!, projectId, {
            clientId: tabIdRef.current,
            document: baseDocument,
            documentHash: createSnapshotFingerprint(baseDocument),
            basedOnSnapshotId: snapshotMeta?.snapshotId ?? null,
            basedOnVersion: snapshotMeta?.version ?? null,
            basedOnHash: snapshotMeta?.documentHash ?? null,
            cloudDraftRevision: cloudDraftMeta?.revision ?? null,
            cloudDraftHash: cloudDraftMeta?.documentHash ?? null,
          });
          applyHydratedSnapshotState(baseDocument);
          canvasPersistenceReadyRef.current = true;
          setDraftWarning("Recovered the cloud canvas after an incomplete local load.");
          return;
        }

        if (draftRecord.meta.documentHash === draftRecord.meta.basedOnHash) {
          applyHydratedSnapshotState(baseDocument);
          canvasPersistenceReadyRef.current = true;
          return;
        }

        const dbVersion = snapshotMeta?.version ?? 0;
        const hasSnapshotConflict =
          (typeof draftRecord.meta.basedOnVersion === "number" && draftRecord.meta.basedOnVersion < dbVersion) ||
          Boolean(
            draftRecord.meta.basedOnSnapshotId &&
            snapshotMeta?.snapshotId &&
            draftRecord.meta.basedOnSnapshotId !== snapshotMeta.snapshotId,
          );
        const hasCloudConflict =
          typeof draftRecord.meta.cloudDraftRevision === "number" &&
          typeof cloudDraftMeta?.revision === "number" &&
          draftRecord.meta.cloudDraftRevision < cloudDraftMeta.revision;

        if (hasSnapshotConflict || hasCloudConflict) {
          applyHydratedSnapshotState(baseDocument);
          // Never clear a branch merely because the cloud advanced. Its pending
          // operations are the only lossless input for a later rebase/recovery.
          cloudDraftEntityConflictRef.current = true;
          setDraftConflict(draftRecord);
          setDraftWarning("A newer cloud draft exists. Local changes remain safe and can be recovered.");
          canvasPersistenceReadyRef.current = true;
          return;
        }

        let resolvedDraft = draftRecord.document;
        try {
          resolvedDraft = await resolveSnapshotRuntimeAssetUrls(client, draftRecord.document);
        } catch {
          setDraftWarning("Local draft restored, but some canvas images could not be refreshed yet.");
        }
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        applyHydratedSnapshotState(resolvedDraft);
        snapshotBaselineRef.current = {
          snapshotId: draftRecord.meta.basedOnSnapshotId ?? snapshotMeta?.snapshotId ?? null,
          version: draftRecord.meta.basedOnVersion ?? snapshotMeta?.version ?? null,
          documentHash: draftRecord.meta.basedOnHash ?? snapshotMeta?.documentHash ?? null,
        };
        savedSnapshotFingerprintRef.current =
          draftRecord.meta.basedOnHash ?? snapshotMeta?.documentHash ?? null;
        setHasUnsavedSnapshotChanges(
          Boolean(draftRecord.meta.documentHash && draftRecord.meta.documentHash !== draftRecord.meta.basedOnHash),
        );
        recordCanvasPersistenceBenchmarkEvent({
          operation: "snapshot-load",
          projectId,
          intent: "load",
          attemptedAt,
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
          payloadBytes: estimateCanvasPayloadBytes(baseDocument),
          requestSent: true,
          result: "succeeded",
        });
        canvasPersistenceReadyRef.current = true;
      } catch (error) {
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        // Keep the current state intact and pause persistence. Writing an empty
        // fallback here is how a temporary load failure can erase a valid draft.
        canvasPersistenceReadyRef.current = false;
        setDraftWarning("Canvas data could not be loaded. Autosave is paused until reload succeeds.");
        showToast(
          error instanceof Error
            ? error.message
            : "Unable to load the current canvas snapshot.",
        );
        recordCanvasPersistenceBenchmarkEvent({
          operation: "snapshot-load",
          projectId,
          intent: "load",
          attemptedAt,
          durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
          payloadBytes: 0,
          requestSent: true,
          result: "failed",
          errorMessage: error instanceof Error ? error.message : "Snapshot load failed.",
        });
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
  }, [applyCloudDraftMeta, applyHydratedSnapshotState, applySnapshotBaseline, currentUserId, isAuthReady, params.projectId, supabase]);

  useEffect(() => {
    const baselineHash = snapshotBaselineRef.current.documentHash;
    if (!params.projectId || !baselineHash) {
      setHasUnsavedSnapshotChanges(false);
      return;
    }

    setHasUnsavedSnapshotChanges(baselineHash !== currentSnapshotFingerprint);
  }, [currentSnapshotFingerprint, params.projectId]);

  useEffect(() => {
    const projectId = params.projectId;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }

    if (
      !currentUserId ||
      !projectId ||
      isSnapshotLoading ||
      !snapshotBaselineRef.current.documentHash
    ) {
      return;
    }

    const currentHash = latestSnapshotFingerprintRef.current;
    if (
      !currentHash ||
      currentHash === snapshotBaselineRef.current.documentHash ||
      currentHash === lastPersistedLocalDraftFingerprintRef.current
    ) {
      return;
    }

    draftSaveTimeoutRef.current = window.setTimeout(() => {
      draftSaveTimeoutRef.current = null;
      void persistLocalDraftNow(projectId).catch(() => undefined);
    }, LOCAL_DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [
    currentSnapshotFingerprint,
    currentUserId,
    isSnapshotLoading,
    params.projectId,
    persistLocalDraftNow,
  ]);

  useEffect(() => {
    if (cloudDraftSyncTimeoutRef.current !== null) {
      window.clearTimeout(cloudDraftSyncTimeoutRef.current);
      cloudDraftSyncTimeoutRef.current = null;
    }

    if (
      !currentUserId ||
      !params.projectId ||
      isSnapshotLoading ||
      !snapshotBaselineRef.current.documentHash
    ) {
      return;
    }

    const baselineHash = snapshotBaselineRef.current.documentHash;
    const currentHash = latestSnapshotFingerprintRef.current;
    if (!currentHash || currentHash === baselineHash || currentHash === cloudDraftMetaRef.current.documentHash) {
      cloudDraftFirstDirtyAtRef.current = null;
      return;
    }

    const now = Date.now();
    const firstDirtyAt = cloudDraftFirstDirtyAtRef.current ?? now;
    cloudDraftFirstDirtyAtRef.current = firstDirtyAt;
    const delayMs = Math.max(
      0,
      Math.min(CLOUD_DRAFT_SYNC_DEBOUNCE_MS, CLOUD_DRAFT_SYNC_MAX_WAIT_MS - (now - firstDirtyAt)),
    );

    cloudDraftSyncTimeoutRef.current = window.setTimeout(() => {
      cloudDraftSyncTimeoutRef.current = null;
      void syncCloudDraft({
        quiet: true,
      }).catch(() => undefined);
    }, delayMs);

    return () => {
      if (cloudDraftSyncTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftSyncTimeoutRef.current);
        cloudDraftSyncTimeoutRef.current = null;
      }
    };
  }, [
    currentSnapshotFingerprint,
    currentUserId,
    isSnapshotLoading,
    params.projectId,
    syncCloudDraft,
  ]);

  useEffect(() => {
    const flushPendingLocalDraft = () => {
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }

      void persistLocalDraftNow().catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingLocalDraft();
      }
    };

    const handlePageHide = () => {
      flushPendingLocalDraft();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistLocalDraftNow]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void pruneExpiredCanvasDrafts(currentUserId).catch(() => undefined);
  }, [currentUserId, params.projectId]);

  useEffect(() => {
    if (currentUserId || !params.projectId) {
      return;
    }

    queueMicrotask(() => {
      setDraftConflict(null);
      setDraftWarning(null);
    });
  }, [currentUserId, params.projectId]);

  useEffect(() => {
    if (!params.projectId) return;

    const resumableJobs = nodes.flatMap((node) =>
      node.kind === "image-generator" &&
      node.imageGenerator.activeJobId &&
      (node.imageGenerator.status === "queued" || node.imageGenerator.status === "generating")
        ? [{
            jobId: node.imageGenerator.activeJobId,
            projectId: params.projectId!,
            targetNodeId: node.id,
            targetType: "image-generator" as const,
          }]
        : [],
    );
    if (resumableJobs.length === 0) return;

    queueMicrotask(() => {
      setPendingGenerationJobs((current) => {
        const missing = resumableJobs.filter((candidate) => !current.some((entry) => entry.jobId === candidate.jobId));
        return missing.length > 0 ? [...current, ...missing] : current;
      });
    });
  }, [nodes, params.projectId]);

  useEffect(() => {
    if (pendingGenerationJobs.length === 0) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    const setGeneratorRuntimeState = (
      nodeId: string,
      update: Partial<CanvasImageGeneratorNode["imageGenerator"]>,
    ) => {
      setNodes((current) => {
        let changed = false;
        const next = current.map((node) => {
          if (node.id !== nodeId || node.kind !== "image-generator") {
            return node;
          }

          const hasChange = Object.entries(update).some(
            ([key, value]) => node.imageGenerator[key as keyof typeof node.imageGenerator] !== value,
          );
          if (!hasChange) {
            return node;
          }

          changed = true;
          return {
            ...node,
            imageGenerator: {
              ...node.imageGenerator,
              ...update,
            },
          };
        });
        return changed ? next : current;
      });
    };

    const pollPendingJob = async (pendingJob: PendingGenerationJob) => {
      if (cancelled || generationPollInFlightJobIdsRef.current.has(pendingJob.jobId)) return;
      generationPollInFlightJobIdsRef.current.add(pendingJob.jobId);

      try {
        const response = await authedFetch(
          requireCanvasSupabaseClient(supabase),
          `/api/projects/${pendingJob.projectId}/ai-jobs/${pendingJob.jobId}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => ({}))) as GetAiJobResponse;
        if (cancelled) return;
        recordAiJobPollRequest({
          jobId: pendingJob.jobId,
          projectId: pendingJob.projectId,
          status: payload.data?.job?.status ?? null,
        });

        if (!response.ok || !payload.data?.job) {
          throw new Error(payload.error || "Unable to load AI job status.");
        }

        const job = payload.data.job;
        if (handledGenerationJobIdsRef.current.has(job.id)) {
          setPendingGenerationJobs((current) => current.filter((entry) => entry.jobId !== job.id));
          return;
        }

        if (pendingJob.targetType === "image-generator") {
          if (job.status === "running") {
            setGeneratorRuntimeState(pendingJob.targetNodeId, { status: "generating" });
          } else if (job.status === "queued") {
            setGeneratorRuntimeState(pendingJob.targetNodeId, { status: "queued" });
          }
        }

        if (job.status === "queued" || job.status === "running") {
          return;
        }

        handledGenerationJobIdsRef.current.add(job.id);
        setPendingGenerationJobs((current) => current.filter((entry) => entry.jobId !== job.id));

        switch (job.status as string) {
          case "failed":
          case "cancelled":
          case "enqueue_failed":
            finishAiJobBenchmarkRun({
              jobId: job.id,
              projectId: pendingJob.projectId,
              terminalStatus: job.status === "enqueue_failed" ? "enqueue_failed" : job.status === "cancelled" ? "cancelled" : "failed",
              generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
              errorMessage: job.errorMessage ?? getTerminalGenerationStatusMessage(job),
            });
            if (pendingJob.targetType === "image-generator") {
              setGeneratorRuntimeState(pendingJob.targetNodeId, {
                status: "error",
                errorMessage: job.errorMessage ?? "Generation failed. Please try again.",
                activeJobId: undefined,
              });
            }
            showToast(getTerminalGenerationStatusMessage(job));
            return;
          default:
            break;
        }

        finishAiJobBenchmarkRun({
          jobId: job.id,
          projectId: pendingJob.projectId,
          terminalStatus: "succeeded",
          generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
        });
        applyCompletedGenerationJobEvent({
          job,
          targetNodeId: pendingJob.targetNodeId,
          targetType: pendingJob.targetType,
          syncAssistantMessage: pendingJob.targetType !== "image-generator",
        });
      } catch (error) {
        if (cancelled) return;
        finishAiJobBenchmarkRun({
          jobId: pendingJob.jobId,
          projectId: pendingJob.projectId,
          terminalStatus: "poll_abandoned",
          generatedImageCount: 0,
          errorMessage: error instanceof Error ? error.message : "Unable to load AI job status.",
        });
        setPendingGenerationJobs((current) => current.filter((entry) => entry.jobId !== pendingJob.jobId));
        if (pendingJob.targetType === "image-generator") {
          setGeneratorRuntimeState(pendingJob.targetNodeId, {
            status: "error",
            errorMessage: error instanceof Error ? error.message : "Unable to load AI job status.",
            activeJobId: undefined,
          });
        }
        showToast(error instanceof Error ? error.message : "Unable to load AI job status.");
      } finally {
        generationPollInFlightJobIdsRef.current.delete(pendingJob.jobId);
      }
    };

    const pollJobs = async () => {
      await Promise.all(pendingGenerationJobs.map((pendingJob) => pollPendingJob(pendingJob)));
    };

    const pollAndScheduleNext = async () => {
      await pollJobs();
      if (!cancelled) {
        timeoutId = window.setTimeout(() => {
          void pollAndScheduleNext();
        }, 2000);
      }
    };

    void pollAndScheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [pendingGenerationJobs, supabase]);


  // ── Actions ─────────────────────────────────────────────────────────────────

  // Hiển thị toast ngắn và tự ẩn sau một khoảng thời gian cố định.
  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

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
      if (
        nextNode &&
        !isPresetGroupNode(nextNode) &&
        !isAssistantNode(nextNode) &&
        !isCanvasImageGeneratorNode(nextNode) &&
        !isCanvasTextNode(nextNode)
      ) {
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
  const handleImageAction = (targetNodeId: string, x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here", targetNodeId }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
    }
  };

  // Thêm object mẫu lên canvas và trả tool về chế độ chọn.
  const addObject = (label: string) => {
    const selectedNodeId =
      selectedItem.type === "node" || selectedItem.type === "image"
        ? nodes.find(
            (node) =>
              node.id === selectedItem.id &&
              !isPresetGroupNode(node) &&
              !isAssistantNode(node) &&
              !isCanvasImageGeneratorNode(node) &&
              !isCanvasTextNode(node),
          )?.id ?? null
        : null;
    const targetNodeId =
      selectedNodeId ??
      activeGenerationTargetId ??
      nodes.find(
        (node) =>
          !isPresetGroupNode(node) &&
          !isAssistantNode(node) &&
          !isCanvasImageGeneratorNode(node) &&
          !isCanvasTextNode(node),
      )?.id ??
      null;
    if (!targetNodeId) {
      showToast("Select a site image before placing an object.");
      return;
    }

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
        targetNodeId,
      },
    ]);
    setSelectedItem({ type: "object", id });
    setShowAddObjectMenu(false);
    setActiveTool("select");
    animateIn(".added-object");
  };

  const addAssistantNode = () => {
    const selectedNode =
      selectedItem.type === "node" || selectedItem.type === "image"
        ? nodes.find((node) => node.id === selectedItem.id)
        : null;
    const anchorNode = selectedNode ?? nodes.at(-1) ?? null;
    const id = `assistant-${Date.now()}`;
    const title = `Assistant #${nodes.filter((node) => isAssistantNode(node)).length + 1}`;
    const newNode: CanvasNode = {
      id,
      kind: "assistant",
      x: anchorNode ? anchorNode.x + anchorNode.width + 96 : 220 + nodes.length * 24,
      y: anchorNode ? anchorNode.y : 180 + nodes.length * 18,
      width: DEFAULT_ASSISTANT_NODE_WIDTH,
      height: DEFAULT_ASSISTANT_NODE_HEIGHT,
      scale: 1,
      imageUrl: "",
      title,
      prompt: null,
      role: "assistant",
      model: "GPT-5 Mini",
      inputPorts: getAssistantInputPorts(),
      assistant: {
        mode: "prompt",
        prompt: "",
        response: "",
        model: "GPT-5 Mini",
        outputFormat: "text",
        status: "idle",
      },
    };

    setNodes((current) => [...current, newNode]);
    setSelectedItem({ type: "node", id });
    setActiveTool("select");
    showToast("Assistant object added to canvas");
  };

  const addContextGroupNode = (kind: CanvasContextGroupKind, sourceNodeIds?: string[]) => {
    const selectedNodeId =
      selectedItem.type === "node" || selectedItem.type === "image"
        ? selectedItem.id
        : null;
    const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
    const selectedNodes = sourceNodeIds?.length
      ? nodes.filter((node) => sourceNodeIds.includes(node.id))
      : selectedNode
        ? [selectedNode]
        : [];
    const items = createContextGroupItems(selectedNodes, kind);
    const anchorNode = selectedNode ?? nodes.at(-1) ?? null;
    const id = `context-group-${kind}-${Date.now()}`;
    const label = CONTEXT_GROUP_LABELS[kind];

    const newNode: CanvasNode = {
      id,
      kind: "context-group",
      x: anchorNode ? anchorNode.x + anchorNode.width + 88 : 220 + nodes.length * 24,
      y: anchorNode ? anchorNode.y : 200 + nodes.length * 18,
      width: DEFAULT_CONTEXT_GROUP_NODE_WIDTH,
      height: DEFAULT_CONTEXT_GROUP_NODE_HEIGHT,
      scale: 1,
      imageUrl: "",
      title: label,
      prompt: null,
      role: "reference",
      inputPorts: getContextGroupInputPorts(),
      contextGroup: {
        kind,
        items,
        description: items.length > 0
          ? `${label} built from ${items.length} selected canvas reference${items.length === 1 ? "" : "s"}.`
          : `Select a canvas image, then recreate this ${label} to attach its reference.`,
      },
    };

    setNodes((current) => [...current, newNode]);
    setSelectedItem({ type: "node", id });
    setActiveTool("select");
    showToast(
      items.length > 0
        ? `${label} added with ${items.length} context reference.`
        : `${label} added empty. Select an image first to create a populated group.`,
    );
  };

  const addCameraShotSetNode = (
    selectedShotIds: CanvasCameraShotPreset[] = ["eye-level"],
    mode: CanvasMultiAnglesMode = "orbit",
  ) => {
    const selectedNode =
      selectedItem.type === "node" || selectedItem.type === "image"
        ? nodes.find((node) => node.id === selectedItem.id)
        : null;
    const anchorNode = selectedNode ?? nodes.at(-1) ?? null;
    const id = `camera-shot-set-${Date.now()}`;

    setNodes((current) => [
      ...current,
      {
        id,
        kind: "camera-shot-set",
        x: anchorNode ? anchorNode.x + anchorNode.width + 88 : 260 + nodes.length * 24,
        y: anchorNode ? anchorNode.y : 220 + nodes.length * 18,
        width: DEFAULT_CAMERA_SHOT_SET_NODE_WIDTH,
        height: DEFAULT_CAMERA_SHOT_SET_NODE_HEIGHT,
        scale: 1,
        imageUrl: "",
        title: `Multi-Angles #${current.filter(isCanvasCameraShotSetNode).length + 1}`,
        prompt: null,
        role: "reference",
        inputPorts: getCameraShotSetInputPorts(),
        cameraShotSet: createCameraShotSet(selectedShotIds, mode),
      },
    ]);
    setSelectedItem({ type: "node", id });
    setActiveTool("select");
    showToast("Camera Shot Set added. Connect it to an Assistant or Image Generator.");
  };

  const updateCameraShotSet = useCallback((nodeId: string, cameraShotSet: CanvasCameraShotSetState) => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (!isCanvasCameraShotSetNode(node) || node.id !== nodeId) return node;
        if (areCameraShotSetStatesEqual(node.cameraShotSet, cameraShotSet)) return node;
        changed = true;
        return {
          ...node,
          cameraShotSet,
        };
      });
      return changed ? next : current;
    });
  }, []);

  const addImageGeneratorNode = () => {
    const selectedNode =
      selectedItem.type === "node" || selectedItem.type === "image"
        ? nodes.find((node) => node.id === selectedItem.id)
        : null;
    const anchorNode = selectedNode ?? nodes.at(-1) ?? null;
    const id = `image-generator-${Date.now()}`;
    const title = `Image Generator #${nodes.filter((node) => isCanvasImageGeneratorNode(node)).length + 1}`;
    const defaultSize = getImageGeneratorCardSize({ ratio: "1:1" });
    const newNode: CanvasNode = {
      id,
      kind: "image-generator",
      x: anchorNode ? anchorNode.x + anchorNode.width + 112 : 280 + nodes.length * 24,
      y: anchorNode ? anchorNode.y : 220 + nodes.length * 18,
      width: defaultSize.width,
      height: defaultSize.height,
      scale: 1,
      imageUrl: "",
      title,
      prompt: null,
      role: "generator",
      model: "auto",
      inputPorts: getImageGeneratorInputPorts(),
      imageGenerator: {
        prompt: "",
        model: "auto",
        aspectRatio: "1:1",
        outputCount: 1,
        status: "idle",
        outputAssetIds: [],
        outputs: [],
      },
    };

    setNodes((current) => [...current, newNode]);
    setSelectedItem({ type: "node", id });
    setActiveNodeId(id);
    setActiveGenerationTargetId(null);
    setActiveTool("select");
    showToast("Image Generator added to canvas");
  };

  const updateAssistantNode = useCallback((
    nodeId: string,
    update: Partial<Extract<CanvasNode, { kind: "assistant" }>["assistant"]>,
  ) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.kind === "assistant"
          ? {
              ...node,
              assistant: {
                ...node.assistant,
                ...update,
              },
            }
          : node,
      ),
    );
  }, []);

  const updateImageGeneratorNode = useCallback((
    nodeId: string,
    update: Partial<Extract<CanvasNode, { kind: "image-generator" }>["imageGenerator"]>,
  ) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.kind === "image-generator"
          ? {
              ...node,
              imageGenerator: {
                ...node.imageGenerator,
                ...update,
              },
            }
          : node,
      ),
    );
  }, []);

  const runAssistantNode = useCallback(async (nodeId: string) => {
    const assistantNode = nodes.find(
      (node): node is Extract<CanvasNode, { kind: "assistant" }> =>
        node.id === nodeId && node.kind === "assistant",
    );
    if (!assistantNode) {
      return;
    }

    const prompt = assistantNode.assistant.prompt.trim();
    if (!prompt) {
      updateAssistantNode(nodeId, {
        mode: "result",
        status: "error",
        errorMessage: "Enter a prompt before running the assistant.",
      });
      return;
    }

    if (!params.projectId) {
      updateAssistantNode(nodeId, {
        mode: "result",
        status: "error",
        errorMessage: "Open this canvas with a projectId before running the assistant.",
      });
      return;
    }

    const context = buildAssistantCardContext(nodeId, nodes, edges);
    if (!context) {
      updateAssistantNode(nodeId, {
        mode: "result",
        status: "error",
        errorMessage: "Unable to resolve connected Assistant context.",
      });
      return;
    }

    let resolvedContext: AssistantCardContext;
    try {
      resolvedContext = await resolveAssistantContextAssets(context);
    } catch {
      resolvedContext = context;
    }

    updateAssistantNode(nodeId, {
      mode: "result",
      status: "generating",
      errorMessage: undefined,
      lastUsedContextSummary: resolvedContext.connectionSummary,
    });

    try {
      const client = requireCanvasSupabaseClient(supabase);
      const requestBody: AssistantCardRequestBody = {
        projectId: params.projectId,
        canvasId: "canvas-main",
        nodeId,
        prompt,
        model: assistantNode.assistant.model,
        outputFormat: assistantNode.assistant.outputFormat,
        context: resolvedContext,
      };

      const response = await authedFetch(client, "/api/assistant-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const result = (await response.json().catch(() => ({}))) as AssistantRunRouteResponse;
      if (!response.ok || !result.success || !result.data?.response) {
        throw new Error(result.error || "Carver AI could not answer in this assistant card right now.");
      }

      updateAssistantNode(nodeId, {
        mode: "result",
        status: "completed",
        response: result.data.response,
        model: result.data.model ?? assistantNode.assistant.model,
        errorMessage: undefined,
        lastRunAt: result.data.lastRunAt,
        lastUsedContextSummary: result.data.contextSummary ?? resolvedContext.connectionSummary,
      });

      if (typeof result.data.creditsRemaining === "number") {
        setCreditsAmount(result.data.creditsRemaining);
      }
    } catch (error) {
      updateAssistantNode(nodeId, {
        mode: "result",
        status: "error",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Carver AI could not answer in this assistant card right now.",
      });
    }
  }, [edges, nodes, params.projectId, supabase, updateAssistantNode]);

  const runImageGeneratorNode = useCallback(async (
    nodeId: string,
    options?: { simulation?: CarverAiJobSimulationConfig },
  ) => {
    const generatorNode = nodes.find(
      (node): node is Extract<CanvasNode, { kind: "image-generator" }> =>
        node.id === nodeId && node.kind === "image-generator",
    );
    if (!generatorNode) {
      return;
    }

    const graphContext = buildImageGeneratorGraphContext(nodeId, nodes, edges);
    if (!graphContext) {
      return;
    }

    const prompt = generatorNode.imageGenerator.prompt.trim();
    const hasTextContext = graphContext.generatorContext.textReferences.length > 0;
    if (!prompt && !hasTextContext) {
      updateImageGeneratorNode(nodeId, {
        status: "error",
        errorMessage: "Enter a prompt or connect a text note before running the Image Generator.",
      });
      return;
    }

    if (!params.projectId) {
      updateImageGeneratorNode(nodeId, {
        status: "error",
        errorMessage: "Open this canvas with a projectId before running the Image Generator.",
      });
      return;
    }

    updateImageGeneratorNode(nodeId, {
      status: "queued",
      errorMessage: undefined,
    });

    try {
      const client = requireCanvasSupabaseClient(supabase);
      const resolvedExecutionContext = graphContext.executionContext
        ? await resolveGenerationContextAssets(graphContext.executionContext)
        : null;
      const snapshot = buildCanvasSnapshotWithGraph({
        nodes,
        edges,
        activeGenerationTargetId: graphContext.executionContext?.target.nodeId ?? activeGenerationTargetId,
        markers,
        addedObjects,
        sketchLines,
        sketchGroups,
        penStrokes,
        penSettings,
        viewportZoom,
      });
      // Freeze the selected count into this job so later UI changes cannot alter an in-flight request.
      const outputCount = graphContext.generatorContext.cameraShotSet
        ? 1
        : Math.min(
        IMAGE_GENERATOR_MAX_OUTPUT_COUNT,
        Math.max(IMAGE_GENERATOR_MIN_OUTPUT_COUNT, generatorNode.imageGenerator.outputCount),
      );
      const payload = {
        projectId: params.projectId,
        // The worker owns prompt compilation. Keep the user's direction separate
        // from graph references so it can assign each one a deterministic role.
        ...(prompt ? { prompt } : {}),
        targetType: "image-generator" as const,
        canvasId: "canvas-main",
        targetNodeId: generatorNode.id,
        snapshot,
        promptMode: "auto" as const,
        executionMode: resolvedExecutionContext ? "image_edit" as const : "text_to_image" as const,
        jobType: "generate_concept" as const,
        model: generatorNode.imageGenerator.model,
        aspectRatio: generatorNode.imageGenerator.aspectRatio,
        outputCount,
        simulation: options?.simulation,
        canvasGraphContext: resolvedExecutionContext ?? undefined,
        imageGeneratorContext: graphContext.generatorContext,
        cameraShotSetContext: graphContext.generatorContext.cameraShotSet,
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
        throw new Error(result.error || "Unable to start this Image Generator right now.");
      }

      const job = result.data?.job;
      if (!job) {
        throw new Error("The Image Generator job was created without a usable job payload.");
      }

      if (typeof result.data?.creditsRemaining === "number") {
        setCreditsAmount(result.data.creditsRemaining);
      }

      updateImageGeneratorNode(nodeId, {
        status: job.status === "running" ? "generating" : job.status === "queued" ? "queued" : "generating",
        errorMessage: undefined,
        activeJobId: job.id,
      });

      setPendingGenerationJobs((current) => {
        if (current.some((entry) => entry.jobId === job.id)) {
          return current;
        }

        return [
          ...current,
          {
            jobId: job.id,
            projectId: params.projectId!,
            targetNodeId: nodeId,
            targetType: "image-generator",
          },
        ];
      });
      startAiJobBenchmarkRun({
        jobId: job.id,
        projectId: params.projectId,
        source: "canvas",
      });
      showToast(job.status === "queued" ? "Image Generator queued" : "Image Generator started");
    } catch (error) {
      updateImageGeneratorNode(nodeId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unable to run this Image Generator.",
      });
    }
  }, [
    activeGenerationTargetId,
    addedObjects,
    edges,
    markers,
    nodes,
    params.projectId,
    penSettings,
    penStrokes,
    sketchGroups,
    sketchLines,
    supabase,
    updateImageGeneratorNode,
    viewportZoom,
  ]);

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
    const projectId = params.projectId;

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
        markers,
        addedObjects,
        sketchLines,
        sketchGroups,
        penStrokes,
        viewportZoom,
      });
      const payload = {
        projectId,
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

      const response = await authedFetch(client, `/api/projects/${projectId}/ai-jobs`, {
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

      startAiJobBenchmarkRun({
        jobId: job.id,
        projectId,
        source: "canvas",
      });
      setPendingGenerationJobs((current) => [
        ...current.filter((entry) => entry.jobId !== job.id),
        {
          jobId: job.id,
          projectId,
          targetNodeId: activeGenerationTarget.id,
          targetType: "canvas-output",
        },
      ]);

      if (job.status === "queued") {
        showToast("Generation queued");
        return;
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to generate from current canvas context.");
    }
  };

  const saveVersion = useCallback(async () => {
    if (hasTransientSnapshotContent(latestSnapshotDocumentRef.current)) {
      showToast("Persist local images before saving a version.");
      return;
    }

    await saveSnapshotDocument({
      reason: "manual",
    });
  }, [saveSnapshotDocument]);

  const restoreLocalDraft = useCallback(async () => {
    if (!draftConflict) {
      return;
    }

    try {
      await restoreLocalDraftRecord(draftConflict);
      showToast("Local draft restored");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to restore the local draft.");
    }
  }, [draftConflict, restoreLocalDraftRecord]);

  const useSavedVersion = useCallback(async () => {
    if (!currentUserId || !params.projectId) {
      setDraftConflict(null);
      setDraftWarning(null);
      return;
    }

    setDraftConflict(null);
    setDraftWarning(null);
    showToast("Using the saved version. Local recovery data was kept safely.");
  }, [currentUserId, params.projectId]);

  // Đóng modal nhiều góc nhìn; phần generate riêng chưa được cài đặt.
  const dismissDraftWarning = useCallback(() => {
    setDraftWarning(null);
  }, []);

  const generateAngles = () => {
    setShowMultiAngleModal(false);
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
    // DOM ref needed by CanvasWorkspace for entry animation.
    rootRef,

    // Library sub-hook used by the studio asset modal.
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
      viewportZoom,
      viewportResetVersion,
      canvasTheme,
      promptText,
      activeGenerationTargetId,
      generationAssistantMessages,
      activeNodeId,
      pendingGenerationJobs,
      resolvedGeneratorAssetUrls,
      miniMapOpen,
      language,
      selectedLibraryAssetId,
      pendingLibraryInsertAsset,
      pendingPresetGroupInsert,
      isSnapshotLoading,
      isSnapshotSaving,
      isDraftSaving,
      currentSnapshotMeta,
      hasUnsavedSnapshotChanges,
      creditsAmount,
      currentUserId,
      draftConflict,
      draftWarning,
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
      dismissDraftWarning,
      setCanvasTheme,

      toggleMiniMap: () => setMiniMapOpen((current) => !current),

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
      addAssistantNode,
      addImageGeneratorNode,
      addContextGroupNode,
      addCameraShotSetNode,
      updateCameraShotSet,
      runAssistantNode,
      runImageGeneratorNode,
      uploadAssetsToFolder,
      deleteLibraryFolder,
      removeLibraryAsset,

      // Nodes & edges (passthrough setters for CanvasBoard)
      setNodes,
      setEdges,
      setViewportZoom: setCanvasViewportZoom,
      resetViewport: resetCanvasViewport,
      setActiveNodeId,

      // Prompt
      setPromptText: updatePromptText,
      setActiveGenerationTargetId,
      setPendingGenerationJobs,

      // Generation
      generateConcept,
      generateAngles,
      applyCompletedGenerationJob,
      refreshProfileCredits,
      persistCanvasNodeImageAsset,
      saveVersion,
      restoreLocalDraft,
      useSavedVersion,

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
      setLanguage,

      // Modal toggles
      setShowMultiAngleModal,
      setShowAddObjectMenu,
      setShowFeasibilityReviewPanel,
      setShowGroupNameModal,
    },
  };
}

export type CanvasWorkspaceHook = ReturnType<typeof useCanvasWorkspace>;
