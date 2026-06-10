/*
 * Flow: Renders the Lovart-style layer/history rail for the canvas.
 * 1. Keep project history controls visible.
 * 2. Show empty states when no generated assets or layers exist.
 * 3. Leave the main workspace uncluttered until content is added.
 */

"use client";

import { useState } from "react";
import { ChevronUp, ImageIcon, X } from "lucide-react";
import type { AddedObject, LibraryAsset, Region, SelectedItem, SketchGroup } from "./CanvasWorkspace";

type EditorLeftSidebarProps = {
  selectedItem: SelectedItem;
  regions: Region[];
  addedObjects: AddedObject[];
  sketchGroups: SketchGroup[];
  libraryAssets: LibraryAsset[];
  onSelectReference: () => void;
  onUseAsset: (assetId: string) => void;
  onSaveAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onToast: (message: string) => void;
  onClose: () => void;
};

export default function EditorLeftSidebar({ onClose }: EditorLeftSidebarProps) {
  const [historyOpen, setHistoryOpen] = useState(true);

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <div className="flex h-[56px] items-center justify-between px-4">
        <h2 className="text-base font-semibold tracking-[-0.02em]">Layer</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
          title="Close layers"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-[var(--canvas-theme-border)] px-3 pb-6 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-[-0.02em]">History</h3>
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
            title={historyOpen ? "Collapse history" : "Expand history"}
          >
            <ChevronUp className={["h-3.5 w-3.5 transition-transform", historyOpen ? "" : "rotate-180"].join(" ")} aria-hidden="true" />
          </button>
        </div>

        <div className={["grid place-items-center overflow-hidden text-center transition-[max-height,opacity,padding] duration-200", historyOpen ? "max-h-[150px] pt-3 opacity-100" : "max-h-0 pt-0 opacity-0"].join(" ")}>
          <div>
            <div className="mx-auto grid h-12 w-16 place-items-center text-[var(--canvas-theme-text-muted)] opacity-55">
              <ImageIcon className="h-12 w-16 stroke-[1.2]" aria-hidden="true" />
            </div>
            <p className="mt-1.5 text-xs font-medium text-[var(--canvas-theme-text-muted)]">No history yet</p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 place-items-center px-3">
        <p className="text-sm font-medium text-[var(--canvas-theme-text-muted)]">No layers</p>
      </div>
    </aside>
  );
}
