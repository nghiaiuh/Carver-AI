"use client";

import { Layers, Lock, Maximize } from "lucide-react";

type MiniMapProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

export default function MiniMap({ zoom, onZoomIn, onZoomOut, onResetZoom }: MiniMapProps) {
  return (
    <div className="absolute bottom-7 left-7 z-40 w-52 rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-2xl shadow-black/10 backdrop-blur">
      <div className="relative h-28 overflow-hidden rounded-2xl bg-[#F7F8FA]">
        <div className="absolute left-[18%] top-[18%] h-[50%] w-[58%] rounded-lg bg-[#D0D5DD]" />
        <div className="absolute bottom-[16%] right-[14%] h-[18%] w-[24%] rounded bg-[#98A2B3]" />
        <div className="absolute left-[24%] top-[25%] h-[42%] w-[48%] rounded-lg border-2 border-[#3B82F6] bg-[#3B82F6]/8" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-black text-[#667085]">{Math.round(zoom * 100)}%</span>
        <div className="flex gap-1">
          <button
            title="Zoom out"
            onClick={onZoomOut}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[#F7F8FA] text-[#667085] transition hover:bg-[#E5E7EB] hover:text-[#111827]"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            title="Lock zoom"
            onClick={() => {}}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[#F7F8FA] text-[#667085] transition hover:bg-[#E5E7EB] hover:text-[#111827]"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            title="Reset zoom to 100%"
            onClick={onResetZoom}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[#F7F8FA] text-[#667085] transition hover:bg-[#E5E7EB] hover:text-[#111827]"
          >
            <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
