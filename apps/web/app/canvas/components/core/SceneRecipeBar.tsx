"use client";

import { Grid2X2, Leaf, Mountain, Plus, Sparkles, SunMedium, Trees, WandSparkles } from "lucide-react";

export type SceneRecipeItemId = "site" | "style" | "plants" | "materials" | "objects" | "light" | "season";

type SceneRecipeBarProps = {
  siteLabel: string;
  styleCount: number;
  plantCount: number;
  materialCount: number;
  objectCount: number;
  onOpen: (item: SceneRecipeItemId) => void;
  onGenerate: () => void;
};

const items: Array<{
  id: SceneRecipeItemId;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { id: "site", label: "Site", icon: Grid2X2 },
  { id: "style", label: "Style", icon: Leaf },
  { id: "plants", label: "Plants", icon: Trees },
  { id: "materials", label: "Materials", icon: Mountain },
  { id: "objects", label: "Objects", icon: Plus },
  { id: "light", label: "Light", icon: SunMedium },
  { id: "season", label: "Season", icon: Sparkles },
];

export default function SceneRecipeBar({
  siteLabel,
  styleCount,
  plantCount,
  materialCount,
  objectCount,
  onOpen,
  onGenerate,
}: SceneRecipeBarProps) {
  const countFor = (id: SceneRecipeItemId) => {
    if (id === "style") return styleCount;
    if (id === "plants") return plantCount;
    if (id === "materials") return materialCount;
    if (id === "objects") return objectCount;
    return 0;
  };

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[70] flex h-16 items-center gap-3 border-t border-[#D8D2C3] bg-[#FBF8EF]/94 px-5 backdrop-blur-xl">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#657465]">Scene</span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const count = countFor(item.id);
          const value = item.id === "site" ? siteLabel : count > 0 ? `${item.label} ${count}` : `${item.label} +`;
          return (
            <button
              key={item.id}
              type="button"
              data-scene-recipe-trigger
              onClick={() => onOpen(item.id)}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[12px] border border-[#D8D2C3] bg-[#FFFDF8] px-3 text-sm text-[#294235] transition hover:border-[#8DA381] hover:bg-[#F3EFE3]"
            >
              <Icon className="h-3.5 w-3.5 text-[#5D8067]" aria-hidden />
              <span>{value}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[12px] bg-[#466E55] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(70,110,85,0.2)] transition hover:bg-[#365A45]"
        >
          <WandSparkles className="h-3.5 w-3.5" aria-hidden />
          Generate
        </button>
      </div>
    </div>
  );
}
