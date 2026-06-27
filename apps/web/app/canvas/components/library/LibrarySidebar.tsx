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
import { useEffect, useRef, useState } from "react";
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

type ReferenceTabId = "presets" | "custom" | "pinterest";
type ReferenceTemplate = {
  id: string;
  label: string;
  imageSrc: string;
};

type SlotConfig = { id: string; label: string };
type GroupConfig = { label: string; slots: SlotConfig[] };
type SectionConfig = {
  id: PresetGroupCategory;
  label: string;
  icon: LucideIcon;
  slots?: SlotConfig[];
  groups?: GroupConfig[];
};

const ENVIRONMENT_TEMPLATE_LIBRARY: Record<string, ReferenceTemplate[]> = {
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

const MATERIAL_TEMPLATE_LIBRARY: Record<string, ReferenceTemplate[]> = {
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

function getTemplatesForSlot(slotId: string, label: string): ReferenceTemplate[] {
  if (ENVIRONMENT_TEMPLATE_LIBRARY[slotId]) return ENVIRONMENT_TEMPLATE_LIBRARY[slotId];
  if (MATERIAL_TEMPLATE_LIBRARY[slotId]) return MATERIAL_TEMPLATE_LIBRARY[slotId];
  
  return [
    { id: `${slotId}-1`, label: `Classic ${label}`, imageSrc: "/assets/garden_3d_render.png" },
    { id: `${slotId}-2`, label: `Modern ${label}`, imageSrc: "/assets/urban_waterfall.png" },
    { id: `${slotId}-3`, label: `Natural ${label}`, imageSrc: "/assets/co_thach.png" },
    { id: `${slotId}-4`, label: `Minimalist ${label}`, imageSrc: "/assets/bonsai.png" },
  ];
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
  const [openSection, setOpenSection] = useState<PresetGroupCategory | null>("garden-styles");
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [referenceTab, setReferenceTab] = useState<ReferenceTabId>("presets");
  
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
      <div className="grid grid-cols-3 gap-2">
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
                "group relative aspect-square overflow-hidden rounded-xl border text-left transition",
                selectedTemplate
                  ? "border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]"
                  : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)]",
                isActive ? "ring-2 ring-[var(--canvas-theme-active)]/40" : "hover:border-[var(--canvas-theme-border-strong)] hover:bg-[var(--canvas-theme-hover)]",
              ].join(" ")}
            >
              <div className="absolute inset-0 flex items-center justify-center px-2.5 text-center">
                <p className="block text-[clamp(9px,0.82vw,11px)] font-semibold tracking-[0.01em] text-[var(--canvas-theme-text-muted)]">
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
    <div className="relative flex h-full w-full shrink-0 overflow-visible bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)]">
        <div className="border-b border-[var(--canvas-theme-border)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--canvas-theme-text-muted)]">
                {text.common.library}
              </p>
              <h2 className="mt-2 text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">
                {text.common.projectAssets}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
                {text.common.libraryDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
              title={text.common.closeLibrary}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
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

      {openSection && activeSlotId ? (
        <ReferenceFlyout
          slotLabel={activeSlotLabel}
          language={language}
          activeTab={referenceTab}
          onTabChange={setReferenceTab}
          templates={getTemplatesForSlot(activeSlotId, activeSlotLabel)}
          selectedTemplateIds={(selectedTemplates[openSection]?.[activeSlotId] ?? []).map((t) => t.id)}
          onSelectTemplate={(template) => selectTemplate(openSection, activeSlotId, template)}
          onClose={() => setActiveSlotId(null)}
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
  language,
  activeTab,
  onTabChange,
  templates,
  selectedTemplateIds,
  onSelectTemplate,
  onClose,
}: {
  slotLabel: string;
  language: CanvasLanguage;
  activeTab: ReferenceTabId;
  onTabChange: (tab: ReferenceTabId) => void;
  templates: ReferenceTemplate[];
  selectedTemplateIds: string[];
  onSelectTemplate: (template: ReferenceTemplate) => void;
  onClose: () => void;
}) {
  const flyoutRef = useRef<HTMLElement>(null);
  const text = getCanvasText(language);
  const tabs: Array<{ id: ReferenceTabId; label: string }> = [
    { id: "presets", label: text.flyout.presets },
    { id: "custom", label: text.flyout.custom },
    { id: "pinterest", label: text.flyout.pinterest },
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

  return (
    <section
      ref={flyoutRef}
      className="absolute bottom-0 left-full top-0 z-[9999] flex w-[320px] flex-col overflow-hidden rounded-r-xl border border-l-0 border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] shadow-2xl transition-transform"
      style={{
        boxShadow: "20px 0 25px -5px rgb(0 0 0 / 0.1), 8px 0 10px -6px rgb(0 0 0 / 0.1)",
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--canvas-theme-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--canvas-theme-text)]">{translateCanvasLabel(slotLabel, language)}</h3>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--canvas-theme-border)] px-4 pt-3">
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
          "min-h-0 flex-1 overflow-y-auto p-4 transition-colors duration-300",
          isScrollbarVisible ? "[&::-webkit-scrollbar-thumb]:bg-[var(--canvas-theme-border-strong)]" : "[&::-webkit-scrollbar-thumb]:bg-transparent",
        ].join(" ")}
        onScroll={handleScroll}
      >
        {activeTab === "presets" ? (
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
                  <img
                    src={template.imageSrc}
                    alt={template.label}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                    <p className="text-[10px] font-medium text-white">{template.label}</p>
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
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Box className="mb-3 h-8 w-8 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--canvas-theme-text)]">
              {activeTab === "custom" ? text.flyout.customAssets : text.flyout.pinterestIntegration}
            </p>
            <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-[var(--canvas-theme-text-muted)]">
              {activeTab === "custom"
                ? text.flyout.customDescription
                : text.flyout.pinterestDescription}
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
            >
              {activeTab === "custom" ? text.flyout.uploadImage : text.flyout.connectPinterest}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
