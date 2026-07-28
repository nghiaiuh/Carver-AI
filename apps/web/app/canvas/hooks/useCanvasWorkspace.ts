/*
 * useCanvasWorkspace
 *
 * Coordinator hook for the canvas editor.
 * Owns all canvas state, derived values, and action callbacks.
 * CanvasWorkspace.tsx consumes this hook and renders pure JSX only.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { gsap } from "../../components/gsapSetup";
import type { LibraryAsset as CanvasLibraryAsset } from "../types/library";
import {
  type CanvasPresetChild,
  type CanvasPresetGroupNode,
  DEFAULT_CANVAS_THEME,
  DEFAULT_PEN_SETTINGS,
  type PresetGroupCategory,
  inferObjectTypeFromTag,
} from "../types/canvas";
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
import type {
  AddedObject,
  CanvasEdge,
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
  isPresetGroupNode,
  removePresetChildAndCleanupEdges,
  reorderPresetChildren,
  syncPresetGroupPreview,
  upsertPresetChild,
} from "../utils/presetGroupHelpers";
import {
  clearCanvasDraft,
  loadCanvasDraft,
  markCanvasDraftClean,
  pruneExpiredCanvasDrafts,
  recordCanvasDraftCloudSync,
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

// Local persistence is the recovery path, so acknowledge it quickly after the
// user pauses. Cloud sync is deliberately slower to batch one editing burst.
const LOCAL_DRAFT_SAVE_DEBOUNCE_MS = 500;
const CLOUD_DRAFT_SYNC_DEBOUNCE_MS = 3_000;
const CLOUD_DRAFT_SYNC_RETRY_LIMIT = 4;
const CLOUD_DRAFT_SYNC_RETRY_BASE_MS = 2_000;
const DRAFT_BROADCAST_CHANNEL = "carver:canvas-draft";

function createDraftMutationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-mutation-${Date.now()}`;
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image blob."));
    };
    reader.onerror = () => reject(new Error("Unable to read image blob."));
    reader.readAsDataURL(blob);
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
  const setCanvasViewportZoom = useCallback((value: number) => {
    const nextZoom = normalizeCanvasViewportZoom(value);
    setViewportZoom((currentZoom) => currentZoom === nextZoom ? currentZoom : nextZoom);
  }, []);

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
  const [isCloudDraftSyncLeader, setIsCloudDraftSyncLeader] = useState(true);
  const [draftConflict, setDraftConflict] = useState<LocalCanvasDraftRecord | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const handledGenerationJobIdsRef = useRef<Set<string>>(new Set());
  const savedSnapshotFingerprintRef = useRef<string | null>(null);
  const snapshotLoadRequestRef = useRef(0);
  const snapshotSaveInFlightRef = useRef(false);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const lastPersistedLocalDraftFingerprintRef = useRef<string | null>(null);
  const cloudDraftSyncTimeoutRef = useRef<number | null>(null);
  const cloudDraftRetryTimeoutRef = useRef<number | null>(null);
  const cloudDraftRetryAttemptRef = useRef(0);
  const cloudDraftSyncInFlightRef = useRef(false);
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
  const tabIdRef = useRef(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tab-${Date.now()}`,
  );
  const draftChannelRef = useRef<BroadcastChannel | null>(null);
  const syncLeaderAbortRef = useRef<AbortController | null>(null);
  const saveSnapshotDocumentRef = useRef<
    ((params: {
      projectId?: string;
      reason: "manual" | "close";
      quiet?: boolean;
      keepalive?: boolean;
    }) => Promise<boolean>) | null
  >(null);

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
  const canvasThemeStyle = buildCanvasThemeStyle(DEFAULT_CANVAS_THEME);
  const isResizingPanel = false;
  const selectedNode = getSelectedNodeFromSelection(nodes, selectedItem);
  const activeGenerationTarget =
    activeGenerationTargetId
      ? nodes.find((node) => node.id === activeGenerationTargetId && !isPresetGroupNode(node)) ?? null
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
        viewportZoom,
      }),
    [activeGenerationTargetId, addedObjects, edges, markers, nodes, penStrokes, sketchGroups, sketchLines, viewportZoom],
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
    setActiveGenerationTargetId(hydrated.activeGenerationTargetId);
    setActiveNodeId(hydrated.activeGenerationTargetId);
    setSelectedItem(
      hydrated.activeGenerationTargetId
        ? { type: "node", id: hydrated.activeGenerationTargetId }
        : { type: "none" },
    );
    setPendingGenerationJob(null);
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
    const dataUrl = await blobToDataUrl(assetParams.blob);
    const response = await authedFetch(client, `/api/projects/${params.projectId}/snapshot/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images: [
          {
            nodeId: `pending-${Date.now()}`,
            title: assetParams.title,
            dataUrl,
          },
        ],
      }),
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

      draftChannelRef.current?.postMessage({
        type: "draft-updated",
        userId: currentUserId,
        projectId,
        tabId: tabIdRef.current,
      });
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
      (!syncParams.allowNonLeader && !isCloudDraftSyncLeader)
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
        skipReason: !projectId || !currentUserId ? "not-ready" : "not-leader",
      });
      return false;
    }

    const snapshotDocument = latestSnapshotDocumentRef.current;
    const snapshotFingerprint = latestSnapshotFingerprintRef.current;
    if (
      !syncParams.force &&
      cloudDraftMetaRef.current.documentHash &&
      cloudDraftMetaRef.current.documentHash === snapshotFingerprint
    ) {
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
      const mutationId = latestDraftMutationIdRef.current ?? createDraftMutationId();
      const response = await authedFetch(client, `/api/project-drafts/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document: snapshotDocument,
          expectedRevision: cloudDraftMetaRef.current.revision ?? 0,
          documentHash: snapshotFingerprint,
          mutationId,
          baseSnapshotId: snapshotBaselineRef.current.snapshotId ?? null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as DraftRouteResponse;

      if (response.status === 409 || payload.code === "DRAFT_CONFLICT") {
        setDraftWarning("Cloud draft changed in another tab or device. Reload the saved version or restore your local draft intentionally.");
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

      if (!response.ok || !payload.data?.draft) {
        throw new Error(payload.error || "Unable to sync the project draft.");
      }

      const hasNewerLocalMutation =
        latestDraftMutationIdRef.current !== null &&
        latestDraftMutationIdRef.current !== mutationId;
      cloudDraftMetaRef.current = {
        baseSnapshotId: payload.data.draft.baseSnapshotId,
        revision: payload.data.draft.revision,
        documentHash: payload.data.draft.documentHash ?? snapshotFingerprint,
        lastMutationId: hasNewerLocalMutation
          ? latestDraftMutationIdRef.current
          : (payload.data.draft.lastMutationId ?? mutationId),
      };
      if (!hasNewerLocalMutation) {
        latestDraftMutationIdRef.current = payload.data.draft.lastMutationId ?? mutationId;
      }
      cloudDraftRetryAttemptRef.current = 0;
      if (cloudDraftRetryTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftRetryTimeoutRef.current);
        cloudDraftRetryTimeoutRef.current = null;
      }

      await recordCanvasDraftCloudSync(currentUserId, projectId, {
        cloudDraftRevision: payload.data.draft.revision,
        cloudDraftHash: payload.data.draft.documentHash ?? snapshotFingerprint,
        lastMutationId: payload.data.draft.lastMutationId ?? mutationId,
      }).catch(() => undefined);

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
      const retryAttempt = cloudDraftRetryAttemptRef.current + 1;
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
        retryAttempt <= CLOUD_DRAFT_SYNC_RETRY_LIMIT &&
        typeof window !== "undefined" &&
        cloudDraftRetryTimeoutRef.current === null &&
        (syncParams.allowNonLeader || isCloudDraftSyncLeader)
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
        (syncParams.allowNonLeader || isCloudDraftSyncLeader) &&
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
  }, [currentUserId, isCloudDraftSyncLeader, params.projectId, supabase]);

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
    saveSnapshotDocumentRef.current = saveSnapshotDocument;
  }, [saveSnapshotDocument]);

  useEffect(() => {
    syncLeaderAbortRef.current?.abort();
    syncLeaderAbortRef.current = null;

    if (!currentUserId || !params.projectId) {
      queueMicrotask(() => {
        setIsCloudDraftSyncLeader(true);
      });
      return;
    }

    if (typeof navigator === "undefined" || !("locks" in navigator)) {
      queueMicrotask(() => {
        setIsCloudDraftSyncLeader(true);
      });
      return;
    }

    const abortController = new AbortController();
    syncLeaderAbortRef.current = abortController;
    queueMicrotask(() => {
      setIsCloudDraftSyncLeader(false);
    });

    void navigator.locks
      .request(
        `carver-canvas-sync:${currentUserId}:${params.projectId}`,
        { mode: "exclusive", signal: abortController.signal },
        async () => {
          if (abortController.signal.aborted) {
            return;
          }

          setIsCloudDraftSyncLeader(true);
          draftChannelRef.current?.postMessage({
            type: "draft-leader",
            userId: currentUserId,
            projectId: params.projectId,
            tabId: tabIdRef.current,
          });

          await new Promise<void>((resolve) => {
            abortController.signal.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      )
      .catch(() => {
        if (!abortController.signal.aborted) {
          setIsCloudDraftSyncLeader(true);
        }
      });

    return () => {
      abortController.abort();
      if (syncLeaderAbortRef.current === abortController) {
        syncLeaderAbortRef.current = null;
      }
      setIsCloudDraftSyncLeader(true);
    };
  }, [currentUserId, params.projectId]);

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

      if (message.type === "draft-updated") {
        setDraftWarning("Another tab updated this local draft. Your next save will use last-write-wins.");
      }

      if (message.type === "draft-leader") {
        setDraftWarning("Another tab is the active cloud-sync leader for this project.");
      }
    };

    return () => {
      channel.close();
      if (draftChannelRef.current === channel) {
        draftChannelRef.current = null;
      }
    };
  }, [currentUserId, params.projectId]);

  useEffect(() => {
    const projectId = params.projectId;
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

        if (!snapshotResponse.ok || !snapshotPayload.data?.document) {
          throw new Error(snapshotPayload.error || "Unable to load the current canvas snapshot.");
        }

        const snapshotDocument = coerceCanvasSnapshotDocument(snapshotPayload.data.document);
        const cloudDraftDocument = draftResponse.ok && draftPayload.data?.document
          ? coerceCanvasSnapshotDocument(draftPayload.data.document)
          : null;
        const cloudDraftMeta = draftResponse.ok ? draftPayload.data?.draft ?? null : null;
        const baseDocument = cloudDraftDocument ?? snapshotDocument;
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        applySnapshotBaseline(snapshotDocument, snapshotPayload.data.snapshot ?? null);
        applyCloudDraftMeta(cloudDraftMeta);
        setDraftConflict(null);
        setDraftWarning(
          draftPayload.data?.assetDeliveryWarning ??
          snapshotPayload.data?.assetDeliveryWarning ??
          (cloudDraftMeta &&
            snapshotPayload.data.snapshot?.snapshotId &&
            cloudDraftMeta.baseSnapshotId &&
            cloudDraftMeta.baseSnapshotId !== snapshotPayload.data.snapshot.snapshotId
            ? "A cloud draft based on a different saved version was restored."
            : null),
        );

        const draftRecord =
          currentUserId ? await loadCanvasDraft(currentUserId, projectId) : null;
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        if (!draftRecord || draftRecord.meta.documentHash === draftRecord.meta.basedOnHash) {
          applyHydratedSnapshotState(baseDocument);
          return;
        }

        const dbVersion = snapshotPayload.data.snapshot?.version ?? 0;
        const hasSnapshotConflict =
          (typeof draftRecord.meta.basedOnVersion === "number" && draftRecord.meta.basedOnVersion < dbVersion) ||
          Boolean(
            draftRecord.meta.basedOnSnapshotId &&
            snapshotPayload.data.snapshot?.snapshotId &&
            draftRecord.meta.basedOnSnapshotId !== snapshotPayload.data.snapshot.snapshotId,
          );
        const hasCloudConflict =
          typeof draftRecord.meta.cloudDraftRevision === "number" &&
          typeof cloudDraftMeta?.revision === "number" &&
          draftRecord.meta.cloudDraftRevision < cloudDraftMeta.revision;

        if (hasSnapshotConflict || hasCloudConflict) {
          applyHydratedSnapshotState(baseDocument);
          setDraftConflict(draftRecord);
          setDraftWarning("A newer saved draft/version exists. Restore the local draft only if you want to continue from that older base.");
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
          snapshotId: draftRecord.meta.basedOnSnapshotId ?? snapshotPayload.data.snapshot?.snapshotId ?? null,
          version: draftRecord.meta.basedOnVersion ?? snapshotPayload.data.snapshot?.version ?? null,
          documentHash: draftRecord.meta.basedOnHash ?? snapshotPayload.data.snapshot?.documentHash ?? null,
        };
        savedSnapshotFingerprintRef.current =
          draftRecord.meta.basedOnHash ?? snapshotPayload.data.snapshot?.documentHash ?? null;
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
      } catch (error) {
        if (cancelled || requestId !== snapshotLoadRequestRef.current) {
          return;
        }

        const emptyDocument = coerceCanvasSnapshotDocument(undefined);
        applySnapshotBaseline(emptyDocument, null);
        applyHydratedSnapshotState(emptyDocument);
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
      !isCloudDraftSyncLeader ||
      isSnapshotLoading ||
      !snapshotBaselineRef.current.documentHash
    ) {
      return;
    }

    const baselineHash = snapshotBaselineRef.current.documentHash;
    const currentHash = latestSnapshotFingerprintRef.current;
    if (!currentHash || currentHash === baselineHash || currentHash === cloudDraftMetaRef.current.documentHash) {
      return;
    }

    cloudDraftSyncTimeoutRef.current = window.setTimeout(() => {
      cloudDraftSyncTimeoutRef.current = null;
      void syncCloudDraft({
        quiet: true,
      }).catch(() => undefined);
    }, CLOUD_DRAFT_SYNC_DEBOUNCE_MS);

    return () => {
      if (cloudDraftSyncTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftSyncTimeoutRef.current);
        cloudDraftSyncTimeoutRef.current = null;
      }
      if (cloudDraftRetryTimeoutRef.current !== null) {
        window.clearTimeout(cloudDraftRetryTimeoutRef.current);
        cloudDraftRetryTimeoutRef.current = null;
      }
    };
  }, [
    currentSnapshotFingerprint,
    currentUserId,
    isCloudDraftSyncLeader,
    isSnapshotLoading,
    params.projectId,
    syncCloudDraft,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void persistLocalDraftNow().catch(() => undefined);
      }
    };

    const handlePageHide = () => {
      void persistLocalDraftNow().catch(() => undefined);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistLocalDraftNow]);

  useEffect(() => {
    const closingProjectId = params.projectId;
    return () => {
      if (!closingProjectId) {
        return;
      }

      void saveSnapshotDocumentRef.current?.({
        projectId: closingProjectId,
        reason: "close",
        quiet: true,
      });
    };
  }, [params.projectId]);

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
        recordAiJobPollRequest({
          jobId: pendingGenerationJob.jobId,
          projectId: pendingGenerationJob.projectId,
          status: payload.data?.job?.status ?? null,
        });

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

        switch (job.status as string) {
          case "failed":
          case "cancelled":
          case "enqueue_failed":
            finishAiJobBenchmarkRun({
              jobId: job.id,
              projectId: pendingGenerationJob.projectId,
              terminalStatus: job.status === "enqueue_failed" ? "enqueue_failed" : job.status === "cancelled" ? "cancelled" : "failed",
              generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
              errorMessage: job.errorMessage ?? getTerminalGenerationStatusMessage(job),
            });
            showToast(getTerminalGenerationStatusMessage(job));
            return;
          default:
            break;
        }

        finishAiJobBenchmarkRun({
          jobId: job.id,
          projectId: pendingGenerationJob.projectId,
          terminalStatus: "succeeded",
          generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
        });
        applyCompletedGenerationJob({
          job,
          targetNodeId: pendingGenerationJob.targetNodeId,
          syncAssistantMessage: true,
        });
      } catch (error) {
        finishAiJobBenchmarkRun({
          jobId: pendingGenerationJob.jobId,
          projectId: pendingGenerationJob.projectId,
          terminalStatus: "poll_abandoned",
          generatedImageCount: 0,
          errorMessage: error instanceof Error ? error.message : "Unable to load AI job status.",
        });
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
        ? selectedItem.id
        : null;
    const targetNodeId =
      selectedNodeId ??
      activeGenerationTargetId ??
      nodes.find((node) => !isPresetGroupNode(node))?.id ??
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
        markers,
        addedObjects,
        sketchLines,
        sketchGroups,
        penStrokes,
        viewportZoom,
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

      startAiJobBenchmarkRun({
        jobId: job.id,
        projectId: params.projectId,
        source: "canvas",
      });
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

    await clearCanvasDraft(currentUserId, params.projectId).catch(() => undefined);
    setDraftConflict(null);
    setDraftWarning(null);
    showToast("Using the saved version");
  }, [currentUserId, params.projectId]);

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
      promptText,
      activeGenerationTargetId,
      generationAssistantMessages,
      activeNodeId,
      pendingGenerationJob,
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
      uploadAssetsToFolder,
      deleteLibraryFolder,
      removeLibraryAsset,

      // Nodes & edges (passthrough setters for CanvasBoard)
      setNodes,
      setEdges,
      setViewportZoom: setCanvasViewportZoom,
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
      setShowQuickEditModal,
      setShowMultiAngleModal,
      setShowAddObjectMenu,
      setShowFeasibilityReviewPanel,
      setShowGroupNameModal,
    },
  };
}

export type CanvasWorkspaceHook = ReturnType<typeof useCanvasWorkspace>;
