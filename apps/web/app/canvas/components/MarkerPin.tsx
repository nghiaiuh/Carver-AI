"use client";

import { MapPin } from "lucide-react";
import type { Marker } from "./CanvasWorkspace";

type MarkerPinProps = {
  marker: Marker;
  selected: boolean;
  onSelect: () => void;
};

export default function MarkerPin({ marker, selected, onSelect }: MarkerPinProps) {
  return (
    <button
      className="marker-pin absolute z-30 -translate-x-1/2 -translate-y-full text-left"
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-white shadow-lg ${selected ? "bg-[#3B82F6]" : "bg-[#6D5DFB]"}`}>
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className={`rounded-full border bg-white px-3 py-1.5 text-xs font-black shadow-sm ${selected ? "border-[#3B82F6] text-[#0A0A0A]" : "border-[#E5E7EB] text-[#667085]"}`}>
          {marker.label}
        </span>
      </div>
    </button>
  );
}
