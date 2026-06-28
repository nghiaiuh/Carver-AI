/*
 * Flow: Renders the canvas AI chat panel.
 * 1. Load persisted chat history for the current canvas.
 * 2. Let the user send messages to the backend chat route.
 * 3. Show assistant replies, loading states, and friendly errors inline.
 */

"use client";

import type {
  CanvasGenerationImageReference,
  CanvasGenerationPresetReference,
} from "@carver/shared";
import {
  ArrowRight,
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

type EditorRightPanelProps = {
  canvasId?: string;
  projectId?: string;
  targetTitle?: string | null;
  targetImageUrl?: string | null;
  targetReferenceCount?: number;
  targetPresetCount?: number;
  connectedImageReferences?: CanvasGenerationImageReference[];
  connectedPresetReferences?: CanvasGenerationPresetReference[];
  draft: string;
  onDraftChange: (value: string) => void;
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
  status?: "error";
};

type ChatRouteMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  projectId?: string;
  canvasId?: string;
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
};

const DEFAULT_CANVAS_ID = "canvas-main";

function formatPresetReferenceLabel(reference: CanvasGenerationPresetReference) {
  if (reference.slot?.trim()) {
    return `${reference.label} (${reference.slot})`;
  }

  return `${reference.label} (${reference.category})`;
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

export default function EditorRightPanel({
  canvasId = DEFAULT_CANVAS_ID,
  projectId,
  targetTitle,
  targetImageUrl,
  targetReferenceCount = 0,
  targetPresetCount = 0,
  connectedImageReferences = [],
  connectedPresetReferences = [],
  draft,
  onDraftChange,
  onClearLinkedImage,
  onClose,
  onToast,
}: EditorRightPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastOriginalPrompt, setLastOriginalPrompt] = useState<string | null>(null);
  const [enhanceMeta, setEnhanceMeta] = useState<EnhancePromptResult | null>(null);
  const composerInputRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<PromptAttachment[]>([]);
  const hasCanvasLinkedImage = Boolean(targetImageUrl);

  const canSend = useMemo(
    () => !isSending && (draft.trim().length > 0 || attachments.length > 0 || hasCanvasLinkedImage),
    [attachments.length, draft, hasCanvasLinkedImage, isSending],
  );
  const canEnhance = !isEnhancing && draft.trim().length > 0;

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    if (el.textContent === draft) return;
    el.textContent = draft;
  }, [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isSending, messages.length]);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({ canvasId });
        if (projectId) params.set("projectId", projectId);

        const response = await fetch(`/api/chat?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          messages?: ChatRouteMessage[];
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load previous chat history.");
        }

        if (!active) return;

        setMessages(
          (payload.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
        );
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
    try {
      const params = new URLSearchParams({ canvasId });
      if (projectId) params.set("projectId", projectId);

      const response = await fetch(`/api/chat?${params.toString()}`, {
        method: "DELETE",
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
        headers: {
          "Content-Type": "application/json",
        },
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

  const send = async () => {
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

    const optimisticUserMessage: ChatMessage = {
      id: `local_user_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMessage]);
    setErrorMessage(null);
    setIsSending(true);
    onDraftChange("");
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    setAttachments([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          canvasId,
          projectId,
          content,
          images,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        userMessage?: ChatRouteMessage;
        assistantMessage?: ChatRouteMessage;
      };

      if (!response.ok || !payload.userMessage || !payload.assistantMessage) {
        throw new Error(payload.error || "Carver AI could not answer right now.");
      }

      const userMessage = payload.userMessage;
      const assistantMessage = payload.assistantMessage;

      setMessages((prev) => [
        ...prev.filter((message) => message.id !== optimisticUserMessage.id),
        {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: userMessage.createdAt,
        },
        {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
        },
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
    <aside className="flex h-full w-full shrink-0 flex-col bg-[#FFFFFF] text-[var(--canvas-theme-text)]">
      <div className="flex h-14 items-center justify-between border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">AI Chat</h2>
        <div className="flex items-center gap-2 text-[var(--canvas-theme-icon-muted)]">
          <IconButton label="New chat" icon={Plus} onClick={() => void clearChat()} />
          <IconButton label="Close chat" icon={ArrowRight} onClick={onClose} />
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-[164px] pt-5">
        <div className="mb-4 rounded-[16px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-3 text-xs text-[var(--canvas-theme-text-muted)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">Generation target</p>
          <p className="mt-1 text-sm font-semibold text-[var(--canvas-theme-text)]">
            {targetTitle ?? "No image selected"}
          </p>
          <p className="mt-1">
            {targetTitle
              ? `${targetReferenceCount} image reference(s) / ${targetPresetCount} preset reference(s)`
              : "Click an image on the canvas to bind this prompt to that target."}
          </p>
        </div>

        {historyLoading ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-sm text-[var(--canvas-theme-text-soft)]">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading chat history...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="max-w-[280px] text-center">
              <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--canvas-theme-text)]">Ask Carver AI</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--canvas-theme-text-muted)]">
                Describe your landscape idea, preserved layout constraints, planting goals, or material direction and we&apos;ll continue from there.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[86%]" : "mr-auto max-w-[92%]"}>
                <div
                  className={[
                    "whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[13px] leading-6 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
                    message.role === "user"
                      ? "border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text)]"
                      : message.status === "error"
                        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                        : "border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text-soft)]",
                  ].join(" ")}
                >
                  {message.content}
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
                Attached images will be sent to Carver AI as real image inputs for analysis.
              </p>
            ) : null}

            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[var(--canvas-theme-icon)]">
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
                title="Send"
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
