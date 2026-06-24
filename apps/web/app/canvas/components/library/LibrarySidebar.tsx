"use client";

import type { LucideIcon } from "lucide-react";
import {
  Box,
  BrickWall,
  Check,
  ChevronDown,
  ImagePlus,
  Mountain,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { LibraryAsset, LibraryFolder } from "../../types/library";
import LibraryAssetGrid from "./LibraryAssetGrid";
import LibraryFolderTabs from "./LibraryFolderTabs";

type LibrarySidebarProps = {
  folders: LibraryFolder[];
  activeFolderId: string;
  selectedAssetId: string | null;
  onSelectFolder: (folderId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onCreateFolder: (title: string, createdBy?: "ai" | "user") => LibraryFolder | null;
  onRenameFolder: (folderId: string, title: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteAsset: (folderId: string, assetId: string) => void;
  onAddAssetToCanvas: (asset: LibraryAsset) => void;
  onUploadAssets: (folderId: string, files: FileList | File[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

type SectionId = "environment" | "material" | "object";
type EnvironmentSlotId = "season" | "lighting" | "atmosphere" | "environment";
type EnvironmentTabId = "presets" | "custom" | "pinterest";
type EnvironmentTemplate = {
  id: string;
  label: string;
  imageSrc: string;
};

const ENVIRONMENT_SLOTS: Array<{ id: EnvironmentSlotId; label: string }> = [
  { id: "season", label: "Season" },
  { id: "lighting", label: "Lighting" },
  { id: "atmosphere", label: "Atmosphere" },
  { id: "environment", label: "Environment" },
];

const ENVIRONMENT_TEMPLATE_LIBRARY: Record<EnvironmentSlotId, EnvironmentTemplate[]> = {
  season: [
    { id: "season-early-spring", label: "Early Spring", imageSrc: "/assets/garden_3d_render.png" },
    { id: "season-full-bloom", label: "Full Bloom", imageSrc: "/assets/bonsai.png" },
    { id: "season-lush-summer", label: "Lush Summer", imageSrc: "/assets/urban_waterfall.png" },
    { id: "season-dry-summer", label: "Dry Summer", imageSrc: "/assets/co_thach.png" },
    { id: "season-golden-autumn", label: "Golden Autumn", imageSrc: "/assets/waterfall.png" },
    { id: "season-late-autumn", label: "Late Autumn", imageSrc: "/assets/tai_meo.png" },
  ],
  lighting: [
    { id: "lighting-soft-morning", label: "Soft Morning", imageSrc: "/assets/garden_3d_render.png" },
    { id: "lighting-clear-noon", label: "Clear Noon", imageSrc: "/assets/urban_waterfall.png" },
    { id: "lighting-golden-hour", label: "Golden Hour", imageSrc: "/assets/waterfall.png" },
    { id: "lighting-blue-hour", label: "Blue Hour", imageSrc: "/assets/tai_meo.png" },
    { id: "lighting-overcast", label: "Overcast", imageSrc: "/assets/co_thach.png" },
    { id: "lighting-night-glow", label: "Night Glow", imageSrc: "/assets/bonsai.png" },
  ],
  atmosphere: [
    { id: "atmosphere-fresh-air", label: "Fresh Air", imageSrc: "/assets/bonsai.png" },
    { id: "atmosphere-misty", label: "Misty", imageSrc: "/assets/tai_meo.png" },
    { id: "atmosphere-rainy", label: "Rainy", imageSrc: "/assets/waterfall.png" },
    { id: "atmosphere-crisp", label: "Crisp", imageSrc: "/assets/co_thach.png" },
    { id: "atmosphere-humid", label: "Humid", imageSrc: "/assets/urban_waterfall.png" },
    { id: "atmosphere-serene", label: "Serene", imageSrc: "/assets/garden_3d_render.png" },
  ],
  environment: [
    { id: "environment-koi-garden", label: "Koi Garden", imageSrc: "/assets/waterfall.png" },
    { id: "environment-courtyard", label: "Courtyard", imageSrc: "/assets/garden_3d_render.png" },
    { id: "environment-tropical", label: "Tropical", imageSrc: "/assets/urban_waterfall.png" },
    { id: "environment-stone-court", label: "Stone Court", imageSrc: "/assets/co_thach.png" },
    { id: "environment-bonsai-yard", label: "Bonsai Yard", imageSrc: "/assets/bonsai.png" },
    { id: "environment-rockery", label: "Rockery", imageSrc: "/assets/tai_meo.png" },
  ],
};

export default function LibrarySidebar({
  folders,
  activeFolderId,
  selectedAssetId,
  onSelectFolder,
  onSelectAsset,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteAsset,
  onAddAssetToCanvas,
  onUploadAssets,
  onClose,
  onToast,
}: LibrarySidebarProps) {
  const [openSection, setOpenSection] = useState<SectionId | null>("object");
  const [activeEnvironmentSlot, setActiveEnvironmentSlot] = useState<EnvironmentSlotId | null>(null);
  const [environmentTab, setEnvironmentTab] = useState<EnvironmentTabId>("presets");
  const [selectedEnvironmentTemplates, setSelectedEnvironmentTemplates] = useState<
    Partial<Record<EnvironmentSlotId, EnvironmentTemplate>>
  >({});
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | NonNullable<LibraryAsset["source"]>>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? folders[0] ?? null,
    [activeFolderId, folders],
  );
  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (activeFolder?.assets ?? []).filter((asset) => {
      const matchesQuery =
        !normalizedQuery ||
        (asset.title ?? "").toLowerCase().includes(normalizedQuery) ||
        (asset.prompt ?? "").toLowerCase().includes(normalizedQuery) ||
        (asset.metadata?.categoryHint ?? "").toLowerCase().includes(normalizedQuery) ||
        (asset.metadata?.speciesName ?? "").toLowerCase().includes(normalizedQuery);
      const matchesSource = sourceFilter === "all" || asset.source === sourceFilter;
      return matchesQuery && matchesSource;
    });
  }, [activeFolder, query, sourceFilter]);
  const sourceCounts = useMemo(() => {
    const counts = {
      all: activeFolder?.assets.length ?? 0,
      "ai-chat": 0,
      upload: 0,
      manual: 0,
    };

    (activeFolder?.assets ?? []).forEach((asset) => {
      if (asset.source === "ai-chat") counts["ai-chat"] += 1;
      if (asset.source === "upload") counts.upload += 1;
      if (asset.source === "manual") counts.manual += 1;
    });

    return counts;
  }, [activeFolder]);
  const activeEnvironmentTemplates = activeEnvironmentSlot ? ENVIRONMENT_TEMPLATE_LIBRARY[activeEnvironmentSlot] : [];

  const requestCreateFolder = () => {
    const title = window.prompt("New folder name", "");
    if (!title?.trim()) return;
    const folder = onCreateFolder(title, "user");
    if (folder) onToast(`Folder "${folder.title}" created`);
  };

  const requestRenameFolder = () => {
    if (!activeFolder) return;
    const title = window.prompt("Rename folder", activeFolder.title);
    if (!title?.trim() || title.trim() === activeFolder.title) return;
    onRenameFolder(activeFolder.id, title);
    onToast(`Folder renamed to "${title.trim()}"`);
  };

  const requestDeleteFolder = () => {
    if (!activeFolder) return;
    if (!window.confirm(`Delete folder "${activeFolder.title}" and all its assets?`)) return;
    onDeleteFolder(activeFolder.id);
    onToast(`Folder "${activeFolder.title}" deleted`);
  };

  const requestDeleteAsset = (asset: LibraryAsset) => {
    if (!activeFolder) return;
    if (!window.confirm(`Delete "${asset.title ?? "this asset"}" from library?`)) return;
    onDeleteAsset(activeFolder.id, asset.id);
    onToast(`Removed "${asset.title ?? "asset"}"`);
  };

  const requestPreviewAsset = (asset: LibraryAsset) => {
    window.open(asset.src, "_blank", "noopener,noreferrer");
  };

  const toggleSection = (section: SectionId) => {
    setOpenSection((current) => (current === section ? null : section));
    if (section !== "environment") {
      setActiveEnvironmentSlot(null);
    }
  };

  const toggleEnvironmentSlot = (slotId: EnvironmentSlotId) => {
    setOpenSection("environment");
    setActiveEnvironmentSlot((current) => (current === slotId ? null : slotId));
  };

  const selectEnvironmentTemplate = (slotId: EnvironmentSlotId, template: EnvironmentTemplate) => {
    setSelectedEnvironmentTemplates((current) => ({
      ...current,
      [slotId]: template,
    }));
    const slotLabel = ENVIRONMENT_SLOTS.find((slot) => slot.id === slotId)?.label ?? "Environment";
    onToast(`${slotLabel}: ${template.label}`);
  };

  return (
    <div className="relative flex h-full w-full shrink-0 overflow-visible bg-white text-[var(--canvas-theme-text)]">
      <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-white">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files && activeFolder) {
              onUploadAssets(activeFolder.id, event.target.files);
            }
            event.target.value = "";
          }}
        />

        <div className="border-b border-[var(--canvas-theme-border)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--canvas-theme-text-muted)]">
                Library
              </p>
              <h2 className="mt-2 text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">
                Project assets
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
                Build references for prompt-driven image generation.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-white text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
              title="Close library"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <AccordionSection
            icon={Mountain}
            title="Environment"
            isOpen={openSection === "environment"}
            onToggle={() => toggleSection("environment")}
          >
            <div className="grid grid-cols-2 gap-3">
              {ENVIRONMENT_SLOTS.map((slot) => {
                const selectedTemplate = selectedEnvironmentTemplates[slot.id];
                const isActive = activeEnvironmentSlot === slot.id;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleEnvironmentSlot(slot.id)}
                    className={[
                      "group relative aspect-square overflow-hidden rounded-xl border text-left transition",
                      selectedTemplate
                        ? "border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]"
                        : "border-[var(--canvas-theme-border)] bg-[#F9FAFB]",
                      isActive ? "ring-2 ring-[var(--canvas-theme-active)]/40" : "hover:border-[var(--canvas-theme-border-strong)]",
                    ].join(" ")}
                  >
                    {selectedTemplate ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedTemplate.imageSrc}
                          alt={selectedTemplate.label}
                          className="absolute inset-0 h-full w-full object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/80">{slot.label}</p>
                          <p className="mt-1 text-sm font-semibold text-white">{selectedTemplate.label}</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full flex-col justify-between p-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6B7280]">{slot.label}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </AccordionSection>

          <AccordionSection
            icon={BrickWall}
            title="Material"
            isOpen={openSection === "material"}
            onToggle={() => toggleSection("material")}
          >
            <LibraryFolderTabs
              folders={folders}
              activeFolderId={activeFolderId}
              onSelectFolder={onSelectFolder}
              onCreateFolder={requestCreateFolder}
              onRenameFolder={requestRenameFolder}
              onDeleteFolder={requestDeleteFolder}
            />
          </AccordionSection>

          <AccordionSection
            icon={Box}
            title="Object"
            isOpen={openSection === "object"}
            onToggle={() => toggleSection("object")}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--canvas-theme-text)]">
                    {activeFolder?.title ?? "Library"}
                  </p>
                  <p className="text-xs text-[var(--canvas-theme-text-muted)]">
                    Double-click an asset to place it on canvas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!activeFolder}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--canvas-theme-border)] bg-white px-3 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Add image
                </button>
              </div>

              <div className="flex h-11 items-center gap-3 rounded-2xl border border-[var(--canvas-theme-border)] bg-white px-3">
                <Search className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, prompt, category..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--canvas-theme-text)] outline-none placeholder:text-[var(--canvas-theme-text-muted)]"
                />
                <SlidersHorizontal className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All", count: sourceCounts.all },
                  { id: "ai-chat", label: "AI", count: sourceCounts["ai-chat"] },
                  { id: "upload", label: "Uploads", count: sourceCounts.upload },
                  { id: "manual", label: "Manual", count: sourceCounts.manual },
                ].map((filter) => {
                  const active = sourceFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setSourceFilter(filter.id as typeof sourceFilter)}
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-[var(--canvas-theme-active)] bg-[var(--canvas-theme-active)]/10 text-[var(--canvas-theme-text)]"
                          : "border-[var(--canvas-theme-border)] bg-white text-[var(--canvas-theme-text-muted)] hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]",
                      ].join(" ")}
                    >
                      <span>{filter.label}</span>
                      <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-black text-[var(--canvas-theme-text-muted)]">
                        {filter.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <LibraryAssetGrid
                assets={filteredAssets}
                selectedAssetId={selectedAssetId}
                onSelectAsset={onSelectAsset}
                onAddToCanvas={onAddAssetToCanvas}
                onDeleteAsset={requestDeleteAsset}
                onPreviewAsset={requestPreviewAsset}
              />
            </div>
          </AccordionSection>
        </div>
      </aside>

      {activeEnvironmentSlot && openSection === "environment" ? (
        <EnvironmentReferenceFlyout
          slotLabel={ENVIRONMENT_SLOTS.find((slot) => slot.id === activeEnvironmentSlot)?.label ?? "Environment"}
          activeTab={environmentTab}
          onTabChange={setEnvironmentTab}
          templates={activeEnvironmentTemplates}
          selectedTemplateId={selectedEnvironmentTemplates[activeEnvironmentSlot]?.id ?? null}
          onSelectTemplate={(template) => selectEnvironmentTemplate(activeEnvironmentSlot, template)}
          onClose={() => setActiveEnvironmentSlot(null)}
        />
      ) : null}
    </div>
  );
}

