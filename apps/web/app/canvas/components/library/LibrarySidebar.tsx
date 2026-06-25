"use client";

import type { LucideIcon } from "lucide-react";
import {
  Box,
  BrickWall,
  Check,
  ChevronDown,
  Mountain,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryAsset, LibraryFolder } from "../../types/library";
import { type CanvasPresetChild, type PresetGroupCategory } from "../../types/canvas";
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
  onUpsertPresetGroup: (params: {
    category: PresetGroupCategory;
    title: string;
    children: CanvasPresetChild[];
    sourceFolderId?: string;
    replaceAllChildren?: boolean;
  }) => void;
  onUploadAssets: (folderId: string, files: FileList | File[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

type SectionId = "environment" | "material" | "object";
type EnvironmentSlotId = "season" | "lighting" | "atmosphere" | "environment";
type ReferenceTabId = "presets" | "custom" | "pinterest";
type ReferenceTemplate = {
  id: string;
  label: string;
  imageSrc: string;
};
type EnvironmentTemplate = ReferenceTemplate;
type MaterialSlotId =
  | "wooden-house-exterior"
  | "pathway-stones"
  | "rock-formations"
  | "water-surface"
  | "wooden-fence"
  | "wooden-gazebo"
  | "gazebo-roof"
  | "house-roof"
  | "carport-canopy"
  | "bridge"
  | "car"
  | "brick-wall";
type MaterialTemplate = ReferenceTemplate;

const ENVIRONMENT_SLOTS: Array<{ id: EnvironmentSlotId; label: string }> = [
  { id: "season", label: "Season" },
  { id: "lighting", label: "Lighting" },
  { id: "atmosphere", label: "Atmosphere" },
  { id: "environment", label: "Environment" },
];

const ENVIRONMENT_TEMPLATE_LIBRARY: Record<EnvironmentSlotId, EnvironmentTemplate[]> = {
  season: [
    { id: "season-early-spring", label: "Early Spring", imageSrc: "/assets/early-spring.webp" },
    { id: "season-full-bloom", label: "Full Bloom", imageSrc: "/assets/full-bloom.webp" },
    { id: "season-lush-summer", label: "Lush Summer", imageSrc: "/assets/lush-summer.webp" },
    { id: "season-dry-summer", label: "Dry Summer", imageSrc: "/assets/dry-summer.webp" },
    { id: "season-golden-autumn", label: "Golden Autumn", imageSrc: "/assets/golden-autumn.webp" },
    { id: "season-late-autumn", label: "Late autumn", imageSrc: "/assets/late-autumn.webp" },
    { id: "season-winter", label: "Winter", imageSrc: "/assets/winter.webp" },
  ],
  lighting: [
    { id: "lighting-sunrise", label: "Sunrise", imageSrc: "/assets/sunrise.webp" },
    { id: "lighting-sunset", label: "Sunset", imageSrc: "/assets/sunset.webp" },
    { id: "lighting-morning", label: "Morning", imageSrc: "/assets/morning.webp" },
    { id: "lighting-noon", label: "Noon", imageSrc: "/assets/noon.webp" },
    { id: "lighting-afternoon", label: "Afternoon", imageSrc: "/assets/afternoon.webp" },
    { id: "lighting-evening", label: "Evening", imageSrc: "/assets/evening.webp" },
    { id: "lighting-midnight", label: "Midnight", imageSrc: "/assets/midnight.webp" },
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

const MATERIAL_SLOTS: Array<{ id: MaterialSlotId; label: string }> = [
  { id: "wooden-house-exterior", label: "Wooden House Exterior" },
  { id: "pathway-stones", label: "Pathway Stones" },
  { id: "rock-formations", label: "Rock Formations" },
  { id: "water-surface", label: "Water Surface" },
  { id: "wooden-fence", label: "Wooden Fence" },
  { id: "wooden-gazebo", label: "Wooden Gazebo" },
  { id: "gazebo-roof", label: "Gazebo Roof" },
  { id: "house-roof", label: "House Roof" },
  { id: "carport-canopy", label: "Carport Canopy" },
  { id: "bridge", label: "Bridge" },
  { id: "car", label: "Car" },
  { id: "brick-wall", label: "Brick Wall" },
];

const MATERIAL_TEMPLATE_LIBRARY: Record<MaterialSlotId, MaterialTemplate[]> = {
  "wooden-house-exterior": [
    { id: "wooden-house-exterior-1", label: "Warm timber facade", imageSrc: "/assets/garden_3d_render.png" },
    { id: "wooden-house-exterior-2", label: "Vietnamese wood house", imageSrc: "/assets/urban_waterfall.png" },
    { id: "wooden-house-exterior-3", label: "Modern timber wall", imageSrc: "/assets/co_thach.png" },
    { id: "wooden-house-exterior-4", label: "Natural wood siding", imageSrc: "/assets/bonsai.png" },
  ],
  "pathway-stones": [
    { id: "pathway-stones-1", label: "Stepping stones", imageSrc: "/assets/co_thach.png" },
    { id: "pathway-stones-2", label: "Grey grid paving", imageSrc: "/assets/tai_meo.png" },
    { id: "pathway-stones-3", label: "Irregular pavers", imageSrc: "/assets/garden_3d_render.png" },
    { id: "pathway-stones-4", label: "Moss stone path", imageSrc: "/assets/urban_waterfall.png" },
  ],
  "rock-formations": [
    { id: "rock-formations-1", label: "Stone cluster", imageSrc: "/assets/tai_meo.png" },
    { id: "rock-formations-2", label: "Rugged boulders", imageSrc: "/assets/co_thach.png" },
    { id: "rock-formations-3", label: "Mossy rocks", imageSrc: "/assets/waterfall.png" },
    { id: "rock-formations-4", label: "Natural rockery", imageSrc: "/assets/bonsai.png" },
  ],
  "water-surface": [
    { id: "water-surface-1", label: "Calm pond", imageSrc: "/assets/waterfall.png" },
    { id: "water-surface-2", label: "Reflective water", imageSrc: "/assets/urban_waterfall.png" },
    { id: "water-surface-3", label: "Rippling surface", imageSrc: "/assets/garden_3d_render.png" },
    { id: "water-surface-4", label: "Blue water glaze", imageSrc: "/assets/tai_meo.png" },
  ],
  "wooden-fence": [
    { id: "wooden-fence-1", label: "Vertical slats", imageSrc: "/assets/garden_3d_render.png" },
    { id: "wooden-fence-2", label: "Dark timber fence", imageSrc: "/assets/co_thach.png" },
    { id: "wooden-fence-3", label: "Privacy fence", imageSrc: "/assets/urban_waterfall.png" },
    { id: "wooden-fence-4", label: "Garden boundary", imageSrc: "/assets/bonsai.png" },
  ],
  "wooden-gazebo": [
    { id: "wooden-gazebo-1", label: "Open timber gazebo", imageSrc: "/assets/garden_3d_render.png" },
    { id: "wooden-gazebo-2", label: "Hexagon pavilion", imageSrc: "/assets/bonsai.png" },
    { id: "wooden-gazebo-3", label: "Garden shelter", imageSrc: "/assets/urban_waterfall.png" },
    { id: "wooden-gazebo-4", label: "Stained wood pergola", imageSrc: "/assets/co_thach.png" },
  ],
  "gazebo-roof": [
    { id: "gazebo-roof-1", label: "Tiled roof", imageSrc: "/assets/urban_waterfall.png" },
    { id: "gazebo-roof-2", label: "Wood shingle roof", imageSrc: "/assets/garden_3d_render.png" },
    { id: "gazebo-roof-3", label: "Dark canopy roof", imageSrc: "/assets/co_thach.png" },
    { id: "gazebo-roof-4", label: "Curved eave", imageSrc: "/assets/waterfall.png" },
  ],
  "house-roof": [
    { id: "house-roof-1", label: "Pitched roof", imageSrc: "/assets/garden_3d_render.png" },
    { id: "house-roof-2", label: "Clay tile roof", imageSrc: "/assets/urban_waterfall.png" },
    { id: "house-roof-3", label: "Modern roofline", imageSrc: "/assets/co_thach.png" },
    { id: "house-roof-4", label: "Timber roof edge", imageSrc: "/assets/bonsai.png" },
  ],
  "carport-canopy": [
    { id: "carport-canopy-1", label: "Slim canopy", imageSrc: "/assets/garden_3d_render.png" },
    { id: "carport-canopy-2", label: "Steel frame", imageSrc: "/assets/co_thach.png" },
    { id: "carport-canopy-3", label: "Wood canopy", imageSrc: "/assets/bonsai.png" },
    { id: "carport-canopy-4", label: "Light shelter", imageSrc: "/assets/urban_waterfall.png" },
  ],
  bridge: [
    { id: "bridge-1", label: "Wood bridge", imageSrc: "/assets/waterfall.png" },
    { id: "bridge-2", label: "Stone bridge", imageSrc: "/assets/co_thach.png" },
    { id: "bridge-3", label: "Arched bridge", imageSrc: "/assets/garden_3d_render.png" },
    { id: "bridge-4", label: "Garden crossing", imageSrc: "/assets/tai_meo.png" },
  ],
  car: [
    { id: "car-1", label: "Visitor car", imageSrc: "/assets/urban_waterfall.png" },
    { id: "car-2", label: "Parking reference", imageSrc: "/assets/garden_3d_render.png" },
    { id: "car-3", label: "Driveway marker", imageSrc: "/assets/co_thach.png" },
    { id: "car-4", label: "Scale reference", imageSrc: "/assets/bonsai.png" },
  ],
  "brick-wall": [
    { id: "brick-wall-1", label: "Warm brick wall", imageSrc: "/assets/co_thach.png" },
    { id: "brick-wall-2", label: "Boundary wall", imageSrc: "/assets/garden_3d_render.png" },
    { id: "brick-wall-3", label: "Textured masonry", imageSrc: "/assets/urban_waterfall.png" },
    { id: "brick-wall-4", label: "Rustic brick", imageSrc: "/assets/tai_meo.png" },
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
  onUpsertPresetGroup,
  onUploadAssets,
  onClose,
  onToast,
}: LibrarySidebarProps) {
  const [openSection, setOpenSection] = useState<SectionId | null>("object");
  const [activeEnvironmentSlot, setActiveEnvironmentSlot] = useState<EnvironmentSlotId | null>(null);
  const [environmentTab, setEnvironmentTab] = useState<ReferenceTabId>("presets");
  const [selectedEnvironmentTemplates, setSelectedEnvironmentTemplates] = useState<
    Partial<Record<EnvironmentSlotId, EnvironmentTemplate>>
  >({});
  const [activeMaterialSlot, setActiveMaterialSlot] = useState<MaterialSlotId | null>(null);
  const [materialTab, setMaterialTab] = useState<ReferenceTabId>("presets");
  const [selectedMaterialTemplates, setSelectedMaterialTemplates] = useState<
    Partial<Record<MaterialSlotId, MaterialTemplate>>
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
  const activeMaterialTemplates = activeMaterialSlot ? MATERIAL_TEMPLATE_LIBRARY[activeMaterialSlot] : [];

  const buildPresetChild = (slot: string, template: ReferenceTemplate): CanvasPresetChild => ({
    id: template.id,
    slot,
    label: template.label,
    imageSrc: template.imageSrc,
    prompt: null,
    order: 0,
    sourceImage: {
      url: template.imageSrc,
      width: null,
      height: null,
      name: template.label,
      quality: "original",
    },
    metadata: {
      roleHint: "style_reference",
    },
  });

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
    if (section !== "material") {
      setActiveMaterialSlot(null);
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
    onUpsertPresetGroup({
      category: "environment",
      title: "Environment",
      children: [buildPresetChild(slotLabel, template)],
    });
    onToast(`${slotLabel}: ${template.label}`);
  };

  const clearEnvironmentTemplate = (slotId: EnvironmentSlotId) => {
    setSelectedEnvironmentTemplates((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  };

  const toggleMaterialSlot = (slotId: MaterialSlotId) => {
    setOpenSection("material");
    setActiveMaterialSlot((current) => (current === slotId ? null : slotId));
  };

  const selectMaterialTemplate = (slotId: MaterialSlotId, template: MaterialTemplate) => {
    setSelectedMaterialTemplates((current) => ({
      ...current,
      [slotId]: template,
    }));
    const slotLabel = MATERIAL_SLOTS.find((slot) => slot.id === slotId)?.label ?? "Material";
    onUpsertPresetGroup({
      category: "material",
      title: "Material",
      children: [buildPresetChild(slotLabel, template)],
    });
    onToast(`${slotLabel}: ${template.label}`);
  };

  const attachActiveFolderAsPresetGroup = () => {
    if (!activeFolder) return;

    const children = activeFolder.assets.map((asset, index) => ({
      id: asset.id,
      slot: activeFolder.title,
      label: asset.title ?? `Preset ${index + 1}`,
      imageSrc: asset.thumbnailSrc ?? asset.src,
      prompt: asset.prompt ?? null,
      order: index,
      assetId: asset.id,
      sourceFolderId: activeFolder.id,
      sourceImage: {
        url: asset.src,
        width: asset.metadata?.originalWidth ?? null,
        height: asset.metadata?.originalHeight ?? null,
        name: asset.title,
        quality: "original" as const,
      },
      metadata: {
        roleHint: "generic_reference" as const,
      },
    }));

    onUpsertPresetGroup({
      category: "object",
      title: activeFolder.title,
      sourceFolderId: activeFolder.id,
      children,
      replaceAllChildren: true,
    });
    onToast(`Added ${activeFolder.title} preset folder to canvas`);
  };

  const clearMaterialTemplate = (slotId: MaterialSlotId) => {
    setSelectedMaterialTemplates((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
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
                      isActive ? "ring-2 ring-[var(--canvas-theme-active)]/40" : "hover:border-[var(--canvas-theme-border-strong)] hover:bg-[#ECEFF3]",
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
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                          <p className="block text-[clamp(10px,0.9vw,12px)] font-semibold tracking-[0.01em] text-white/80">
                            {slot.label}
                          </p>
                          <p className="mt-0.5 text-[clamp(12px,1.05vw,16px)] font-semibold leading-tight text-white">
                            {selectedTemplate.label}
                          </p>
                        </div>
                        {/* Cancel button */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); clearEnvironmentTemplate(slot.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearEnvironmentTemplate(slot.id); } }}
                          className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80"
                          title="Remove preset"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
                        <p className="block text-[clamp(10px,1vw,17px)] font-semibold tracking-[0.01em] text-[#6B7280]">
                          {slot.label}
                        </p>
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
            <div className="grid grid-cols-4 gap-2">
              {MATERIAL_SLOTS.map((slot) => {
                const selectedTemplate = selectedMaterialTemplates[slot.id];
                const isActive = activeMaterialSlot === slot.id;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleMaterialSlot(slot.id)}
                    className={[
                      "group relative aspect-square overflow-hidden rounded-xl border text-left transition",
                      selectedTemplate
                        ? "border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]"
                        : "border-[var(--canvas-theme-border)] bg-[#F9FAFB]",
                      isActive ? "ring-2 ring-[var(--canvas-theme-active)]/40" : "hover:border-[var(--canvas-theme-border-strong)] hover:bg-[#ECEFF3]",
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
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-2.5 text-center">
                          <p className="block text-[clamp(9px,0.82vw,11px)] font-semibold tracking-[0.01em] text-white/80">
                            {slot.label}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[clamp(10px,0.9vw,13px)] font-medium leading-tight text-white">
                            {selectedTemplate.label}
                          </p>
                        </div>
                        {/* Cancel button */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); clearMaterialTemplate(slot.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearMaterialTemplate(slot.id); } }}
                          className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80"
                          title="Remove preset"
                        >
                          <X className="h-2.5 w-2.5" aria-hidden="true" />
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center px-2.5 text-center">
                        <p className="block text-[clamp(9px,0.82vw,11px)] font-semibold tracking-[0.01em] text-[#6B7280]">
                          {slot.label}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </AccordionSection>

          <AccordionSection
            icon={Box}
            title="Object"
            isOpen={openSection === "object"}
            onToggle={() => toggleSection("object")}
          >
            <div className="space-y-4">
              <LibraryFolderTabs
                folders={folders}
                activeFolderId={activeFolderId}
                onSelectFolder={onSelectFolder}
                onCreateFolder={requestCreateFolder}
                onRenameFolder={requestRenameFolder}
                onDeleteFolder={requestDeleteFolder}
              />

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
                <button
                  type="button"
                  onClick={attachActiveFolderAsPresetGroup}
                  disabled={!activeFolder || activeFolder.assets.length === 0}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)] px-3 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  Add folder node
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
        <ReferenceFlyout
          slotLabel={ENVIRONMENT_SLOTS.find((slot) => slot.id === activeEnvironmentSlot)?.label ?? "Environment"}
          activeTab={environmentTab}
          onTabChange={setEnvironmentTab}
          templates={activeEnvironmentTemplates}
          selectedTemplateId={selectedEnvironmentTemplates[activeEnvironmentSlot]?.id ?? null}
          onSelectTemplate={(template) => selectEnvironmentTemplate(activeEnvironmentSlot, template)}
          onClose={() => setActiveEnvironmentSlot(null)}
        />
      ) : null}

      {activeMaterialSlot && openSection === "material" ? (
        <ReferenceFlyout
          slotLabel={MATERIAL_SLOTS.find((slot) => slot.id === activeMaterialSlot)?.label ?? "Material"}
          activeTab={materialTab}
          onTabChange={setMaterialTab}
          templates={activeMaterialTemplates}
          selectedTemplateId={selectedMaterialTemplates[activeMaterialSlot]?.id ?? null}
          onSelectTemplate={(template) => selectMaterialTemplate(activeMaterialSlot, template)}
          onClose={() => setActiveMaterialSlot(null)}
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
      {isOpen ? <div className="px-4 pb-5 pt-3">{children}</div> : null}
    </section>
  );
}

function ReferenceFlyout({
  slotLabel,
  activeTab,
  onTabChange,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onClose,
}: {
  slotLabel: string;
  activeTab: ReferenceTabId;
  onTabChange: (tab: ReferenceTabId) => void;
  templates: ReferenceTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (template: ReferenceTemplate) => void;
  onClose: () => void;
}) {
  const tabs: Array<{ id: ReferenceTabId; label: string }> = [
    { id: "presets", label: "Presets" },
    { id: "custom", label: "Custom" },
    { id: "pinterest", label: "Pinterest" },
  ];
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  const revealScrollbar = () => {
    setIsScrollbarVisible(true);

    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
    }

    scrollbarTimeoutRef.current = setTimeout(() => {
      setIsScrollbarVisible(false);
    }, 700);
  };

  return (
    <aside className="absolute left-full top-0 z-[90] flex h-[calc(36rem-3px)] w-[304px] min-h-0 flex-col overflow-hidden border-l border-[var(--canvas-theme-border)] bg-[#F5F5F5] text-[var(--canvas-theme-text)]">
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

      <div
        onScroll={revealScrollbar}
        className={[
          "flyout-scroll-area h-[calc(27rem)] flex-none overflow-y-auto p-3",
          isScrollbarVisible ? "is-scrolling" : "",
        ].join(" ")}
      >
        <div className="grid grid-cols-2 gap-3">
          {templates.map((template) => {
            const selected = template.id === selectedTemplateId;

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template)}
                className={[
                  "group relative overflow-hidden rounded-lg border text-left transition-all duration-300",
                  selected
                    ? "border-[var(--canvas-theme-active)] ring-2 ring-[var(--canvas-theme-active)]/30"
                    : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)] hover:shadow-lg",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={template.imageSrc}
                  alt={template.label}
                  className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  draggable={false}
                />

                {/* Gradient overlay — fades in on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Selected checkmark */}
                {selected ? (
                  <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-white shadow">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                ) : null}

                {/* Default pill label — slides down & fades out on hover */}
                <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2 transition-all duration-200 group-hover:translate-y-1 group-hover:opacity-0">
                  <span className="rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {template.label}
                  </span>
                </div>

                {/* Hover reveal label — slides up from bottom */}
                <div className="absolute inset-x-0 bottom-0 translate-y-2 px-2.5 pb-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/60">Apply</p>
                  <p className="text-[13px] font-semibold leading-tight text-white">{template.label}</p>
                </div>
              </button>
            );

          })}
        </div>
      </div>
    </aside>
  );
}
