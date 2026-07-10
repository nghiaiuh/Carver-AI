"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryAsset, LibraryFolder } from "../../types/library";
import type { SceneRecipeItemId } from "./SceneRecipeBar";

type CanvasAssetLibraryModalProps = {
  open: boolean;
  activeItem: SceneRecipeItemId | null;
  folders: LibraryFolder[];
  onClose: () => void;
  onAddAssets: (assets: LibraryAsset[]) => void;
};

const categories: Record<SceneRecipeItemId, string[]> = {
  site: ["All", "Site", "Uploaded", "Saved"],
  style: ["All", "Japanese", "Chinese", "Korean", "Tropical", "Modern", "Mediterranean"],
  plants: ["All", "Trees", "Shrubs", "Grasses", "Groundcovers", "Aquatic", "Tropical"],
  materials: ["All", "Stone", "Gravel", "Wood", "Tile", "Concrete", "Metal", "Mulch"],
  objects: ["All", "Furniture", "Pots", "Lighting", "Sculpture", "Pergola", "Water Feature"],
  light: ["All", "Morning", "Noon", "Golden hour", "Overcast", "Night"],
  season: ["All", "Spring", "Summer", "Autumn", "Winter", "Rainy", "Dry"],
};

export default function CanvasAssetLibraryModal({
  open,
  activeItem,
  folders,
  onClose,
  onAddAssets,
}: CanvasAssetLibraryModalProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  const assets = useMemo(() => folders.flatMap((folder) => folder.assets), [folders]);
  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCategory = category.toLowerCase();

    return assets.filter((asset) => {
      const searchable = [
        asset.title,
        asset.prompt,
        asset.category,
        asset.metadata?.categoryHint,
        asset.metadata?.speciesName,
        ...(asset.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesCategory = category === "All" || searchable.includes(normalizedCategory);
      return matchesQuery && matchesCategory;
    });
  }, [assets, category, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Scene controls intentionally switch the current library instead of dismissing it.
      if (target.closest("[data-scene-recipe-trigger]")) return;
      if (modalRef.current?.contains(target)) return;

      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose, open]);

  if (!open || !activeItem) return null;

  const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));
  const activeCategories = categories[activeItem];
  const title = activeItem === "site" ? "Site Images" : `${activeItem[0].toUpperCase()}${activeItem.slice(1)} Library`;

  return (
    <div
      ref={modalRef}
      className="pointer-events-auto absolute bottom-24 left-1/2 top-8 z-[100] w-[min(1040px,calc(100%-3rem))] -translate-x-1/2 overflow-hidden rounded-[22px] border border-[#D8D2C3] bg-[#FFFDF8] shadow-[0_30px_90px_rgba(23,50,37,0.2)]"
    >
      <div className="flex h-16 items-center justify-between border-b border-[#E4DFD3] px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7B876F]">Scene Recipe</p>
          <h2 className="font-[var(--font-botanical-display)] text-2xl text-[#173225]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full text-[#506254] transition hover:bg-[#F3EFE3]"
          aria-label="Close library"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="grid h-[calc(100%-8rem)] grid-cols-[150px_minmax(0,1fr)_170px]">
        <nav className="border-r border-[#E4DFD3] bg-[#FBF8EF] p-3">
          <div className="space-y-1">
            {activeCategories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={[
                  "w-full rounded-[10px] px-2.5 py-2 text-left text-sm transition",
                  category === item ? "bg-[#DDEBDD] font-semibold text-[#173225]" : "text-[#657465] hover:bg-[#F3EFE3]",
                ].join(" ")}
              >
                {item}
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 overflow-y-auto p-4">
          <label className="flex h-10 items-center gap-3 rounded-[12px] border border-[#D8D2C3] bg-white px-3 text-[#657465]">
            <Search className="h-4 w-4" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plants, materials, styles..."
              className="w-full bg-transparent text-sm text-[#173225] outline-none placeholder:text-[#8A9588]"
            />
          </label>

          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {filteredAssets.map((asset) => {
              const selected = selectedIds.has(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(asset.id)) next.delete(asset.id);
                      else next.add(asset.id);
                      return next;
                    });
                  }}
                  className={[
                    "group overflow-hidden rounded-[13px] border bg-white text-left transition",
                    selected ? "border-[#466E55] shadow-[0_0_0_2px_rgba(70,110,85,0.15)]" : "border-[#E4DFD3] hover:border-[#AEB99F]",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.thumbnailSrc ?? asset.previewSrc ?? asset.src}
                    alt={asset.title ?? "Library asset"}
                    className="aspect-[5/4] w-full object-cover"
                    draggable={false}
                  />
                  <div className="p-2.5">
                    <p className="truncate text-sm font-semibold text-[#173225]">{asset.title ?? "Untitled asset"}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[#657465]">
                      {asset.metadata?.speciesName ?? asset.metadata?.categoryHint ?? asset.category ?? "Design asset"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="border-l border-[#E4DFD3] bg-[#FBF8EF] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7B876F]">Filters</p>
          <div className="mt-3 space-y-2 text-sm text-[#657465]">
            <p>Using existing metadata only.</p>
            <p>{filteredAssets.length} visible assets</p>
            <p>{selectedAssets.length} selected</p>
          </div>
        </aside>
      </div>

      <footer className="flex h-16 items-center justify-between border-t border-[#E4DFD3] bg-[#FFFDF8] px-5">
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          className="text-sm font-medium text-[#657465] transition hover:text-[#173225]"
        >
          Clear selection
        </button>
        <button
          type="button"
          disabled={selectedAssets.length === 0}
          onClick={() => {
            onAddAssets(selectedAssets);
            setSelectedIds(new Set());
            onClose();
          }}
          className="rounded-[12px] bg-[#466E55] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#365A45] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add to Board
        </button>
      </footer>
    </div>
  );
}
