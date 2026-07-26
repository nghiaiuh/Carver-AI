/*
 * Flow: Renders the canvas AI chat panel.
 * 1. Load persisted chat history for the current project.
 * 2. Let the user send text chat or image-generation requests through `/api/chat`.
 * 3. Poll queued generation jobs and render images back into chat.
 */

"use client";

import type {
  CanvasGenerationAssistantMessage,
  CanvasGenerationContext,
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
  CanvasSnapshotDocument,
  CarverAiJobRecord,
  GeneratedCanvasImage,
} from "@carver/shared";
import { DEFAULT_OPENAI_CHAT_MODEL, OPENAI_CHAT_MODEL_OPTIONS } from "../../../../lib/openaiChatModels";
import { getBrowserAuthClient } from "../../../components/auth/authClient";
import {
  finishAiJobBenchmarkRun,
  recordAiJobPollRequest,
  recordAiJobPollTransportFailure,
  startAiJobBenchmarkRun,
} from "../../utils/aiJobBenchmark";
import {
  ArrowRight,
  ChevronDown,
  LoaderCircle,
  Paperclip,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type AiChatSidebarProps = {
  canvasId?: string;
  projectId?: string;
  targetNodeId?: string | null;
  targetTitle?: string | null;
  targetImageUrl?: string | null;
  generationContext?: CanvasGenerationContext | null;
  generationSnapshot?: CanvasSnapshotDocument | null;
  connectedImageReferences?: CanvasGenerationImageReference[];
  connectedPresetReferences?: CanvasGenerationPresetReference[];
  generationAssistantMessages?: CanvasGenerationAssistantMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onCreditsChange?: (creditsRemaining: number) => void;
  onGenerationComplete?: (params: {
    job: CarverAiJobRecord;
    targetNodeId?: string | null;
  }) => void;
  onClearLinkedImage: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

type PromptAttachment = {
  id: string;
  name: string;
  url: string;
  dataUrl: string;
};

type ChatInputImage = {
  imageUrl: string;
  label: string;
  source: "attachment" | "canvas-target" | "canvas-reference" | "preset-reference";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  generatedImages?: GeneratedCanvasImage[];
  status?: "error" | "pending";
};

type ChatRouteMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  projectId?: string;
  canvasId?: string;
  generatedImages?: GeneratedCanvasImage[];
};

type ChatRouteResponse = {
  mode?: "chat" | "generation";
  error?: string;
  userMessage?: ChatRouteMessage;
  assistantMessage?: ChatRouteMessage;
  job?: CarverAiJobRecord;
  creditsRemaining?: number | null;
};

type GetAiJobResponse = {
  success?: boolean;
  data?: {
    job?: CarverAiJobRecord;
  };
  error?: string;
};

type EnhancePromptResult = {
  originalPrompt: string;
  enhancedPrompt: string;
  mode: string;
  detectedIntent: string;
  score: number;
  usedAiFallback: boolean;
  detectedObjects: string[];
  detectedTargetAreas: string[];
  detectedStyle?: string | null;
  preserveRules: string[];
  negativeRules: string[];
  fallbackReason: string | null;
  fallbackError: string | null;
  attemptedAiFallback: boolean;
  scoringReasons: string[];
  creditsRemaining?: number;
};

const DEFAULT_CANVAS_ID = "canvas-main";
const CHAT_MODEL_STORAGE_KEY = "carver-chat-model";
const PROJECT_REQUIRED_MESSAGE = "Create or open a project before using AI chat.";
const GENERATION_QUEUE_TIMEOUT_MS = 30_000;
const GENERATION_RUNNING_TIMEOUT_MS = 300_000;
const GENERATION_POLL_RETRY_LIMIT = 4;
const GENERATION_POLL_RETRY_DELAY_MS = 3_000;

class NonRetryablePollError extends Error {}

function formatPresetReferenceLabel(reference: CanvasGenerationPresetReference) {
  if (reference.slot?.trim()) {
    return `${reference.label} (${reference.slot})`;
  }

  return `${reference.label} (${reference.category})`;
}

function mapRouteMessage(message: ChatRouteMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    generatedImages: message.generatedImages,
  };
}

