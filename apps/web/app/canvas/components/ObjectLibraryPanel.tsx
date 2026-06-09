/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useMemo, useState } from "react";
import { Bookmark, ImagePlus, Search, Trash2 } from "lucide-react";
import type { LibraryAsset, LibraryAssetCategory } from "./CanvasWorkspace";

type ObjectLibraryPanelProps = {
  assets: LibraryAsset[];
  preferredCategory: LibraryAssetCategory;
  selectedAssetIds: string[];
  onUseAsset: (assetId: string) => void;
  onSaveAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
};

const tabs: Array<{ id: LibraryAssetCategory | "saved"; label: string }> = [
  { id: "plant", label: "Plants" },
  { id: "stone", label: "Stones" },
  { id: "rockery", label: "Rockery" },
  { id: "water", label: "Water" },
  { id: "hardscape", label: "Hardscape" },
  { id: "saved", label: "Saved" },
];

export default function ObjectLibraryPanel({
  assets,
  preferredCategory,
  selectedAssetIds,
  onUseAsset,
  onSaveAsset,
  onRemoveAsset,
}: ObjectLibraryPanelProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<LibraryAssetCategory | "saved">(preferredCategory === "unknown" ? "plant" : preferredCategory);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesTab = activeTab === "saved" ? asset.sourceType === "saved" : asset.category === activeTab;
      const matchesQuery =
        !normalizedQuery ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      return matchesTab && matchesQuery;
    });
  }, [activeTab, assets, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[#E5E7EB] p-4">
        <p className="text-sm font-black text-[#0A0A0A]">Object Library</p>
        <p className="mt-1 text-xs font-semibold text-[#667085]">Local plants, stones, and references for this target.</p>
        <div className="mt-4 flex h-10 items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] px-3">
          <Search className="h-4 w-4 text-[#98A2B3]" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search local library"
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#111827] outline-none placeholder:text-[#98A2B3]"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                activeTab === tab.id ? "bg-[#111827] text-white" : "bg-[#F2F4F7] text-[#667085] hover:bg-[#E5E7EB]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid gap-3">
          {filteredAssets.map((asset) => {
            const used = selectedAssetIds.includes(asset.id);
            return (
              <div key={asset.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${used ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/10" : "border-[#E5E7EB]"}`}>
                <div className="flex gap-3">
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F7F8FA]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.imageUrl} alt="" className="h-full w-full object-cover" />
                    <ImagePlus className="absolute left-2 top-2 h-4 w-4 text-white drop-shadow" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#111827]">{asset.name}</p>
                    <p className="mt-1 text-xs font-bold capitalize text-[#667085]">{asset.category}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] font-black text-[#667085]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => onUseAsset(asset.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                      used ? "bg-[#DBEAFE] text-[#1D4ED8]" : "bg-[#111827] text-white hover:bg-black"
                    }`}
                  >
                    {used ? "Using" : "Use for this area"}
                  </button>
                  <button type="button" onClick={() => onSaveAsset(asset.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:bg-[#E5E7EB]" title="Save">
                    <Bookmark className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRemoveAsset(asset.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FEF2F2] text-[#B42318] hover:bg-[#FEE4E2]" title="Remove">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {filteredAssets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D0D5DD] bg-[#F7F8FA] p-5 text-center text-xs font-bold text-[#667085]">
            No local assets match this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}
