"use client";

import { X } from "lucide-react";
import { objectLibrary } from "../data/canvasData";

type AddObjectPanelProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (type: string) => void;
};

export default function AddObjectPanel({ open, onClose, onAdd }: AddObjectPanelProps) {
  if (!open) return null;

  return (
    <div className="modal-panel absolute left-1/2 top-1/2 z-50 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-[#0A0A0A]">Add Object</p>
          <p className="mt-1 text-sm font-semibold text-[#667085]">Place a landscape object on the canvas.</p>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:text-[#111827]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {objectLibrary.map((object) => (
          <button
            key={object}
            onClick={() => onAdd(object)}
            className="min-h-20 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-left text-sm font-black text-[#111827] transition hover:border-[#6D5DFB] hover:bg-[#F4F3FF]"
          >
            {object}
          </button>
        ))}
      </div>
    </div>
  );
}
