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

type EditorRightPanelProps = {
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

export default function EditorRightPanel({ draft, onDraftChange, onClose, onToast }: EditorRightPanelProps) {
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agent, setAgent] = useState<"Agent" | "Planner" | "Designer">("Agent");
  const [promoVisible, setPromoVisible] = useState(true);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);

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
    onDraftChange("");
    onToast("New chat started");
  };

  const send = () => {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;
    const id = `m_${Date.now()}`;
    const attachmentText =
      attachments.length > 0 ? `\n\n${attachments.length} image attachment${attachments.length === 1 ? "" : "s"}` : "";

    setMessages((prev) => [
      ...prev,
      { id, role: "user", content: `${content || "Image prompt"}${attachmentText}` },
      {
        id: `${id}_a`,
        role: "assistant",
        content: "Mình đã nhận ý tưởng. Hãy thêm ảnh mặt bằng hoặc mô tả khu vực để Carver dựng concept chính xác hơn.",
      },
    ]);
    onDraftChange("");
    setAttachments([]);
  };

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-[#E9E9E9] bg-white text-[#1F1F1F]">
      <div className="flex h-12 items-center justify-between px-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">New chat</h2>
        <div className="flex items-center gap-2 text-[#A5A5A5]">
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
              <div
                key={message.id}
                className={[
                  "max-w-[86%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-5",
                  message.role === "user"
                    ? "ml-auto bg-[#F3F4F6] font-medium text-[#111827]"
                    : "mr-auto bg-white text-[#344054]",
                ].join(" ")}
              >
                {message.content}
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
        <div className="overflow-hidden rounded-[20px] bg-[#F4F4F4] shadow-[0_2px_14px_rgba(0,0,0,0.09)]">
          {promoVisible ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-black">
              <CircleDollarSign className="h-3.5 w-3.5 fill-[#DFFF27] text-black" aria-hidden="true" />
              <span>Limited Time: Upgrade now&amp;save up to 45% OFF!</span>
              <button
                type="button"
                onClick={() => setPromoVisible(false)}
                className="ml-auto text-base leading-none text-[#333]"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          ) : null}

          <div className="rounded-[18px] border border-[#E1E1E1] bg-white px-3 py-2.5">
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
              className="min-h-[60px] w-full resize-none bg-transparent text-sm font-medium leading-5 text-[#111827] outline-none placeholder:text-[#A8A8A8]"
            />

            {attachments.length > 0 ? (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F7F7F7]">
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
              <div className="flex items-center gap-1.5 text-[#333]">
                <ComposerIcon label="Attach image" icon={Plus} onClick={() => fileInputRef.current?.click()} />
                <ComposerIcon label="Library" icon={BookOpen} onClick={() => onToast("Library opened")} />
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-[#F7F7F7]"
                    onClick={() => setAgentOpen((value) => !value)}
                  >
                    <Bot className="h-4 w-4" aria-hidden="true" />
                    {agent}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {agentOpen ? (
                    <div className="absolute bottom-10 left-0 z-50 w-36 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-xl">
                      {(["Agent", "Planner", "Designer"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs font-semibold hover:bg-[#F7F7F7]"
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

              <div className="flex items-center gap-1.5 text-[#333]">
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
                    canSend ? "bg-[#262626] text-white" : "bg-[#262626] text-white opacity-70",
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
      className="inline-flex items-center gap-1 rounded-full border border-[#E8E8E8] bg-white px-2.5 py-1 text-xs font-medium text-[#292929] shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:border-[#D5D5D5]"
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
    <button type="button" className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#F5F5F5]" title={label} onClick={onClick}>
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
    <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#F7F7F7]" title={label} onClick={onClick}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