function replaceMessage(messages: ChatMessage[], placeholderId: string, nextMessage: ChatMessage) {
  return [
    ...messages.filter((message) => message.id !== placeholderId),
    nextMessage,
  ];
}

async function getAuthorizedHeaders(init?: HeadersInit) {
  const client = getBrowserAuthClient();
  if (!client) {
    throw new Error("Please sign in to use Carver AI.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in to use Carver AI.");
  }

  const headers = new Headers(init);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function buildPromptContent(params: {
  prompt: string;
  attachments: PromptAttachment[];
  targetTitle?: string | null;
  connectedImageReferences: CanvasGenerationImageReference[];
  connectedPresetReferences: CanvasGenerationPresetReference[];
}) {
  const imageCount =
    params.attachments.length +
    (params.targetTitle ? 1 : 0) +
    params.connectedImageReferences.length +
    params.connectedPresetReferences.length;
  const trimmedPrompt =
    params.prompt.trim() ||
    (imageCount > 0 ? "Describe these image references for landscape design context." : "");
  const canvasTargetSummary = params.targetTitle
    ? `Canvas linked image: ${params.targetTitle}`
    : "";
  const connectedImageSummary =
    params.connectedImageReferences.length > 0
      ? `Connected canvas image references: ${params.connectedImageReferences.map((reference) => reference.title).join(", ")}`
      : "";
  const connectedPresetSummary =
    params.connectedPresetReferences.length > 0
      ? `Connected preset references: ${params.connectedPresetReferences.map(formatPresetReferenceLabel).join(", ")}`
      : "";
  const attachmentSummary =
    params.attachments.length > 0
      ? `Attached local image names: ${params.attachments.map((attachment) => attachment.name).join(", ")}`
      : "";

  return [
    trimmedPrompt,
    canvasTargetSummary,
    connectedImageSummary,
    connectedPresetSummary,
    attachmentSummary,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image attachment."));
    };
    reader.onerror = () => reject(new Error("Unable to read image attachment."));
    reader.readAsDataURL(file);
  });
}

