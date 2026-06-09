/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { X } from "lucide-react";

type AddObjectMenuProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (label: string) => void;
};

const objects = ["Koi Pond", "Waterfall", "Rockery / Non Bộ", "Tree", "Shrub", "People", "Lighting", "Pathway", "Deer Statue"];

export default function AddObjectMenu({ open, onClose, onAdd }: AddObjectMenuProps) {
  if (!open) return null;

  return (
    <div className="add-object-menu absolute bottom-28 left-1/2 z-[80] w-[560px] -translate-x-1/2 rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-2xl shadow-black/18">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-[#0A0A0A]">Add Object</p>
          <p className="mt-1 text-sm font-semibold text-[#667085]">Choose an object to place on the image.</p>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:text-[#111827]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {objects.map((object) => (
          <button key={object} onClick={() => onAdd(object)} className="min-h-20 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-left text-sm font-black text-[#111827] transition hover:border-[#6D5DFB] hover:bg-[#F4F3FF]">
            {object}
          </button>
        ))}
      </div>
    </div>
  );
}
