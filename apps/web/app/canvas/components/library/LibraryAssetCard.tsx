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
        "group relative overflow-hidden rounded-[20px] border bg-[var(--canvas-theme-surface-panel)] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canvas-theme-active)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas-theme-surface)]",
        selected
          ? "border-[var(--canvas-theme-active)] shadow-[0_0_0_1px_var(--canvas-theme-active)]"
          : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)] hover:shadow-[0_12px_28px_var(--canvas-theme-shadow)]",
      ].join(" ")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.thumbnailSrc ?? asset.previewSrc ?? asset.src}
        alt={asset.title ?? "Library asset"}
        className="aspect-[4/3] w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="absolute left-3 top-3 z-10">
        <span className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-sm">
          {asset.source ?? "manual"}
        </span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddToCanvas();
          }}
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--canvas-theme-surface)] shadow-lg transition hover:scale-105"
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
          className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[var(--canvas-theme-surface)] shadow-lg transition hover:scale-105"
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
          className="grid h-9 w-9 place-items-center rounded-full bg-[#B42318] text-white shadow-lg transition hover:scale-105"
          title="Delete from library"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="border-t border-[var(--canvas-theme-border)] px-3 py-3">
        <p className="truncate text-sm font-semibold text-[var(--canvas-theme-text)]">
          {asset.title ?? "Untitled asset"}
        </p>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
          {asset.metadata?.categoryHint ?? asset.prompt ?? "Double-click to add this asset to canvas."}
        </p>
      </div>
    </div>
  );
}
