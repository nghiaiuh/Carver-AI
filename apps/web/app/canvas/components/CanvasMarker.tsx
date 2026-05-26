"use client";

import { MapPin } from "lucide-react";
import { CanvasMarker as MarkerType } from "../data/canvasData";

type CanvasMarkerProps = {
  marker: MarkerType;
  selected: boolean;
  onSelect: () => void;
};

export default function CanvasMarker({ marker, selected, onSelect }: CanvasMarkerProps) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className="canvas-marker absolute z-20 text-left"
      style={{ left: marker.x, top: marker.y }}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-white shadow-lg ${selected ? "bg-[#22C55E]" : "bg-[#6D5DFB]"}`}>
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className={`rounded-full border bg-white px-3 py-1.5 text-xs font-black shadow-sm ${selected ? "border-[#22C55E] text-[#0A0A0A]" : "border-[#E5E7EB] text-[#667085]"}`}>
          {marker.name}
        </span>
      </div>
    </button>
  );
}
