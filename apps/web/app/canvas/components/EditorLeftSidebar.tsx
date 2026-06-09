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
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-r border-[#E9E9E9] bg-white text-[#0A0A0A]">
      <div className="flex h-[56px] items-center justify-between px-4">
        <h2 className="text-base font-semibold tracking-[-0.02em]">Layer</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-[#1F2937] transition hover:bg-[#F5F5F5]"
          title="Close layers"
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-[#E5E5E5] px-4 pb-8 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-[-0.02em]">History</h3>
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="grid h-8 w-8 place-items-center rounded-full text-[#1F2937] transition hover:bg-[#F5F5F5]"
            title={historyOpen ? "Collapse history" : "Expand history"}
          >
            <ChevronUp className={["h-4 w-4 transition-transform", historyOpen ? "" : "rotate-180"].join(" ")} aria-hidden="true" />
          </button>
        </div>

        <div className={["grid place-items-center overflow-hidden text-center transition-[max-height,opacity,padding] duration-200", historyOpen ? "max-h-[190px] pt-4 opacity-100" : "max-h-0 pt-0 opacity-0"].join(" ")}>
          <div>
            <div className="mx-auto grid h-16 w-20 place-items-center text-[#E2E5EB]">
              <ImageIcon className="h-16 w-20 stroke-[1.2]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm font-medium text-[#B7B7B7]">No history yet</p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 place-items-center px-4">
        <p className="text-base font-medium text-[#9CA3AF]">No layers</p>
      </div>
    </aside>
  );
}
