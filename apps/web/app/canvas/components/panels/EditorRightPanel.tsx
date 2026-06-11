/*
 * Flow: Renders the Lovart-style chat panel.
 * 1. Show a compact chat header with quick actions.
 * 2. Offer centered Carver skills before messages exist.
 * 3. Keep the composer anchored at the bottom with image paste support.
 */

"use client";

import {
  ArrowRight,
  BookOpen,
  Bot,
  Box,
  ChevronDown,
  CircleDollarSign,
  Lightbulb,
  Mic,
  Plus,
  Share2,
  Sparkles,
  Store,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryAsset } from "../../types/library";

type EditorRightPanelProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  onAddAiResultToLibrary: (params: {
    imageUrl: string;
    prompt?: string;
    suggestedFolderTitle?: string;
    title?: string;
    metadata?: LibraryAsset["metadata"];
  }) => void;
};

type PromptAttachment = {
  id: string;
  name: string;
  url: string;
};

type AiResultItem = {
  id: string;
  imageUrl: string;
  title: string;
  suggestedFolderTitle?: string;
  prompt?: string;
  metadata?: LibraryAsset["metadata"];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  results?: AiResultItem[];
};

const skills = [
  { label: "Seedance 2.0 Video Creation", icon: Video, tone: "purple" },
  { label: "One-shot Video", icon: Video, tone: "purple" },
  { label: "Instagram Post", icon: Sparkles, tone: "blue" },
  { label: "Cross-Platform Repurposer", icon: Sparkles, tone: "blue" },
  { label: "Logo Design", icon: Store, tone: "orange" },
  { label: "UGC: Lifestyle Try-on", icon: Store, tone: "pink" },
  { label: "AI Stylist: High-Conversion Looks", icon: Store, tone: "pink" },
  { label: "All Skills", icon: BookOpen, tone: "slate" },
] as const;

const aiResultImagePool = ["/assets/garden_3d_render.png", "/assets/mark_generation.png", "/assets/canvas_texture.png"] as const;

function inferSuggestedFolderTitle(prompt: string) {
  const normalized = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/(penjing|bonsai)/.test(normalized)) return "Penjing";
  if (/(stone|rock|da)/.test(normalized)) return "Stone";
  if (/(tree|cay|palm|tropical)/.test(normalized)) return "Tree";
  return "Uncategorized";
}

function buildMockAiResults(prompt: string, attachmentCount: number) {
  const baseTitle = inferSuggestedFolderTitle(prompt);
  const description = prompt.trim() || "Landscape reference";

  return aiResultImagePool.map((imageUrl, index) => ({
    id: `ai_result_${Date.now()}_${index}`,
    imageUrl,
    title: `${baseTitle} ${index + 1}`,
    suggestedFolderTitle: baseTitle,
    prompt: description,
    metadata: {
      categoryHint: baseTitle,
      model: attachmentCount > 0 ? "Carver Vision Search" : "Carver Moodboard Search",
      originalWidth: 1522,
      originalHeight: 1146,
    },
  }));
}