async function blobToDataUrl(blob: Blob) {
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

async function resolveImageUrlForChat(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  if (typeof window !== "undefined") {
    try {
      const normalizedUrl = new URL(imageUrl, window.location.origin);
      const isSameOrigin = normalizedUrl.origin === window.location.origin;

      if (imageUrl.startsWith("blob:") || isSameOrigin) {
        const response = await fetch(normalizedUrl.toString());
        if (!response.ok) {
          throw new Error("Unable to load image reference.");
        }

        return blobToDataUrl(await response.blob());
      }

      return normalizedUrl.toString();
    } catch {
      return imageUrl;
    }
  }

  return imageUrl;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getInitialChatModel() {
  if (typeof window === "undefined") {
    return DEFAULT_OPENAI_CHAT_MODEL;
  }

  const savedModel = window.localStorage.getItem(CHAT_MODEL_STORAGE_KEY);
  return savedModel && OPENAI_CHAT_MODEL_OPTIONS.some((option) => option.value === savedModel)
    ? savedModel
    : DEFAULT_OPENAI_CHAT_MODEL;
}

export default function AiChatSidebar({
  canvasId = DEFAULT_CANVAS_ID,
  projectId,
  targetNodeId,
  targetTitle,
  targetImageUrl,
  generationContext = null,
  generationSnapshot = null,
  connectedImageReferences = [],
  connectedPresetReferences = [],
  generationAssistantMessages = [],
  draft,
  onDraftChange,
  onCreditsChange,
  onGenerationComplete,
  onClearLinkedImage,
  onClose,
  onToast,
}: AiChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(getInitialChatModel);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastOriginalPrompt, setLastOriginalPrompt] = useState<string | null>(null);
  const [enhanceMeta, setEnhanceMeta] = useState<EnhancePromptResult | null>(null);
  const composerInputRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<PromptAttachment[]>([]);
  const activeGenerationPollsRef = useRef<Set<string>>(new Set());
  const isUnmountedRef = useRef(false);
  const hasCanvasLinkedImage = Boolean(targetImageUrl);

  const canSend = useMemo(
    () => Boolean(projectId) && !isSending && (draft.trim().length > 0 || attachments.length > 0 || hasCanvasLinkedImage),
    [attachments.length, draft, hasCanvasLinkedImage, isSending, projectId],
  );
  const canEnhance = !isEnhancing && draft.trim().length > 0;

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    if (el.textContent === draft) return;
    el.textContent = draft;
  }, [draft]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CHAT_MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  const displayedMessages = useMemo(() => {
    const existingIds = new Set(messages.map((message) => message.id));
    const generatedMessages: ChatMessage[] = generationAssistantMessages
      .filter((message) => !existingIds.has(message.id))
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        generatedImages: message.generatedImages,
      }));

    return generatedMessages.length > 0 ? [...messages, ...generatedMessages] : messages;
  }, [generationAssistantMessages, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayedMessages.length, isSending]);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      if (!projectId) {
        setMessages([]);
        setHistoryLoading(false);
        setErrorMessage(null);
        return;
      }

      setHistoryLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({ canvasId });
        if (projectId) params.set("projectId", projectId);

        const response = await fetch(`/api/chat?${params.toString()}`, {
          cache: "no-store",
          headers: await getAuthorizedHeaders(),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          messages?: ChatRouteMessage[];
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load previous chat history.");
        }

        if (!active) return;

        setMessages((payload.messages ?? []).map(mapRouteMessage));
      } catch (error) {
        if (!active) return;

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load previous chat history right now.",
        );
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [canvasId, projectId]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    };
  }, []);

  const addAttachments = async (files: File[] | FileList) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const nextAttachments = await Promise.all(
      imageFiles.map(async (file) => ({
        id: `att_${Date.now()}_${file.name || "pasted"}`,
        name: file.name || "Pasted Image",
        url: URL.createObjectURL(file),
        dataUrl: await fileToDataUrl(file),
      })),
    );

    setAttachments((prev) => [
      ...prev,
      ...nextAttachments,
    ]);
    onToast(`${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"} attached`);
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const next = current.filter((attachment) => attachment.id !== attachmentId);
      const removed = current.find((attachment) => attachment.id === attachmentId);

      if (removed) {
        URL.revokeObjectURL(removed.url);
      }

      return next;
    });
  };

  const clearChat = async () => {
    if (!projectId) {
      setErrorMessage(PROJECT_REQUIRED_MESSAGE);
      onToast(PROJECT_REQUIRED_MESSAGE);
      return;
    }

    try {
      const params = new URLSearchParams({ canvasId });
      if (projectId) params.set("projectId", projectId);

      const response = await fetch(`/api/chat?${params.toString()}`, {
        method: "DELETE",
        headers: await getAuthorizedHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to reset this chat right now.");
      }

      attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
      setMessages([]);
      setAttachments([]);
      setErrorMessage(null);
      setEnhanceMeta(null);
      setLastOriginalPrompt(null);
      onDraftChange("");
      onToast("Chat cleared");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reset this chat right now.");
    }
  };

  const enhancePrompt = async () => {
    const originalPrompt = draft.trim();
    if (!originalPrompt) return;

    setIsEnhancing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          prompt: originalPrompt,
          mode: "image_editing",
          useAiFallback: true,
          forceAiFallback: false,
          projectContext: {
            hasImage: attachments.length > 0,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: EnhancePromptResult;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Prompt enhance failed");
      }

      setLastOriginalPrompt(originalPrompt);
      setEnhanceMeta(payload.data);
      if (typeof payload.data.creditsRemaining === "number") {
        onCreditsChange?.(payload.data.creditsRemaining);
      }
      onDraftChange(payload.data.enhancedPrompt);
      onToast(payload.data.usedAiFallback ? "Prompt enhanced by AI" : "Prompt enhanced by rules");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to enhance prompt right now.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const restoreOriginalPrompt = () => {
    if (!lastOriginalPrompt) return;
    onDraftChange(lastOriginalPrompt);
    setEnhanceMeta(null);
    onToast("Original prompt restored");
  };

  const buildGenerationContextPayload = async (rawPrompt: string, promptAttachments: PromptAttachment[]) => {
    const selectedTarget = generationContext?.target
      ? {
          ...generationContext.target,
          imageUrl: await resolveImageUrlForChat(generationContext.target.imageUrl),
          prompt: rawPrompt || generationContext.target.prompt || null,
        }
      : null;

    const attachmentTarget = !selectedTarget && promptAttachments.length > 0
      ? {
          nodeId: `chat-attachment-target-${promptAttachments[0]?.id ?? "image"}`,
          title: promptAttachments[0]?.name ?? "Attached image",
          imageUrl: promptAttachments[0]?.dataUrl ?? "",
          role: "attachment-target",
          prompt: rawPrompt || null,
        }
      : null;

    const remainingAttachments = selectedTarget ? promptAttachments : promptAttachments.slice(1);
    const attachmentReferences = remainingAttachments.map((attachment, index) => ({
      nodeId: `chat-attachment-reference-${attachment.id}-${index}`,
      title: attachment.name,
      imageUrl: attachment.dataUrl,
      role: "attachment",
    }));

    const imageReferences = generationContext
      ? await Promise.all(
          generationContext.imageReferences.map(async (reference) => ({
            ...reference,
            imageUrl: await resolveImageUrlForChat(reference.imageUrl),
          })),
        )
      : [];

    const presetReferences = generationContext
      ? await Promise.all(
          generationContext.presetReferences.map(async (reference) => ({
            ...reference,
            imageSrc: await resolveImageUrlForChat(reference.imageSrc),
          })),
        )
      : [];

    const target = selectedTarget ?? attachmentTarget;
    if (!target && imageReferences.length === 0 && presetReferences.length === 0) {
      return undefined;
    }

    return {
      target: target ?? {
        nodeId: "chat-text-to-image",
        title: "Prompt-only generation",
        imageUrl: "",
        role: "text-to-image",
        prompt: rawPrompt || null,
      },
      imageReferences: [
        ...imageReferences,
        ...attachmentReferences,
      ],
      presetReferences,
      preserveRules: generationContext?.preserveRules ?? [],
      referenceSummary: generationContext?.referenceSummary ?? "",
      connectionSummary: generationContext?.connectionSummary ?? "",
    };
  };

  const pollGenerationJob = async (params: {
    jobId: string;
    projectId: string;
    placeholderMessageId: string;
    targetNodeId?: string | null;
  }) => {
    if (activeGenerationPollsRef.current.has(params.jobId)) {
      return;
    }

    activeGenerationPollsRef.current.add(params.jobId);

    try {
      const startedAt = Date.now();
      let consecutivePollFailures = 0;

      while (!isUnmountedRef.current) {
        let payload: GetAiJobResponse;
        try {
          const response = await fetch(
            `/api/projects/${params.projectId}/ai-jobs/${params.jobId}`,
            {
              cache: "no-store",
              headers: await getAuthorizedHeaders(),
            },
          );
          payload = (await response.json().catch(() => ({}))) as GetAiJobResponse;
          recordAiJobPollRequest({
            jobId: params.jobId,
            projectId: params.projectId,
            status: payload.data?.job?.status ?? null,
          });

          if (!response.ok || !payload.data?.job) {
            const message = payload.error || "Unable to load AI job status.";
            if ([400, 403, 404].includes(response.status)) {
              throw new NonRetryablePollError(message);
            }
            throw new Error(message);
          }
        } catch (error) {
          if (error instanceof NonRetryablePollError) {
            throw error;
          }

          consecutivePollFailures += 1;
          recordAiJobPollTransportFailure({
            jobId: params.jobId,
            projectId: params.projectId,
            message: error instanceof Error ? error.message : "Unknown poll transport failure.",
          });

          if (consecutivePollFailures <= GENERATION_POLL_RETRY_LIMIT) {
            await wait(GENERATION_POLL_RETRY_DELAY_MS * consecutivePollFailures);
            continue;
          }

          throw new Error(
            error instanceof Error
              ? `Lost connection while checking image generation status: ${error.message}`
              : "Lost connection while checking image generation status.",
          );
        }

        const job = payload.data.job;
        consecutivePollFailures = 0;

        if (job.status === "queued") {
          if (Date.now() - startedAt >= GENERATION_QUEUE_TIMEOUT_MS) {
            throw new Error(
              "The image job is still queued. Make sure Redis and apps/worker are running, then try again.",
            );
          }
          await wait(2000);
          continue;
        }

        if (job.status === "running") {
          if (Date.now() - startedAt >= GENERATION_RUNNING_TIMEOUT_MS) {
            throw new Error(
              "The image job is still processing in the worker. Check the worker log for an OpenAI, R2, or network timeout.",
            );
          }
          await wait(2000);
          continue;
        }

        if (job.status !== "succeeded") {
          const terminalMessage =
            job.errorMessage ||
            (job.status === "cancelled"
              ? "Image generation was cancelled."
              : "Image generation failed.");
          finishAiJobBenchmarkRun({
            jobId: job.id,
            projectId: params.projectId,
            terminalStatus: job.status === "enqueue_failed" ? "enqueue_failed" : job.status === "cancelled" ? "cancelled" : "failed",
            generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
            errorMessage: terminalMessage,
          });
          setMessages((current) =>
            replaceMessage(current, params.placeholderMessageId, {
              id: `job-error-${job.id}`,
              role: "assistant",
              content: terminalMessage,
              createdAt: new Date().toISOString(),
              status: "error",
            }),
          );
          setErrorMessage(terminalMessage);
          return;
        }

        const assistantMessage = job.jobResult?.assistantMessage
          ? {
              id: job.jobResult.assistantMessage.id,
              role: job.jobResult.assistantMessage.role,
              content: job.jobResult.assistantMessage.content,
              createdAt: job.jobResult.assistantMessage.createdAt,
              generatedImages: job.jobResult.assistantMessage.generatedImages,
            }
          : {
              id: `job-result-${job.id}`,
              role: "assistant" as const,
              content: "Generated an image from your request.",
              createdAt: job.updatedAt,
              generatedImages: job.jobResult?.generatedImages ?? [],
            };

        finishAiJobBenchmarkRun({
          jobId: job.id,
          projectId: params.projectId,
          terminalStatus: "succeeded",
          generatedImageCount: job.jobResult?.generatedImages?.length ?? 0,
        });
        setMessages((current) => replaceMessage(current, params.placeholderMessageId, assistantMessage));
        onGenerationComplete?.({
          job,
          targetNodeId: params.targetNodeId,
        });
        return;
      }
    } catch (error) {
      const friendlyMessage =
        error instanceof Error
          ? error.message
          : "Unable to load AI job status.";
      finishAiJobBenchmarkRun({
        jobId: params.jobId,
        projectId: params.projectId,
        terminalStatus: "poll_abandoned",
        generatedImageCount: 0,
        errorMessage: friendlyMessage,
      });
      setMessages((current) =>
        replaceMessage(current, params.placeholderMessageId, {
          id: `job-poll-error-${Date.now()}`,
          role: "assistant",
          content: friendlyMessage,
          createdAt: new Date().toISOString(),
          status: "error",
        }),
      );
      setErrorMessage(friendlyMessage);
    } finally {
      activeGenerationPollsRef.current.delete(params.jobId);
    }
  };

  const send = async () => {
    if (!projectId) {
      setErrorMessage(PROJECT_REQUIRED_MESSAGE);
      onToast(PROJECT_REQUIRED_MESSAGE);
      return;
    }

    const rawPrompt = draft.trim();
    const content = buildPromptContent({
      prompt: draft,
      attachments,
      targetTitle,
      connectedImageReferences,
      connectedPresetReferences,
    });
    if (!content) return;

    const imageMap = new Map<string, ChatInputImage>();

    attachments.forEach((attachment) => {
      imageMap.set(`attachment:${attachment.id}`, {
        imageUrl: attachment.dataUrl,
        label: attachment.name,
        source: "attachment",
      });
    });

    const imageCandidates: ChatInputImage[] = [
      ...[...imageMap.values()],
      ...(targetImageUrl
        ? [
            {
              imageUrl: targetImageUrl,
              label: targetTitle ?? "Selected canvas image",
              source: "canvas-target" as const,
            },
          ]
        : []),
      ...connectedImageReferences.map((reference) => ({
        imageUrl: reference.imageUrl,
        label: reference.title,
        source: "canvas-reference" as const,
      })),
      ...connectedPresetReferences.map((reference) => ({
        imageUrl: reference.imageSrc,
        label: formatPresetReferenceLabel(reference),
        source: "preset-reference" as const,
      })),
    ];

    const resolvedImages = await Promise.all(
      imageCandidates.map(async (image) => ({
        ...image,
        imageUrl: await resolveImageUrlForChat(image.imageUrl),
      })),
    );

    const images = Array.from(
      new Map(
        resolvedImages.map((image) => [`${image.source}:${image.imageUrl}`, image]),
      ).values(),
    );

    const generationContextPayload = await buildGenerationContextPayload(rawPrompt, attachments);
    const optimisticUserMessage: ChatMessage = {
      id: `local_user_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `chat-${Date.now()}`;

    setMessages((prev) => [...prev, optimisticUserMessage]);
    setErrorMessage(null);
    setIsSending(true);
    onDraftChange("");
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    setAttachments([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          canvasId,
          projectId,
          content,
          rawPrompt,
          images,
          model: selectedModel,
          idempotencyKey: requestId,
          targetNodeId: targetNodeId ?? generationContext?.target.nodeId,
          canvasGraphContext: generationContextPayload,
          snapshot: generationSnapshot,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ChatRouteResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Carver AI could not answer right now.");
      }

      if (typeof payload.creditsRemaining === "number") {
        onCreditsChange?.(payload.creditsRemaining);
      }

      if (payload.mode === "generation" && payload.job) {
        startAiJobBenchmarkRun({
          jobId: payload.job.id,
          projectId,
          source: "chat",
          requestId,
        });
        const placeholderMessageId = `local_job_${payload.job.id}`;
        const persistedUserMessage = payload.userMessage
          ? mapRouteMessage(payload.userMessage)
          : optimisticUserMessage;

        setMessages((prev) => [
          ...prev.filter((message) => message.id !== optimisticUserMessage.id),
          persistedUserMessage,
          {
            id: placeholderMessageId,
            role: "assistant",
            content: "Carver AI is generating an image from your request...",
            createdAt: new Date().toISOString(),
            status: "pending",
          },
        ]);

        void pollGenerationJob({
          jobId: payload.job.id,
          projectId,
          placeholderMessageId,
          targetNodeId: targetNodeId ?? generationContext?.target.nodeId ?? null,
        });
        return;
      }

      if (!payload.userMessage || !payload.assistantMessage) {
        throw new Error(payload.error || "Carver AI could not answer right now.");
      }

      const userMessage = payload.userMessage;
      const assistantMessage = payload.assistantMessage;

      setMessages((prev) => [
        ...prev.filter((message) => message.id !== optimisticUserMessage.id),
        mapRouteMessage(userMessage),
        mapRouteMessage(assistantMessage),
      ]);
    } catch (error) {
      const friendlyMessage =
        error instanceof Error
          ? error.message
          : "Carver AI is temporarily unavailable. Please try again in a moment.";

      setMessages((prev) => [
        ...prev,
        {
          id: `local_error_${Date.now()}`,
          role: "assistant",
          content: friendlyMessage,
          createdAt: new Date().toISOString(),
          status: "error",
        },
      ]);
      setErrorMessage(friendlyMessage);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)]">
      <div className="flex h-14 items-center justify-between border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">AI Chat</h2>
        <div className="flex items-center gap-2 text-[var(--canvas-theme-icon-muted)]">
          <IconButton label="New chat" icon={Plus} onClick={() => void clearChat()} />
          <IconButton label="Close chat" icon={ArrowRight} onClick={onClose} />
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-3 pb-[164px] pt-4">
        {historyLoading ? (
          <div className="grid place-items-center py-10">
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-sm text-[var(--canvas-theme-text-soft)]">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading chat history...
            </div>
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="grid place-items-center py-10">
            <div className="max-w-[280px] text-center">
              <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--canvas-theme-text)]">Ask Carver AI</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--canvas-theme-text-muted)]">
                {projectId
                  ? "Describe your landscape idea, preserved layout constraints, planting goals, or material direction and we&apos;ll continue from there."
                  : "Open or create a project first, then Carver AI can save chat history and work against that project canvas."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {displayedMessages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[86%]" : "mr-auto max-w-[92%]"}>
                <div
                  className={[
                    "whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-[13px] leading-6 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
                    message.role === "user"
                      ? "border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text)]"
                      : message.status === "error"
                        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                        : "border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text-soft)]",
                  ].join(" ")}
                >
                  {message.content}
                  {message.generatedImages && message.generatedImages.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {message.generatedImages.map((image) => (
                        <figure
                          key={image.id}
                          className="overflow-hidden rounded-[14px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.imageUrl}
                            alt={image.title}
                            className="block aspect-[4/3] w-full object-cover"
                          />
                          <figcaption className="border-t border-[var(--canvas-theme-border)] px-3 py-2 text-xs font-medium text-[var(--canvas-theme-text-muted)]">
                            {image.title}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {isSending ? (
              <div className="mr-auto max-w-[92%]">
                <div className="flex items-center gap-2 rounded-[16px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3 text-[13px] leading-6 text-[var(--canvas-theme-text-soft)] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Carver AI is thinking...
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="px-2 pb-2" data-prompt-composer>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void addAttachments(event.target.files);
            }
            event.target.value = "";
          }}
        />

        <div className="overflow-hidden rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-[0_16px_36px_var(--canvas-theme-shadow)]">
          <div className="rounded-[16px] bg-[var(--canvas-theme-surface-panel)] px-3 py-3">
            <div
              className="flex min-h-[72px] flex-wrap items-start gap-0 text-sm leading-6"
              onClick={() => composerInputRef.current?.focus()}
            >
              {targetImageUrl ? (
                <button
                  type="button"
                  onClick={onClearLinkedImage}
                  className="mr-1 inline-flex h-6 max-w-full items-center gap-1.5 rounded-[10px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] px-2 align-middle text-xs font-medium text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
                  title={targetTitle ?? "Selected canvas image"}
                >
                  <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[4px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]">
                    <Image
                      src={targetImageUrl}
                      alt={targetTitle ?? "Selected canvas image"}
                      fill
                      sizes="14px"
                      className="object-cover"
                      unoptimized
                    />
                  </span>
                  <span className="truncate leading-none">Image</span>
                  <X className="h-3 w-3 shrink-0 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
                </button>
              ) : null}

              {attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="mr-1 inline-flex h-6 max-w-full items-center gap-1.5 rounded-[10px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] px-2 align-middle text-xs font-medium text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
                  title={attachment.name}
                >
                  <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[4px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]">
                    <Image
                      src={attachment.url}
                      alt={attachment.name}
                      fill
                      sizes="14px"
                      className="object-cover"
                      unoptimized
                    />
                  </span>
                  <span className="truncate leading-none">Image</span>
                  <X className="h-3 w-3 shrink-0 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
                </button>
              ))}

              <div className="relative flex-1 min-w-0">
                {!draft && !targetImageUrl && attachments.length === 0 ? (
                  <span className="pointer-events-none absolute left-0 top-0 text-sm leading-6 text-[var(--canvas-theme-text-muted)]">
                    Describe what you want to design, preserve, or change...
                  </span>
                ) : null}

                <span
                  ref={composerInputRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  onInput={(event) => onDraftChange(event.currentTarget.textContent ?? "")}
                  onKeyDown={(event) => {
                    if (event.key === "Backspace" && draft.length === 0) {
                      if (attachments.length > 0) {
                        event.preventDefault();
                        removeAttachment(attachments[attachments.length - 1]?.id ?? "");
                        return;
                      }

                      if (targetImageUrl) {
                        event.preventDefault();
                        onClearLinkedImage();
                        return;
                      }
                    }

                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  onPaste={(event) => {
                    const files: File[] = [];
                    Array.from(event.clipboardData.items).forEach((item) => {
                      if (!item.type.startsWith("image/")) return;
                      const file = item.getAsFile();
                      if (file) files.push(file);
                    });

                    if (files.length > 0) {
                      event.preventDefault();
                      void addAttachments(files);
                      return;
                    }
                  }}
                  className="block min-h-[24px] w-full whitespace-pre-wrap break-words bg-transparent text-sm leading-6 text-[var(--canvas-theme-text)] outline-none"
                />
              </div>
            </div>

            {errorMessage ? (
              <p className="mb-2 text-xs leading-5 text-[#B42318]">{errorMessage}</p>
            ) : enhanceMeta ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
                <span className="rounded-[10px] bg-[var(--canvas-theme-surface-muted)] px-2.5 py-1 font-medium text-[var(--canvas-theme-text)]">
                  {enhanceMeta.usedAiFallback ? "Enhanced by AI" : "Enhanced by rules"}
                </span>
                {enhanceMeta.attemptedAiFallback && !enhanceMeta.usedAiFallback ? (
                  <span className="rounded-[10px] bg-[#FEF3F2] px-2.5 py-1 font-medium text-[#B42318]">
                    AI fallback failed
                  </span>
                ) : null}
                <span>Intent: {enhanceMeta.detectedIntent.replaceAll("_", " ")}</span>
                <span>Score: {enhanceMeta.score}</span>
                {enhanceMeta.fallbackReason ? <span>{enhanceMeta.fallbackReason}</span> : null}
                {enhanceMeta.fallbackError ? <span className="text-[#B42318]">{enhanceMeta.fallbackError}</span> : null}
              </div>
            ) : attachments.length > 0 ? (
              <p className="mb-2 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
                Attached images will be sent to Carver AI as real image inputs for analysis or image generation.
              </p>
            ) : null}

            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[var(--canvas-theme-icon)]">
                <ComposerIcon label="Attach image" icon={Paperclip} onClick={() => fileInputRef.current?.click()} />
                <button
                  type="button"
                  onClick={() => void enhancePrompt()}
                  disabled={!canEnhance}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition",
                    canEnhance
                      ? "bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]"
                      : "bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text-muted)] opacity-60",
                  ].join(" ")}
                  title="Enhance prompt"
                >
                  {isEnhancing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  Enhance Prompt
                </button>
                {lastOriginalPrompt ? (
                  <button
                    type="button"
                    onClick={restoreOriginalPrompt}
                    className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
                    title="Restore original prompt"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Restore
                  </button>
                ) : null}
                <label className="relative inline-flex items-center">
                  <span className="sr-only">Chat model</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    className="h-8 appearance-none rounded-[10px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] pl-3 pr-8 text-xs font-semibold text-[var(--canvas-theme-text)] outline-none transition hover:bg-[var(--canvas-theme-hover)]"
                    title="Select chat model"
                  >
                    {OPENAI_CHAT_MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSend}
                className={[
                  "grid h-8 w-8 place-items-center rounded-[12px] transition",
                  canSend
                    ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
                    : "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] opacity-60",
                ].join(" ")}
                title={projectId ? "Send" : PROJECT_REQUIRED_MESSAGE}
              >
                {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="grid h-7 w-7 place-items-center rounded-[10px] hover:bg-[var(--canvas-theme-hover)]" title={label} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function ComposerIcon({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="grid h-8 w-8 place-items-center rounded-[10px] hover:bg-[var(--canvas-theme-hover)]" title={label} onClick={onClick}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
