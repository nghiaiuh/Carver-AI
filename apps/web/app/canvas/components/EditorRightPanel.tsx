"use client";

import {
  ArrowRightFromLine,
  BookOpen,
  Box,
  ChevronDown,
  CornerDownLeft,
  Lightbulb,
  Mic,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type EditorRightPanelProps = {
  draft: string;
  onDraftChange: (value: string) => void;
};

export default function EditorRightPanel({ draft, onDraftChange }: EditorRightPanelProps) {
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agent, setAgent] = useState<"Agent" | "Planner" | "Designer">("Agent");

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);
  const title = useMemo(() => {
    const t = (messages.findLast?.((m) => m.role === "user")?.content ?? "Start with an idea").trim();
    return t.length > 36 ? `${t.slice(0, 36)}...` : t;
  }, [messages]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  useEffect(() => autosize(), [draft]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      setShowJump(distance > 240);
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const clear = () => {
    setMessages([]);
    onDraftChange("");
  };

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const id = `m_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id, role: "user", content },
      {
        id: `${id}_a`,
        role: "assistant",
        content:
          "Ok. Mo ta ro hon ban muon thay doi gi tren canvas (doi tuong, vi tri, kich thuoc, mau sac, phong cach).",
      },
    ]);
    onDraftChange("");
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#E5E7EB] bg-white">
      <div className="flex h-12 items-center justify-between border-b border-[#E5E7EB] px-3">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[#0A0A0A]" title={title}>
          {title}
        </p>
        <div className="flex items-center gap-1 pl-2">
          <IconButton label="New" onClick={clear} icon={Plus} />
          <IconButton label="More" onClick={() => {}} icon={ChevronDown} />
          <IconButton label="Share" onClick={() => {}} icon={Share2} />
          <IconButton label="Pop out" onClick={() => {}} icon={ArrowRightFromLine} />
        </div>
      </div>

      <div ref={scrollerRef} className="relative flex-1 overflow-y-auto bg-white px-4 py-4">
        {messages.length === 0 ? (
          <div className="text-sm font-medium leading-6 text-[#667085]">
            Start with an idea, or type &quot;@&quot; to mention
          </div>
        ) : (
          <div className="grid gap-6 pb-8">
            {messages.map((m, idx) => (
              <div key={m.id} className="text-[15px] leading-7 text-[#101828]">
                {idx === 0 ? (
                  <div className="mb-3 text-xs font-semibold text-[#98A2B3]">Today</div>
                ) : null}
                {m.role === "assistant" ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div className="whitespace-pre-wrap font-semibold">{m.content}</div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {showJump ? (
          <button
            type="button"
            onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
            className="absolute bottom-5 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#667085] shadow-sm hover:bg-[#F7F8FA]"
            title="Jump to bottom"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="border-t border-[#E5E7EB] bg-white p-3">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white px-3 py-3 shadow-sm">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Start with an idea, or type '@' to mention"
            rows={1}
            className="w-full resize-none bg-transparent text-sm font-medium leading-6 text-[#101828] outline-none placeholder:text-[#98A2B3]"
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <DockButton label="Attach" icon={Plus} onClick={() => {}} />
              <DockButton label="Library" icon={BookOpen} onClick={() => {}} />
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-sm font-medium text-[#101828] hover:bg-[#F7F8FA]"
                  onClick={() => setAgentOpen((v) => !v)}
                  title="Agent"
                >
                  <span className="text-xs font-semibold text-[#101828]">{agent}</span>
                  <ChevronDown className="h-4 w-4 text-[#667085]" aria-hidden="true" />
                </button>
                {agentOpen ? (
                  <div className="absolute bottom-11 left-0 z-50 w-44 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
                    {(["Agent", "Planner", "Designer"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={[
                          "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F7F8FA]",
                          agent === opt ? "font-semibold text-[#101828]" : "font-medium text-[#344054]",
                        ].join(" ")}
                        onClick={() => {
                          setAgent(opt);
                          setAgentOpen(false);
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <DockButton label="Ideas" icon={Lightbulb} onClick={() => {}} />
              <DockButton label="Objects" icon={Box} onClick={() => {}} />
              <DockButton label="Voice" icon={Mic} onClick={() => {}} />
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className={[
                  "inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-semibold",
                  canSend ? "bg-[#111827] text-white hover:bg-[#0B1220]" : "bg-[#F2F4F7] text-[#98A2B3]",
                ].join(" ")}
                title="Send"
              >
                <CornerDownLeft className="h-4 w-4" aria-hidden="true" />
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
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#667085] hover:bg-[#F7F8FA]"
      title={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function DockButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#667085] hover:bg-[#F7F8FA]"
      title={label}
      onClick={onClick}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
