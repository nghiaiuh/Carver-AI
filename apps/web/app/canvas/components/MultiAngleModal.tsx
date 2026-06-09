/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { Camera, X } from "lucide-react";

type MultiAngleModalProps = {
  open: boolean;
  onClose: () => void;
  onGenerate: () => void;
};

const options = ["Front View", "Eye-level View", "Top-down View", "Left Corner", "Right Corner", "Night Lighting"];

export default function MultiAngleModal({ open, onClose, onGenerate }: MultiAngleModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/18 p-6 backdrop-blur-sm">
      <div className="multi-angle-modal w-full max-w-2xl rounded-[28px] border border-[#E5E7EB] bg-white p-6 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#0A0A0A]">Create Multi-Angle Set</h2>
            <p className="mt-1 text-sm font-semibold text-[#667085]">Generate client-ready camera views from the selected image.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:text-[#111827]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {options.map((option, index) => (
            <button key={option} className={`rounded-3xl border p-4 text-left transition ${index < 4 ? "border-[#6D5DFB] bg-[#F4F3FF]" : "border-[#E5E7EB] bg-[#F7F8FA]"}`}>
              <Camera className="h-5 w-5 text-[#6D5DFB]" aria-hidden="true" />
              <p className="mt-8 text-sm font-black text-[#111827]">{option}</p>
            </button>
          ))}
        </div>
        <button onClick={onGenerate} className="mt-5 w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">
          Generate Angle Set
        </button>
      </div>
    </div>
  );
}
