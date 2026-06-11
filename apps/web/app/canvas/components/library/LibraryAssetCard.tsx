"use client";

import { Eye, Plus, Trash2 } from "lucide-react";
import type { LibraryAsset } from "../../types/library";

type LibraryAssetCardProps = {
  asset: LibraryAsset;
  selected: boolean;
  onSelect: () => void;
  onAddToCanvas: () => void;
  onDelete: () => void;
  onPreview: () => void;
};

export default function LibraryAssetCard({
  asset,
  selected,
  onSelect,
  onAddToCanvas,
  onDelete,
  onPreview,
}: LibraryAssetCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onAddToCanvas}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "group relative overflow-hidden rounded-2xl border bg-slate-900/60 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        selected ? "border-sky-300 shadow-[0_0_0_1px_rgba(125,211,252,0.65)]" : "border-white/8 hover:border-white/20",
      ].join(" ")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.thumbnailSrc ?? asset.src}
        alt={asset.title ?? "Library asset"}
        className="aspect-[4/3] w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="truncate text-xs font-semibold text-white">{asset.title ?? "Untitled asset"}</p>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddToCanvas();
          }}
          className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-900 shadow-lg transition hover:scale-105"
          title="Add to canvas"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-900 shadow-lg transition hover:scale-105"
          title="Preview"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="grid h-8 w-8 place-items-center rounded-full bg-rose-500/90 text-white shadow-lg transition hover:scale-105"
          title="Delete from library"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
