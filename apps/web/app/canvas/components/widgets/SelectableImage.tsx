/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

/* eslint-disable @next/next/no-img-element */

import { Copy, ImagePlus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { AddedObject, EditorTool, Marker, Region, SelectedItem } from "../core/CanvasWorkspace";
import ContextualToolbar from "./ContextualToolbar";
import FloatingQuickPanel from "./FloatingQuickPanel";
import MarkerPin from "./MarkerPin";
import RegionOverlay from "./RegionOverlay";

type SelectableImageProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  onSelect: (item: SelectedItem) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
};

export default function SelectableImage({
  selectedItem,
  activeTool,
  markers,
  regions,
  addedObjects,
  onSelect,
  onImageAction,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onTool,
  onRealityCheck,
  onToast,
}: SelectableImageProps) {
  const imageSelected = selectedItem.type === "image";
  const referenceSelected = selectedItem.type === "reference";

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activeTool === "mark-position" || activeTool === "draw-region" || activeTool === "lock-area") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      onImageAction(x, y);
      return;
    }
    onSelect({ type: "image", id: "main-image" });
  };

  return (
    <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
      <div
        className={`selectable-image relative aspect-[4/3] w-[760px] overflow-visible rounded-[24px] bg-white shadow-2xl shadow-black/10 transition ${
          imageSelected ? "ring-2 ring-[#3B82F6] ring-offset-4 ring-offset-[#F7F8FA]" : "ring-1 ring-[#E5E7EB]"
        }`}
        onClick={handleImageClick}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onQuickEdit();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect({ type: "image", id: "main-image", menu: { x: event.clientX, y: event.clientY } });
        }}
      >
        {imageSelected ? (
          <>
            <ContextualToolbar
              itemLabel="Image"
              onQuickEdit={onQuickEdit}
              onMultiAngle={onMultiAngle}
              onAddObject={onAddObject}
              onTool={onTool}
              onToast={onToast}
            />
            <FloatingQuickPanel onTool={onTool} onMultiAngle={onMultiAngle} onRealityCheck={onRealityCheck} onToast={onToast} />
            <SelectionChrome label="Image" size="1522 × 1146" />
          </>
        ) : null}

        <div className="relative h-full overflow-hidden rounded-[24px]">
          <img src="/assets/garden_3d_render.png" alt="Villa garden source" className="h-full w-full select-none object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5" />
          <div className="absolute left-5 top-5 rounded-full bg-white/85 px-3 py-1.5 text-xs font-black text-[#111827] shadow-sm backdrop-blur">
            Main canvas image
          </div>
        </div>

        {regions.map((region) => (
          <RegionOverlay
            key={region.id}
            region={region}
            selected={selectedItem.type === "region" && selectedItem.id === region.id}
            onSelect={() => onSelect({ type: "region", id: region.id })}
          />
        ))}
        {markers.map((marker) => (
          <MarkerPin
            key={marker.id}
            marker={marker}
            selected={selectedItem.type === "marker" && selectedItem.id === marker.id}
            onSelect={() => onSelect({ type: "marker", id: marker.id })}
          />
        ))}
        {addedObjects.map((object) => (
          <ObjectBox key={object.id} object={object} selected={selectedItem.type === "object" && selectedItem.id === object.id} onSelect={() => onSelect({ type: "object", id: object.id })} />
        ))}
      </div>

      <button
        className={`reference-card absolute -bottom-20 right-0 w-48 overflow-hidden rounded-2xl border bg-white p-2 text-left shadow-2xl shadow-black/12 transition ${
          referenceSelected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-[#E5E7EB]"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect({ type: "reference", id: "reference-1" });
        }}
      >
        <div className="h-24 overflow-hidden rounded-xl bg-[#F7F8FA]">
          <img src="/assets/mark_generation.png" alt="Koi pond reference" className="h-full w-full object-cover" draggable={false} />
        </div>
        <p className="mt-2 text-xs font-black text-[#111827]">Koi pond reference</p>
      </button>

      {referenceSelected ? (
        <div className="absolute -bottom-[88px] right-[-210px]">
          <ContextualToolbar itemLabel="Reference" onQuickEdit={onQuickEdit} onMultiAngle={onMultiAngle} onAddObject={onAddObject} onTool={onTool} onToast={onToast} />
        </div>
      ) : null}
      {selectedItem.type === "image" && selectedItem.menu ? (
        <ContextMenu x={selectedItem.menu.x} y={selectedItem.menu.y} onToast={onToast} />
      ) : null}
    </div>
  );
}

function SelectionChrome({ label, size }: { label: string; size: string }) {
  return (
    <>
      <div className="absolute -left-1 top-[-34px] rounded-lg bg-[#3B82F6] px-2.5 py-1 text-xs font-black text-white">{label}</div>
      <div className="absolute -right-1 bottom-[-32px] rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-black text-[#667085] shadow-sm">{size}</div>
    </>
  );
}

function ObjectBox({ object, selected, onSelect }: { object: AddedObject; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`added-object absolute z-30 rounded-2xl border bg-white/85 text-center shadow-xl transition ${
        selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-[#22C55E]"
      }`}
      style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.w}%`, height: `${object.h}%`, transform: `rotate(${object.rotation}deg)` }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className="grid h-full place-items-center rounded-2xl bg-[#ECFDF3]/80 px-3 text-xs font-black text-[#111827]">{object.label}</span>
      {selected ? (
        <>
          <span className="absolute -right-3 -top-8 grid h-7 w-7 place-items-center rounded-full bg-[#111827] text-white shadow-lg">↻</span>
          <span className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-[#3B82F6] bg-white" />
        </>
      ) : null}
    </button>
  );
}

function ContextMenu({ x, y, onToast }: { x: number; y: number; onToast: (message: string) => void }) {
  const items = [
    ["Duplicate", Copy],
    ["Replace image", ImagePlus],
    ["Use as layout source", RefreshCw],
    ["Use as style reference", Sparkles],
    ["Generate similar concept", Sparkles],
    ["Remove", Trash2],
  ] as const;

  return (
    <div className="fixed z-[90] w-56 rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-2xl shadow-black/20" style={{ left: x, top: y }}>
      {items.map(([label, Icon]) => (
        <button
          key={label}
          onClick={(event) => {
            event.stopPropagation();
            onToast(`${label} mock`);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-[#111827] hover:bg-[#F7F8FA]"
        >
          <Icon className="h-4 w-4 text-[#667085]" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
