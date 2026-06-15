/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { ClipboardList } from "lucide-react";
import type { AddedObject, LibraryAsset, Region, SketchGroup } from "../../types/canvas";

type SelectionBriefPanelProps = {
  target?: Region | SketchGroup | AddedObject;
  assets: LibraryAsset[];
};

export default function SelectionBriefPanel({ target, assets }: SelectionBriefPanelProps) {
  if (!target) {
    return (
      <div className="border-t border-[#E5E7EB] p-4">
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs font-bold text-[#667085]">
          Select a region, object, or sketch group to build an edit brief.
        </div>
      </div>
    );
  }

  const title = "nameTag" in target ? target.nameTag : "label" in target ? target.label : "Selected target";
  const type = "objectType" in target ? target.objectType : "kind" in target ? target.kind : target.label;

  return (
    <div className="border-t border-[#E5E7EB] p-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
          <p className="text-xs font-black text-[#111827]">Selection Brief</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs font-bold text-[#667085]">
          <div className="flex justify-between gap-3">
            <span>Target</span>
            <span className="truncate text-[#111827]">{title}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Type</span>
            <span className="truncate capitalize text-[#111827]">{type}</span>
          </div>
          <div>
            <p className="mb-1">References</p>
            <div className="grid gap-1">
              {assets.length > 0 ? (
                assets.map((asset) => (
                  <span key={asset.id} className="rounded-xl bg-white px-2 py-1 text-[#111827]">
                    {asset.name}
                  </span>
                ))
              ) : (
                <span className="rounded-xl bg-white px-2 py-1">No asset selected</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
