/*
 * Flow: Renders the canvas AI chat panel.
 * 1. Load persisted chat history for the current canvas.
 * 2. Let the user send messages to the backend chat route.
 * 3. Show assistant replies, loading states, and friendly errors inline.
 */

"use client";

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
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

type PromptAttachment = {
  id: string;
  name: string;
  url: string;
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

function buildPromptContent(prompt: string, attachments: PromptAttachment[]) {
  const trimmedPrompt = prompt.trim();
  const attachmentSummary =
    attachments.length > 0
      ? `Attached local image names: ${attachments.map((attachment) => attachment.name).join(", ")}`
      : "";

  return [trimmedPrompt, attachmentSummary].filter(Boolean).join("\n\n").trim();
}

export default function EditorRightPanel({
  canvasId = DEFAULT_CANVAS_ID,
  projectId,
  draft,
  onDraftChange,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<PromptAttachment[]>([]);

  const canSend = useMemo(() => !isSending && (draft.trim().length > 0 || attachments.length > 0), [attachments.length, draft, isSending]);
  const canEnhance = !isEnhancing && draft.trim().length > 0;

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => autosize(), [draft]);

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

  const addAttachments = (files: File[] | FileList) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setAttachments((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({
        id: `att_${Date.now()}_${file.name || "pasted"}`,
        name: file.name || "Pasted Image",
        url: URL.createObjectURL(file),
      })),
    ]);
    onToast(`${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"} attached`);
  };

  const handlePromptPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    Array.from(event.clipboardData.items).forEach((item) => {
      if (!item.type.startsWith("image/")) return;
      const file = item.getAsFile();
      if (file) files.push(file);
    });

    if (files.length === 0) return;

    event.preventDefault();
    addAttachments(files);
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
    const content = buildPromptContent(draft, attachments);
    if (!content) return;

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
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <div className="flex h-12 items-center justify-between px-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">AI Chat</h2>
        <div className="flex items-center gap-2 text-[var(--canvas-theme-icon-muted)]">
          <IconButton label="New chat" icon={Plus} onClick={() => void clearChat()} />
          <IconButton label="Close chat" icon={ArrowRight} onClick={onClose} />
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-[164px] pt-5">
        {historyLoading ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-sm text-[var(--canvas-theme-text-soft)]">
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
                    "whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-6",
                    message.role === "user"
                      ? "bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text)]"
                      : message.status === "error"
                        ? "border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                        : "bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text-soft)]",
                  ].join(" ")}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isSending ? (
              <div className="mr-auto max-w-[92%]">
                <div className="flex items-center gap-2 rounded-2xl bg-[var(--canvas-theme-surface-panel)] px-4 py-3 text-[13px] leading-6 text-[var(--canvas-theme-text-soft)]">
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
            if (event.target.files) addAttachments(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="overflow-hidden rounded-[20px] bg-[var(--canvas-theme-surface-soft)] shadow-[0_2px_14px_var(--canvas-theme-shadow)]">
          <div className="rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2.5">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              onPaste={handlePromptPaste}
              placeholder="Describe what you want to design, preserve, or change..."
              rows={3}
              className="min-h-[72px] w-full resize-none bg-transparent text-sm leading-6 text-[var(--canvas-theme-text)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
            />

            {attachments.length > 0 ? (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]">
                    <Image src={attachment.url} alt={attachment.name} fill sizes="64px" className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white"
                      title="Remove image"
                    >
                      <X className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {errorMessage ? (
              <p className="mb-2 text-xs leading-5 text-[#B42318]">{errorMessage}</p>
            ) : enhanceMeta ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
                <span className="rounded-full bg-[var(--canvas-theme-surface-muted)] px-2.5 py-1 font-medium text-[var(--canvas-theme-text)]">
                  {enhanceMeta.usedAiFallback ? "Enhanced by AI" : "Enhanced by rules"}
                </span>
                {enhanceMeta.attemptedAiFallback && !enhanceMeta.usedAiFallback ? (
                  <span className="rounded-full bg-[#FEF3F2] px-2.5 py-1 font-medium text-[#B42318]">
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
                Attached image names will be included with your prompt. Full image understanding can be added later.
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
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
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
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
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
                  "grid h-8 w-8 place-items-center rounded-full transition",
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
    <button type="button" className="grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--canvas-theme-hover)]" title={label} onClick={onClick}>
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
    <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--canvas-theme-hover)]" title={label} onClick={onClick}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