type AccordionSectionProps = {
  icon: LucideIcon;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function AccordionSection({
  icon: Icon,
  title,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className="border-b border-[var(--canvas-theme-border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Icon className="h-4 w-4 shrink-0 text-[var(--canvas-theme-icon)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--canvas-theme-text)]">{title}</p>
        </div>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-[var(--canvas-theme-icon-muted)] transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>
      {isOpen ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function EnvironmentReferenceFlyout({
  slotLabel,
  activeTab,
  onTabChange,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onClose,
}: {
  slotLabel: string;
  activeTab: EnvironmentTabId;
  onTabChange: (tab: EnvironmentTabId) => void;
  templates: EnvironmentTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (template: EnvironmentTemplate) => void;
  onClose: () => void;
}) {
  const tabs: Array<{ id: EnvironmentTabId; label: string }> = [
    { id: "presets", label: "Presets" },
    { id: "custom", label: "Custom" },
    { id: "pinterest", label: "Pinterest" },
  ];

  return (
    <aside className="absolute left-full top-0 bottom-61 z-[90] flex w-[304px] flex-col border-l border-r border-[var(--canvas-theme-border)] bg-[#F5F5F5] text-[var(--canvas-theme-text)] shadow-2xl shadow-black/10">
      <div className="flex items-center justify-between border-b border-[var(--canvas-theme-border)] px-4 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">{slotLabel}</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--canvas-theme-text)]">Reference templates</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[#F5F5F5] text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          title="Close flyout"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-5 border-b border-[var(--canvas-theme-border)] px-4 pt-3">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                "border-b-2 pb-3 text-sm transition",
                active
                  ? "border-[var(--canvas-theme-active)] font-semibold text-[var(--canvas-theme-text)]"
                  : "border-transparent text-[var(--canvas-theme-text-muted)] hover:text-[var(--canvas-theme-text)]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          {templates.map((template) => {
            const selected = template.id === selectedTemplateId;

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template)}
                className={[
                  "group relative overflow-hidden rounded-xl border text-left transition",
                  selected
                    ? "border-[var(--canvas-theme-active)] ring-2 ring-[var(--canvas-theme-active)]/30"
                    : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)]",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={template.imageSrc}
                  alt={template.label}
                  className="aspect-square w-full object-cover"
                  draggable={false}
                />
                {selected ? (
                  <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-white shadow">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
                  <span className="rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {template.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
