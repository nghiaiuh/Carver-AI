/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React from "react";
import type { AddedObject, CanvasNode, EditorTool, Marker, Region, SelectedItem } from "./CanvasWorkspace";
import { ImagePlus, Copy, Trash2, RefreshCw, Sparkles } from "lucide-react";
import ContextualToolbar from "./ContextualToolbar";
import FloatingQuickPanel from "./FloatingQuickPanel";
import MarkerPin from "./MarkerPin";
import RegionOverlay from "./RegionOverlay";

type CanvasNodeCardProps = {
  node: CanvasNode;
  selected: boolean;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  activeNodeId: string;
  onSelect: (id: string, event?: React.MouseEvent) => void;
  onSelectOverlay: (item: SelectedItem) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onHandlePointerDown: (id: string, e: React.PointerEvent) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
  onSetActiveNode: (id: string) => void;
};

export default function CanvasNodeCard({
  node,
  selected,
  selectedItem,
  activeTool,
  markers,
  regions,
  addedObjects,
  activeNodeId,
  onSelect,
  onSelectOverlay,
  onSelectContextMenu,
  onDragStart,
  onHandlePointerDown,
  onImageAction,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onTool,
  onRealityCheck,
  onToast,
  onSetActiveNode,
}: CanvasNodeCardProps) {
  const isOutput = node.role === "output";
  const isActiveNode = node.id === activeNodeId;

  return (
    <div
      className={`absolute z-10 select-none bg-white rounded-2xl shadow-xl shadow-black/5 border transition-colors group ${
        selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-[#E5E7EB] hover:border-[#D1D5DB]"
      }`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
      }}
      onPointerDown={(e) => {
        // Prevent pan behavior on canvas when clicking node
        e.stopPropagation();
        onSelect(node.id, e);
        onDragStart(node.id, e);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onQuickEdit();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      {/* Top connection handles */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white bg-[#D1D5DB] hover:bg-[#3B82F6] hover:scale-125 transition-transform cursor-crosshair opacity-0 group-hover:opacity-100 z-30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown(node.id, e);
        }}
      />
      {/* Right connection handles */}
      <div
        className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white bg-[#D1D5DB] hover:bg-[#3B82F6] hover:scale-125 transition-transform cursor-crosshair opacity-0 group-hover:opacity-100 z-30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown(node.id, e);
        }}
      />
      {/* Bottom connection handles */}
      <div
        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white bg-[#D1D5DB] hover:bg-[#3B82F6] hover:scale-125 transition-transform cursor-crosshair opacity-0 group-hover:opacity-100 z-30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown(node.id, e);
        }}
      />
      {/* Left connection handles */}
      <div
        className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white bg-[#D1D5DB] hover:bg-[#3B82F6] hover:scale-125 transition-transform cursor-crosshair opacity-0 group-hover:opacity-100 z-30"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown(node.id, e);
        }}
      />

      {/* Role Badge */}
      <div className="absolute -top-2.5 -left-2.5 z-20">
        <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${isOutput ? "bg-[#8B5CF6]" : "bg-[#10B981]"}`}>
          {node.role}
        </div>
      </div>

      <div className="p-2">
        <div 
          className="relative overflow-hidden rounded-xl bg-[#F7F8FA] border border-[#F3F4F6]"
          style={{ height: node.height }}
          onClick={(e) => {
            if (activeTool === "mark-position" || activeTool === "draw-region" || activeTool === "lock-area") {
              e.stopPropagation();
              onSetActiveNode(node.id);
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              onImageAction(x, y);
            }
          }}
        >
          {node.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.imageUrl} alt={node.title} className="w-full h-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#9CA3AF]">
              <ImagePlus className="w-8 h-8 opacity-50" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5 pointer-events-none" />

          {/* Overlays (Render only on active node, mimicking SelectableImage behavior) */}
          {isActiveNode && (
            <div 
              className="absolute inset-0 z-20" 
              onPointerDown={(e) => e.stopPropagation()}
            >
              {regions.map((region) => (
                <RegionOverlay
                  key={region.id}
                  region={region}
                  selected={selectedItem.type === "region" && selectedItem.id === region.id}
                  onSelect={() => onSelectOverlay({ type: "region", id: region.id })}
                />
              ))}
              {markers.map((marker) => (
                <MarkerPin
                  key={marker.id}
                  marker={marker}
                  selected={selectedItem.type === "marker" && selectedItem.id === marker.id}
                  onSelect={() => onSelectOverlay({ type: "marker", id: marker.id })}
                />
              ))}
              {addedObjects.map((object) => (
                <ObjectBox 
                  key={object.id} 
                  object={object} 
                  selected={selectedItem.type === "object" && selectedItem.id === object.id} 
                  onSelect={() => onSelectOverlay({ type: "object", id: object.id })} 
                />
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-3 px-1 pb-1">
          <h3 className="text-sm font-black text-[#111827]">{node.title}</h3>
          {isOutput ? (
            <div className="mt-1">
              <p className="text-xs text-[#6B7280] leading-snug line-clamp-2" title={node.prompt || ""}>
                {node.prompt || "No prompt provided."}
              </p>
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-xs text-[#9CA3AF] italic">
                {node.prompt ? node.prompt : "No prompt yet"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selection Chrome & Toolbars (Show only when this node card is selected) */}
      {selected ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <ContextualToolbar
            itemLabel={node.role === "output" ? "Image" : node.role === "reference" ? "Reference" : "Object"}
            onQuickEdit={onQuickEdit}
            onMultiAngle={onMultiAngle}
            onAddObject={onAddObject}
            onTool={onTool}
            onToast={onToast}
          />
          <FloatingQuickPanel 
            onTool={onTool} 
            onMultiAngle={onMultiAngle} 
            onRealityCheck={onRealityCheck} 
            onToast={onToast} 
          />
          <SelectionChrome label={node.role === "output" ? "Image" : "Reference"} size={`${node.width} × ${node.height}`} />
        </div>
      ) : null}

      {/* Context Menu */}
      {selected && selectedItem.type === "node" && selectedItem.menu ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <ContextMenu x={selectedItem.menu.x} y={selectedItem.menu.y} onToast={onToast} />
        </div>
      ) : null}
    </div>
  );
}

function SelectionChrome({ label, size }: { label: string; size: string }) {
  return (
    <>
      <span className="absolute -left-1.5 -top-1.5 h-4 w-4 rounded border-2 border-[#3B82F6] bg-white z-30" />
      <span className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded border-2 border-[#3B82F6] bg-white z-30" />
      <span className="absolute -bottom-1.5 -left-1.5 h-4 w-4 rounded border-2 border-[#3B82F6] bg-white z-30" />
      <span className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded border-2 border-[#3B82F6] bg-white z-30" />
      <div className="absolute -left-1 top-[-34px] rounded-lg bg-[#3B82F6] px-2.5 py-1 text-xs font-black text-white z-30">{label}</div>
      <div className="absolute -right-1 bottom-[-32px] rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-black text-[#667085] shadow-sm z-30">{size}</div>
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
