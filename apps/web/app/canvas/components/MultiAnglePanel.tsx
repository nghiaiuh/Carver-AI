"use client";

import { Camera, X } from "lucide-react";
import NextImage from "next/image";
import { angleResults } from "../data/canvasData";

type MultiAnglePanelProps = {
  open: boolean;
  hasResults: boolean;
  onClose: () => void;
  onGenerate: () => void;
};

const angleOptions = ["Front view", "Eye-level view", "Top-down plan view", "Left corner view", "Right corner view", "Night lighting view", "Rainy mood", "Before / After set"];

export default function MultiAnglePanel({ open, hasResults, onClose, onGenerate }: MultiAnglePanelProps) {
  if (!open) return null;

  return (
    <div className="modal-panel absolute left-1/2 top-1/2 z-50 w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-[#0A0A0A]">Create Multi-Angle Set</p>
          <p className="mt-1 text-sm font-semibold text-[#667085]">Choose camera views for a client-ready concept set.</p>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:text-[#111827]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {angleOptions.map((option, index) => (
          <button key={option} className={`rounded-2xl border p-3 text-left text-xs font-black transition ${index < 4 ? "border-[#6D5DFB] bg-[#F4F3FF] text-[#111827]" : "border-[#E5E7EB] bg-[#F7F8FA] text-[#667085]"}`}>
            <Camera className="mb-5 h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
            {option}
          </button>
        ))}
      </div>
      <button onClick={onGenerate} className="mt-5 w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">
        Generate Angle Set
      </button>
      {hasResults ? (
        <div className="angle-results mt-5 grid grid-cols-4 gap-2">
          {angleResults.map((result, index) => (
            <div key={result} className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA]">
              <div className="relative h-20 w-full">
                <NextImage
                  src={index % 2 === 0 ? "/assets/garden_3d_render.png" : "/assets/mark_generation.png"}
                  alt={result}
                  fill
                  className="object-cover"
                  sizes="140px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ background: index % 2 ? "linear-gradient(135deg, #6D5DFB55, transparent)" : "linear-gradient(135deg, #16A34A55, transparent)" }}
                />
              </div>
              <p className="px-3 py-2 text-xs font-black text-[#111827]">{result}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
