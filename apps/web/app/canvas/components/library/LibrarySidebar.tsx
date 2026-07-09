"use client";

import type { LucideIcon } from "lucide-react";
import {
  Box,
  BrickWall,
  Check,
  ChevronDown,
  Mountain,
  Flower2,
  Droplets,
  TentTree,
  LandPlot,
  Palette,
  Lightbulb,
  Shrub,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCanvasText, translateCanvasLabel, type CanvasLanguage } from "../../i18n";
import type { LibraryAsset, LibraryFolder } from "../../types/library";
import { type CanvasPresetChild, type PresetGroupCategory } from "../../types/canvas";

type LibrarySidebarProps = {
  language: CanvasLanguage;
  folders: LibraryFolder[];
  activeFolderId: string;
  selectedAssetId: string | null;
  onSelectFolder: (folderId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onCreateFolder: (title: string, createdBy?: "ai" | "user") => LibraryFolder | null | Promise<LibraryFolder | null>;
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

type ReferenceTabId = "presets" | "custom";
type ReferenceTemplate = {
  id: string;
  assetId: string;
  label: string;
  previewSrc: string;
  originalSrc: string;
};

function TemplatePreviewImage({
  previewSrc,
  originalSrc,
  label,
}: {
  previewSrc: string;
  originalSrc: string;
  label: string;
}) {
  const [src, setSrc] = useState(previewSrc);

  useEffect(() => {
    setSrc(previewSrc);
  }, [previewSrc]);

  return (
    <img
      src={src}
      alt={label}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => {
        if (src !== originalSrc) {
          setSrc(originalSrc);
        }
      }}
    />
  );
}

type SlotConfig = { id: string; label: string };
type GroupConfig = { label: string; slots: SlotConfig[] };
type SectionConfig = {
  id: PresetGroupCategory;
  label: string;
  icon: LucideIcon;
  slots?: SlotConfig[];
  groups?: GroupConfig[];
};

const PRESET_STRUCTURE: SectionConfig[] = [
  {
    id: "environment",
    label: "Environment",
    icon: Mountain,
    slots: [
      { id: "season", label: "Season" },
      { id: "lighting", label: "Lighting" },
      { id: "atmosphere", label: "Atmosphere" },
      { id: "environment", label: "Environment" },
    ],
  },
  {
    id: "material",
    label: "Material",
    icon: BrickWall,
    slots: [
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
    ],
  },
  {
    id: "garden-styles",
    label: "Garden Styles",
    icon: Box,
    slots: [
      { id: "japanese-garden", label: "Japanese Garden" },
      { id: "chinese-garden", label: "Chinese Garden" },
      { id: "korean-garden", label: "Korean Garden" },
      { id: "zen-garden", label: "Zen Garden" },
      { id: "tropical-garden", label: "Tropical Garden" },
      { id: "balinese-garden", label: "Balinese Garden" },
      { id: "thai-garden", label: "Thai Garden" },
      { id: "mediterranean-garden", label: "Mediterranean Garden" },
      { id: "english-cottage-garden", label: "English Cottage Garden" },
      { id: "french-formal-garden", label: "French Formal Garden" },
      { id: "italian-renaissance-garden", label: "Italian Renaissance Garden" },
      { id: "islamic-persian-garden", label: "Islamic / Persian Garden" },
      { id: "modern-minimal-garden", label: "Modern Minimal Garden" },
      { id: "scandinavian-garden", label: "Scandinavian Garden" },
      { id: "desert-garden", label: "Desert Garden" },
      { id: "woodland-garden", label: "Woodland Garden" },
      { id: "rainforest-garden", label: "Rainforest Garden" },
      { id: "alpine-garden", label: "Alpine Garden" },
      { id: "prairie-meadow-garden", label: "Prairie / Meadow Garden" },
      { id: "coastal-garden", label: "Coastal Garden" },
    ],
  },
  {
    id: "plants",
    label: "Plants",
    icon: Flower2,
    groups: [
      {
        label: "Trees",
        slots: [
          { id: "ornamental-trees", label: "Ornamental Trees" },
          { id: "flowering-trees", label: "Flowering Trees" },
          { id: "shade-trees", label: "Shade Trees" },
          { id: "evergreen-trees", label: "Evergreen Trees" },
          { id: "deciduous-trees", label: "Deciduous Trees" },
          { id: "tropical-trees", label: "Tropical Trees" },
          { id: "conifer-trees", label: "Conifer Trees" },
          { id: "fruit-trees", label: "Fruit Trees" },
        ],
      },
      {
        label: "Shrubs",
        slots: [
          { id: "flowering-shrubs", label: "Flowering Shrubs" },
          { id: "evergreen-shrubs", label: "Evergreen Shrubs" },
          { id: "hedge-shrubs", label: "Hedge Shrubs" },
          { id: "ornamental-shrubs", label: "Ornamental Shrubs" },
        ],
      },
      {
        label: "Flowers",
        slots: [
          { id: "annual-flowers", label: "Annual Flowers" },
          { id: "perennial-flowers", label: "Perennial Flowers" },
          { id: "bulb-flowers", label: "Bulb Flowers" },
          { id: "wildflowers", label: "Wildflowers" },
          { id: "border-flowers", label: "Border Flowers" },
        ],
      },
      {
        label: "Grasses",
        slots: [
          { id: "ornamental-grasses", label: "Ornamental Grasses" },
          { id: "tall-grasses", label: "Tall Grasses" },
          { id: "ground-grasses", label: "Ground Grasses" },
          { id: "meadow-grasses", label: "Meadow Grasses" },
        ],
      },
      {
        label: "Other Plants",
        slots: [
          { id: "bamboo", label: "Bamboo" },
          { id: "palm-tropical-plants", label: "Palm & Tropical Plants" },
          { id: "cactus-succulents", label: "Cactus & Succulents" },
          { id: "ferns", label: "Ferns" },
          { id: "vines-climbers", label: "Vines & Climbers" },
          { id: "aquatic-plants", label: "Aquatic Plants" },
          { id: "ground-covers", label: "Ground Covers" },
          { id: "topiary", label: "Topiary" },
          { id: "bonsai", label: "Bonsai" },
          { id: "seasonal-plants", label: "Seasonal Plants" },
        ],
      },
    ],
  },
  {
    id: "water-features",
    label: "Water Features",
    icon: Droplets,
    slots: [
      { id: "koi-ponds", label: "Koi Ponds" },
      { id: "natural-ponds", label: "Natural Ponds" },
      { id: "waterfalls", label: "Waterfalls" },
      { id: "streams", label: "Streams" },
      { id: "fountains", label: "Fountains" },
      { id: "reflecting-pools", label: "Reflecting Pools" },
      { id: "bird-baths", label: "Bird Baths" },
      { id: "water-bowls", label: "Water Bowls" },
      { id: "rain-chains", label: "Rain Chains" },
    ],
  },
  {
    id: "hardscape",
    label: "Hardscape",
    icon: TentTree,
    slots: [
      { id: "paths-walkways", label: "Paths & Walkways" },
      { id: "bridges", label: "Bridges" },
      { id: "pavilions", label: "Pavilions" },
      { id: "pergolas", label: "Pergolas" },
      { id: "gazebos", label: "Gazebos" },
      { id: "garden-walls", label: "Garden Walls" },
      { id: "fences", label: "Fences" },
      { id: "gates", label: "Gates" },
      { id: "stairs", label: "Stairs" },
      { id: "decks", label: "Decks" },
      { id: "patios", label: "Patios" },
      { id: "retaining-walls", label: "Retaining Walls" },
    ],
  },
  {
    id: "rocks-terrain",
    label: "Rocks & Terrain",
    icon: LandPlot,
    slots: [
      { id: "garden-stones", label: "Garden Stones" },
      { id: "zen-stones", label: "Zen Stones" },
      { id: "boulders", label: "Boulders" },
      { id: "gravel", label: "Gravel" },
      { id: "pebbles", label: "Pebbles" },
      { id: "moss-rocks", label: "Moss Rocks" },
      { id: "rock-gardens", label: "Rock Gardens" },
      { id: "sand-areas", label: "Sand Areas" },
      { id: "hills-mounds", label: "Hills / Mounds" },
      { id: "soil-beds", label: "Soil Beds" },
    ],
  },
  {
    id: "decor",
    label: "Decor",
    icon: Palette,
    slots: [
      { id: "lanterns", label: "Lanterns" },
      { id: "statues", label: "Statues" },
      { id: "pots-planters", label: "Pots & Planters" },
      { id: "benches", label: "Benches" },
      { id: "outdoor-tables", label: "Outdoor Tables" },
      { id: "sculptures", label: "Sculptures" },
      { id: "bird-houses", label: "Bird Houses" },
      { id: "wind-chimes", label: "Wind Chimes" },
      { id: "fire-pits", label: "Fire Pits" },
      { id: "garden-ornaments", label: "Garden Ornaments" },
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    icon: Lightbulb,
    slots: [
      { id: "path-lights", label: "Path Lights" },
      { id: "spot-lights", label: "Spot Lights" },
      { id: "lantern-lights", label: "Lantern Lights" },
      { id: "wall-lights", label: "Wall Lights" },
      { id: "string-lights", label: "String Lights" },
      { id: "underwater-lights", label: "Underwater Lights" },
      { id: "solar-lights", label: "Solar Lights" },
    ],
  },
  {
    id: "planting-zones",
    label: "Planting Zones",
    icon: Shrub,
    slots: [
      { id: "flower-beds", label: "Flower Beds" },
      { id: "shrub-borders", label: "Shrub Borders" },
      { id: "tree-clusters", label: "Tree Clusters" },
      { id: "tropical-corners", label: "Tropical Corners" },
      { id: "rock-planting", label: "Rock Planting" },
      { id: "pond-planting", label: "Pond Planting" },
      { id: "entrance-planting", label: "Entrance Planting" },
      { id: "fence-planting", label: "Fence Planting" },
      { id: "courtyard-planting", label: "Courtyard Planting" },
    ],
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTemplatesForSlot(slotId: string, label: string, folders: LibraryFolder[]): ReferenceTemplate[] {
  const targetTerms = normalizeText(`${slotId} ${label}`).split(" ").filter(Boolean);
  const cloudAssets = folders.flatMap((folder) =>
    folder.assets.map((asset) => ({
      asset,
      folder,
    })),
  );

  const matchedAssets = cloudAssets.filter(({ asset, folder }) => {
    const haystack = normalizeText(
      [
        asset.title ?? "",
        asset.prompt ?? "",
        asset.category ?? "",
        asset.tags?.join(" ") ?? "",
        asset.metadata?.categoryHint ?? "",
        folder.title ?? "",
        folder.slug ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    );

    return targetTerms.some((term) => haystack.includes(term));
  });

  const sourceAssets = matchedAssets.length > 0 ? matchedAssets : cloudAssets;

  return sourceAssets.slice(0, 12).map(({ asset }) => ({
    id: asset.id,
    assetId: asset.id,
    label: asset.title ?? "Library image",
    previewSrc: asset.previewSrc ?? asset.thumbnailSrc ?? asset.src,
    originalSrc: asset.originalSrc ?? asset.src,
  }));
}

export default function LibrarySidebar({
  language,
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
  const text = getCanvasText(language);
  const shellRef = useRef<HTMLDivElement>(null);
  const [openSection, setOpenSection] = useState<PresetGroupCategory | null>("garden-styles");
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [referenceTab, setReferenceTab] = useState<ReferenceTabId>("presets");
  const [flyoutBounds, setFlyoutBounds] = useState<{ top: number; left: number; height: number } | null>(null);

  // Storing templates selected for each section category
  const [selectedTemplates, setSelectedTemplates] = useState<
    Record<PresetGroupCategory, Record<string, ReferenceTemplate[]>>
  >({
    "environment": {},
    "material": {},
    "garden-styles": {},
    "plants": {},
    "water-features": {},
    "hardscape": {},
    "rocks-terrain": {},
    "decor": {},
    "lighting": {},
    "planting-zones": {},
  });

  const buildPresetChild = (slotLabel: string, template: ReferenceTemplate): CanvasPresetChild => ({
    id: template.id,
    slot: slotLabel,
    label: template.label,
    imageSrc: template.originalSrc,
    prompt: null,
    order: 0,
    assetId: template.assetId,
    sourceImage: {
      assetId: template.assetId,
      url: template.originalSrc,
      width: null,
      height: null,
      name: template.label,
      quality: "original",
    },
    metadata: {
      roleHint: "style_reference",
    },
  });

  const syncSectionGroup = (category: PresetGroupCategory, sectionSelections: Record<string, ReferenceTemplate[]>) => {
    const sectionConfig = PRESET_STRUCTURE.find((s) => s.id === category);
    if (!sectionConfig) return;

    const children: CanvasPresetChild[] = [];

    const allSlots = sectionConfig.slots ? [...sectionConfig.slots] : [];
    if (sectionConfig.groups) {
      for (const group of sectionConfig.groups) {
        allSlots.push(...group.slots);
      }
    }

    for (const slot of allSlots) {
      const templates = sectionSelections[slot.id] ?? [];
      for (const template of templates) {
        children.push(buildPresetChild(slot.label, template));
      }
    }

    onUpsertPresetGroup({
      category,
      title: sectionConfig.label,
      children,
      replaceAllChildren: true,
    });

    if (children.length > 0) {
      onToast(`${sectionConfig.label}: ${children.length} preset${children.length === 1 ? "" : "s"}`);
    } else {
      onToast(`${sectionConfig.label} cleared`);
    }
  };

  const toggleSection = (sectionId: PresetGroupCategory) => {
    if (openSection !== sectionId) {
      setOpenSection(sectionId);
      setActiveSlotId(null);
    } else {
      setOpenSection(null);
      setActiveSlotId(null);
    }
  };

  const toggleSlot = (slotId: string) => {
    setActiveSlotId((current) => (current === slotId ? null : slotId));
  };

  const selectTemplate = (categoryId: PresetGroupCategory, slotId: string, template: ReferenceTemplate) => {
    const sectionSelections = selectedTemplates[categoryId] ?? {};
    const currentSlotTemplates = sectionSelections[slotId] ?? [];

    const exists = currentSlotTemplates.some((item) => item.id === template.id);
    const nextSlotTemplates = exists
      ? currentSlotTemplates.filter((item) => item.id !== template.id)
      : [...currentSlotTemplates, template];

    const nextSectionSelections = {
      ...sectionSelections,
      [slotId]: nextSlotTemplates,
    };

    setSelectedTemplates((current) => ({
      ...current,
      [categoryId]: nextSectionSelections,
    }));

    syncSectionGroup(categoryId, nextSectionSelections);
  };

  const clearTemplate = (categoryId: PresetGroupCategory, slotId: string) => {
    const sectionSelections = selectedTemplates[categoryId] ?? {};
    const nextSectionSelections = { ...sectionSelections };
    delete nextSectionSelections[slotId];

    setSelectedTemplates((current) => ({
      ...current,
      [categoryId]: nextSectionSelections,
    }));

    syncSectionGroup(categoryId, nextSectionSelections);
  };

  useLayoutEffect(() => {
    if (!openSection || !activeSlotId) {
      return;
    }

    const updateFlyoutBounds = () => {
      const element = shellRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      setFlyoutBounds({
        top: rect.top,
        left: rect.right + 6,
        height: rect.height,
      });
    };

    updateFlyoutBounds();

    const element = shellRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && element ? new ResizeObserver(updateFlyoutBounds) : null;

    if (resizeObserver && element) {
      resizeObserver.observe(element);
    }

    window.addEventListener("resize", updateFlyoutBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateFlyoutBounds);
    };
  }, [activeSlotId, openSection]);

  const activeSectionConfig = PRESET_STRUCTURE.find((s) => s.id === openSection);
  let activeSlotLabel = "Slot";
  if (activeSectionConfig && activeSlotId) {
    const allSlots = activeSectionConfig.slots ? [...activeSectionConfig.slots] : [];
    if (activeSectionConfig.groups) {
      activeSectionConfig.groups.forEach((g) => allSlots.push(...g.slots));
    }
    const found = allSlots.find((s) => s.id === activeSlotId);
    if (found) activeSlotLabel = found.label;
  }

  const renderSlotGrid = (slots: SlotConfig[], categoryId: PresetGroupCategory) => {
    return (
      <div className={categoryId === "environment" ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
        {slots.map((slot) => {
          const selectedForSlot = (selectedTemplates[categoryId] ?? {})[slot.id] ?? [];
          const selectedTemplate = selectedForSlot[0] ?? null;
          const isActive = activeSlotId === slot.id;

          return (
            <button
              key={slot.id}
              type="button"
              data-flyout-trigger="true"
              onClick={() => toggleSlot(slot.id)}
              className={[
                "group relative aspect-square overflow-hidden rounded-[18px] border text-left shadow-[0_12px_24px_rgba(15,23,42,0.045)] transition duration-150",
                selectedTemplate
                  ? "border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/92 shadow-[0_16px_28px_rgba(15,23,42,0.08)]"
                  : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]/92",
                isActive ? "ring-2 ring-[var(--canvas-theme-active)]/16" : "hover:-translate-y-0.5 hover:border-[var(--canvas-theme-border-strong)] hover:bg-[var(--canvas-theme-surface-panel)] hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]",
              ].join(" ")}
            >
              <div className="absolute inset-0 flex items-center justify-center px-2.5 text-center">
                <p className="block text-[clamp(9px,0.82vw,11px)] font-semibold tracking-[0.01em] text-[var(--canvas-theme-text-soft)]">
                  {translateCanvasLabel(slot.label, language)}
                </p>
                {selectedForSlot.length > 0 ? (
                  <span className="absolute right-1 top-1 rounded-full bg-[var(--canvas-theme-active)] px-1.5 py-0.5 text-[10px] font-black text-[var(--canvas-theme-active-text)]">
                    {selectedForSlot.length}
                  </span>
                ) : null}
              </div>
              {selectedTemplate ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); clearTemplate(categoryId, slot.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearTemplate(categoryId, slot.id); } }}
                  className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 hover:bg-black/80"
                  title={text.common.removePreset}
                >
                  <X className="h-2.5 w-2.5" aria-hidden="true" />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={shellRef} className="relative z-[60] flex h-full w-full shrink-0 overflow-visible bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <aside className="relative z-[60] flex h-full w-full shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-[6px_0_28px_rgba(15,23,42,0.04)]">
        <div className="border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex h-6 items-center font-sans text-[15px] font-semibold leading-none tracking-[-0.03em] text-[var(--canvas-theme-text)] translate-y-[1px]">
                {text.common.library}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
                title={text.common.closeLibrary}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas-theme-surface-panel)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {PRESET_STRUCTURE.map((section) => (
            <AccordionSection
              key={section.id}
              icon={section.icon}
              title={translateCanvasLabel(section.label, language)}
              isOpen={openSection === section.id}
              onToggle={() => toggleSection(section.id)}
            >
              {section.slots && renderSlotGrid(section.slots, section.id)}

              {section.groups && section.groups.map((group, idx) => (
                <div key={idx} className={idx > 0 ? "mt-4" : ""}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--canvas-theme-text-muted)]">{translateCanvasLabel(group.label, language)}</p>
                  {renderSlotGrid(group.slots, section.id)}
                </div>
              ))}
            </AccordionSection>
          ))}
        </div>
      </aside>

      {openSection && activeSlotId && flyoutBounds && typeof document !== "undefined"
        ? createPortal(
          <ReferenceFlyout
            slotLabel={activeSlotLabel}
            language={language}
            activeTab={referenceTab}
            onTabChange={setReferenceTab}
            templates={getTemplatesForSlot(activeSlotId, activeSlotLabel, folders)}
            selectedTemplateIds={(selectedTemplates[openSection]?.[activeSlotId] ?? []).map((t) => t.id)}
            onSelectTemplate={(template) => selectTemplate(openSection, activeSlotId, template)}
            onUploadAssets={onUploadAssets}
            uploadFolderId={activeFolderId}
            onClose={() => setActiveSlotId(null)}
            top={flyoutBounds.top}
            left={flyoutBounds.left}
            height={flyoutBounds.height}
          />,
          shellRef.current ?? document.body,
        )
        : null}
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
    <section className="border-b border-[var(--canvas-theme-border)]/90">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-3.5 text-left transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Icon className="h-4 w-4 shrink-0 text-[var(--canvas-theme-icon)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--canvas-theme-text)]">{title}</p>
        </div>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-[var(--canvas-theme-icon-muted)] transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>
      {isOpen ? <div className="px-3 pb-6 pt-4">{children}</div> : null}
    </section>
  );
}

function ReferenceFlyout({
  slotLabel,
  language,
  activeTab,
  onTabChange,
  templates,
  selectedTemplateIds,
  onSelectTemplate,
  onUploadAssets,
  uploadFolderId,
  onClose,
  top,
  left,
  height,
}: {
  slotLabel: string;
  language: CanvasLanguage;
  activeTab: ReferenceTabId;
  onTabChange: (tab: ReferenceTabId) => void;
  templates: ReferenceTemplate[];
  selectedTemplateIds: string[];
  onSelectTemplate: (template: ReferenceTemplate) => void;
  onUploadAssets: (folderId: string, files: FileList | File[]) => void;
  uploadFolderId: string;
  onClose: () => void;
  top: number;
  left: number;
  height: number;
}) {
  const flyoutRef = useRef<HTMLElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const text = getCanvasText(language);
  const tabs: Array<{ id: ReferenceTabId; label: string }> = [
    { id: "presets", label: text.flyout.presets },
    { id: "custom", label: text.flyout.custom },
  ];
  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!flyoutRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-flyout-trigger="true"]')) return;
      if (!flyoutRef.current.contains(target)) {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrollbarVisible(true);
    if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
    scrollbarTimeoutRef.current = setTimeout(() => setIsScrollbarVisible(false), 800);
  };

  const openUploadPicker = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0 || !uploadFolderId) return;

    onUploadAssets(uploadFolderId, files);
    event.currentTarget.value = "";
  };

  return (
    <section
      ref={flyoutRef}
      className="fixed z-[500] flex w-[320px] flex-col overflow-hidden rounded-r-[24px] border border-l-0 border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)] shadow-[0_34px_80px_var(--canvas-theme-shadow)] transition-transform"
      style={{
        top,
        left,
        height,
        boxShadow: "20px 0 25px -5px rgb(0 0 0 / 0.1), 8px 0 10px -6px rgb(0 0 0 / 0.1)",
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--canvas-theme-text)]">{translateCanvasLabel(slotLabel, language)}</h3>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 pt-3">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                "relative pb-2 text-xs font-medium transition",
                activeTab === tab.id
                  ? "text-[var(--canvas-theme-text)]"
                  : "text-[var(--canvas-theme-text-muted)] hover:text-[var(--canvas-theme-text)]",
              ].join(" ")}
            >
              {tab.label}
              {activeTab === tab.id ? (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-[var(--canvas-theme-text)]" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div
        className={[
          "min-h-0 flex-1 overflow-y-auto bg-[var(--canvas-theme-surface-panel)] p-4 transition-colors duration-300",
          isScrollbarVisible ? "[&::-webkit-scrollbar-thumb]:bg-[var(--canvas-theme-border-strong)]" : "[&::-webkit-scrollbar-thumb]:bg-transparent",
        ].join(" ")}
        onScroll={handleScroll}
      >
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUploadChange}
        />
        {activeTab === "presets" ? (
          templates.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((template) => {
                const isSelected = selectedTemplateIds.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onSelectTemplate(template)}
                    className={[
                      "group relative aspect-square overflow-hidden rounded-xl border text-left transition",
                      isSelected
                        ? "border-[var(--canvas-theme-active)] ring-2 ring-[var(--canvas-theme-active)]/40"
                        : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)]",
                    ].join(" ")}
                  >
                    <TemplatePreviewImage
                      previewSrc={template.previewSrc}
                      originalSrc={template.originalSrc}
                      label={template.label}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-[var(--canvas-theme-surface-panel)]/88 px-2 py-1.5">
                      <p className="text-[10px] font-medium leading-none text-[var(--canvas-theme-text)]">{template.label}</p>
                    </div>
                    {isSelected ? (
                      <div className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] shadow-sm">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
              <Box className="mb-3 h-8 w-8 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--canvas-theme-text)]">No cloud presets yet</p>
              <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-[var(--canvas-theme-text-muted)]">
                Upload images into a library folder first, then use them as preset references here.
              </p>
            </div>
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Box className="mb-3 h-8 w-8 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--canvas-theme-text)]">
              {text.flyout.customAssets}
            </p>
            <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-[var(--canvas-theme-text-muted)]">
              {text.flyout.customDescription}
            </p>
            <button
              type="button"
              onClick={openUploadPicker}
              disabled={!uploadFolderId}
              className="mt-4 rounded-lg bg-[var(--canvas-theme-surface-muted)] px-4 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text.flyout.uploadImage}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