export default function EditorRightPanel({ draft, onDraftChange, onClose, onToast, onAddAiResultToLibrary }: EditorRightPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agent, setAgent] = useState<"Agent" | "Planner" | "Designer">("Agent");
  const [promoVisible, setPromoVisible] = useState(true);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [dismissedAiResultIds, setDismissedAiResultIds] = useState<string[]>([]);

  const canSend = useMemo(() => draft.trim().length > 0 || attachments.length > 0, [attachments.length, draft]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  useEffect(() => autosize(), [draft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const addAttachments = (files: File[] | FileList) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setAttachments((prev) => [
      ...prev,
      ...imageFiles.map((file) => ({
        id: `att_${Date.now()}_${file.name || "pasted"}`,
        name: file.name || "Pasted image",
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

  const clearChat = () => {
    setMessages([]);
    setAttachments([]);
    setDismissedAiResultIds([]);
    onDraftChange("");
    onToast("New chat started");
  };

  const send = () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;
    const id = `m_${Date.now()}`;
    const attachmentText =
      attachments.length > 0 ? `\n\n${attachments.length} image attachment${attachments.length === 1 ? "" : "s"}` : "";
    const aiResults = buildMockAiResults(content || "Landscape reference", attachments.length);

    setMessages((prev) => [
      ...prev,
      { id, role: "user", content: `${content || "Image prompt"}${attachmentText}` },
      {
        id: `${id}_a`,
        role: "assistant",
        content: "Mình đã gom vài asset tham chiếu phù hợp. Bạn có thể thêm từng ảnh vào Library để kéo thả tiếp trên canvas.",
        results: aiResults,
      },
    ]);
    onDraftChange("");
    setAttachments([]);
  };

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <div className="flex h-12 items-center justify-between px-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">New chat</h2>
        <div className="flex items-center gap-2 text-[var(--canvas-theme-icon-muted)]">
          <IconButton label="New chat" icon={Plus} onClick={clearChat} />
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          <IconButton label="Share" icon={Share2} onClick={() => onToast("Share link copied")} />
          <IconButton label="Close chat" icon={ArrowRight} onClick={onClose} />
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-[160px] pt-5">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="w-full max-w-[292px] text-center">
              <h3 className="mb-5 text-sm font-semibold tracking-[-0.01em]">Try these Carver Skills</h3>
              <div className="flex flex-wrap justify-center gap-1.5">
                {skills.map((skill) => (
                  <SkillPill
                    key={skill.label}
                    {...skill}
                    onClick={() => {
                      onDraftChange(skill.label);
                      textareaRef.current?.focus();
                      onToast(`${skill.label} selected`);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[86%]" : "mr-auto max-w-[92%]"}>
                <div
                  className={[
                    "whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-5",
                    message.role === "user"
                      ? "bg-[var(--canvas-theme-surface-soft)] font-medium text-[var(--canvas-theme-text)]"
                      : "bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text-soft)]",
                  ].join(" ")}
                >
                  {message.content}
                </div>
                {message.role === "assistant" && message.results?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {message.results
                      .filter((result) => !dismissedAiResultIds.includes(result.id))
                      .map((result) => (
                        <div
                          key={result.id}
                          className="overflow-hidden rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]"
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-[var(--canvas-theme-surface-muted)]">
                            <Image src={result.imageUrl} alt={result.title} fill sizes="140px" className="object-cover" />
                          </div>
                          <div className="space-y-2 p-2.5">
                            <div>
                              <p className="truncate text-xs font-semibold text-[var(--canvas-theme-text)]">{result.title}</p>
                              <p className="truncate text-[11px] text-[var(--canvas-theme-text-muted)]">
                                {result.suggestedFolderTitle ?? "Uncategorized"}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onAddAiResultToLibrary({
                                    imageUrl: result.imageUrl,
                                    prompt: result.prompt,
                                    suggestedFolderTitle: result.suggestedFolderTitle,
                                    title: result.title,
                                    metadata: result.metadata,
                                  });
                                  onToast(`Added "${result.title}" to Library`);
                                }}
                                className="flex-1 rounded-full bg-[var(--canvas-theme-active)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--canvas-theme-active-text)]"
                              >
                                Add to Library
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDismissedAiResultIds((prev) => [...prev, result.id]);
                                  onToast(`Skipped "${result.title}"`);
                                }}
                                className="rounded-full border border-[var(--canvas-theme-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--canvas-theme-text-soft)]"
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            ))}
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
          {promoVisible ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-[var(--canvas-theme-text)]">
              <CircleDollarSign className="h-3.5 w-3.5 fill-[#DFFF27] text-[var(--canvas-theme-icon)]" aria-hidden="true" />
              <span>Limited Time: Upgrade now&amp;save up to 45% OFF!</span>
              <button
                type="button"
                onClick={() => setPromoVisible(false)}
                className="ml-auto text-base leading-none text-[var(--canvas-theme-icon)]"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          ) : null}

          <div className="rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2.5">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              onPaste={handlePromptPaste}
              placeholder={'Start with an idea, or type "@" to mention'}
              rows={3}
              className="min-h-[60px] w-full resize-none bg-transparent text-sm font-medium leading-5 text-[var(--canvas-theme-text)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
            />

            {attachments.length > 0 ? (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]">
                    <Image src={attachment.url} alt={attachment.name} fill sizes="64px" className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                      className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white"
                      title="Remove image"
                    >
                      <X className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[var(--canvas-theme-icon)]">
                <ComposerIcon label="Attach image" icon={Plus} onClick={() => fileInputRef.current?.click()} />
                <ComposerIcon label="Library" icon={BookOpen} onClick={() => onToast("Library opened")} />
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-[var(--canvas-theme-hover)]"
                    onClick={() => setAgentOpen((value) => !value)}
                  >
                    <Bot className="h-4 w-4" aria-hidden="true" />
                    {agent}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {agentOpen ? (
                    <div className="absolute bottom-10 left-0 z-50 w-36 overflow-hidden rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-xl shadow-[var(--canvas-theme-shadow)]">
                      {(["Agent", "Planner", "Designer"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--canvas-theme-hover)]"
                          onClick={() => {
                            setAgent(option);
                            setAgentOpen(false);
                            onToast(`${option} selected`);
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[var(--canvas-theme-icon)]">
                <ComposerIcon
                  label="Ideas"
                  icon={Lightbulb}
                  onClick={() => {
                    onDraftChange(draft || "Thiết kế sân vườn biệt thự hiện đại với hồ koi");
                    textareaRef.current?.focus();
                  }}
                />
                <ComposerIcon label="Objects" icon={Box} onClick={() => onToast("Object picker opened")} />
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  className={[
                    "grid h-8 w-8 place-items-center rounded-full transition",
                    canSend ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]" : "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] opacity-70",
                  ].join(" ")}
                  title="Send"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SkillPill({
  label,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone: "purple" | "blue" | "orange" | "pink" | "slate";
  onClick: () => void;
}) {
  const color =
    tone === "purple"
      ? "text-[#8B5CF6]"
      : tone === "blue"
        ? "text-[#2563EB]"
        : tone === "orange"
          ? "text-[#F97316]"
          : tone === "pink"
            ? "text-[#EC4899]"
            : "text-[#98A2B3]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2.5 py-1 text-xs font-medium text-[var(--canvas-theme-text)] shadow-[0_1px_0_var(--canvas-theme-shadow)] transition hover:border-[var(--canvas-theme-border-strong)]"
    >
      <Icon className={`h-3.5 w-3.5 ${color}`} aria-hidden="true" />
      {label}
    </button>
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
