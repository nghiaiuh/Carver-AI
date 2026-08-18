"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Camera,
  Grid2X2,
  Image as ImageIcon,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

type QuickAddCategory = "all" | "media" | "ai" | "camera";

type QuickAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: string) => void;
};

type QuickAddItem = {
  id: string;
  title: string;
  section: "Basics" | "Media" | "Camera";
  category: Exclude<QuickAddCategory, "all">;
  icon: LucideIcon;
  iconClassName: string;
  description: string;
};

const SECTION_ORDER: QuickAddItem["section"][] = ["Basics", "Media", "Camera"];

const QUICK_ADD_ITEMS: QuickAddItem[] = [
  { id: "carver-generate", title: "Image Generator", section: "Basics", category: "ai", icon: ImageIcon, iconClassName: "bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]", description: "Create an image generation node with graph-aware context." },
  { id: "ai-brief", title: "Assistant", section: "Basics", category: "ai", icon: Bot, iconClassName: "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-icon)]", description: "Add a landscape assistant prompt and result card." },
  { id: "upload-image", title: "Project Site Images", section: "Media", category: "media", icon: UploadCloud, iconClassName: "bg-sky-50 text-sky-600", description: "Choose a site photo or reference from the project library." },
  { id: "camera-shot-set", title: "Multi-Angles", section: "Camera", category: "camera", icon: Camera, iconClassName: "bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]", description: "Set up ordered camera shots from a connected plan or scene image." },
];

const CATEGORY_TABS: Array<{ id: QuickAddCategory; label: string; icon: QuickAddItem["icon"] }> = [
  { id: "all", label: "All tools", icon: Grid2X2 },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "camera", label: "Camera", icon: Camera },
];

export default function QuickAddMenu({
  open,
  onClose,
  onSelectType,
}: QuickAddMenuProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<QuickAddCategory>("all");

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!flyoutRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = QUICK_ADD_ITEMS.filter((item) => {
    if (activeCategory !== "all" && item.category !== activeCategory) return false;
    return !normalizedQuery || [item.title, item.description, item.section].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });

  return (
    <div
      ref={flyoutRef}
      role="dialog"
      aria-label="Add canvas tools"
      className="absolute left-[90px] top-1/2 z-[110] w-[300px] -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] shadow-[0_18px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out"
      data-canvas-ui="true"
      data-quick-add-flyout="true"
    >
      <div className="quick-add-search relative bg-[var(--canvas-theme-surface-panel)]">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-10 w-full appearance-none bg-transparent py-1.5 pl-10 pr-9 text-sm font-medium text-[var(--canvas-theme-text)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
        />
        <button type="button" onClick={onClose} aria-label="Close add tools" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-icon)]">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <>
          <div className="flex items-center gap-1 border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2 py-1.5">
            {CATEGORY_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeCategory === tab.id;
              return (
                <button key={tab.id} type="button" title={tab.label} aria-label={tab.label} aria-pressed={active} onClick={() => setActiveCategory(tab.id)} className={`grid h-6 w-6 place-items-center rounded-full transition ${active ? "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-icon)]" : "text-[var(--canvas-theme-icon-muted)] hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-icon)]"}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="quick-add-scroll max-h-[420px] overflow-y-auto p-2">
            {SECTION_ORDER.map((section) => {
              const sectionItems = filteredItems.filter((item) => item.section === section);
              if (sectionItems.length === 0) return null;
              return (
                <section key={section} className="mb-3 last:mb-0">
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--canvas-theme-text-muted)]">{section}</p>
                  <div className="space-y-0.5">
                    {sectionItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.id} type="button" onClick={() => {
                          onSelectType(item.id);
                          onClose();
                        }} className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left transition hover:bg-[var(--canvas-theme-hover)]">
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${item.iconClassName}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--canvas-theme-text)]">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {filteredItems.length === 0 ? <p className="px-3 py-8 text-center text-xs text-[var(--canvas-theme-text-muted)]">No available tools found.</p> : null}
          </div>
      </>
    </div>
  );
}
