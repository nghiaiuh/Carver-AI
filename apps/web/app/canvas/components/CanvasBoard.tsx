"use client";

import type { AddedObject, EditorTool, Marker, Region, SelectedItem } from "./CanvasWorkspace";
import BottomToolDock from "./BottomToolDock";
import MiniMap from "./MiniMap";
import SelectableImage from "./SelectableImage";

type CanvasBoardProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  gridVisible: boolean;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  mockConcepts: string[];
  angleResults: string[];
  onSelect: (item: SelectedItem) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onTool: (tool: EditorTool) => void;
  onToggleGrid: () => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onRealityCheck: () => void;
  onGenerate: () => void;
  onToast: (message: string) => void;
};

export default function CanvasBoard({
  selectedItem,
  activeTool,
  gridVisible,
  markers,
  regions,
  addedObjects,
  mockConcepts,
  angleResults,
  onSelect,
  onImageAction,
  onTool,
  onToggleGrid,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onRealityCheck,
  onGenerate,
  onToast,
}: CanvasBoardProps) {
  return (
    <section
      className="relative h-full flex-1 overflow-hidden bg-[#F7F8FA]"
      onClick={() => onSelect({ type: "none" })}
    >
      {gridVisible ? <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(#E5E7EB_1px,transparent_1px),linear-gradient(90deg,#E5E7EB_1px,transparent_1px)] bg-[size:32px_32px] opacity-55" /> : null}
      <div className="absolute left-6 top-5 z-40 rounded-full border border-[#E5E7EB] bg-white/85 px-3 py-2 text-xs font-black text-[#667085] shadow-sm backdrop-blur">
        {activeTool === "select" ? "Select an image or object" : `Active: ${activeTool.replaceAll("-", " ")}`}
      </div>

      <SelectableImage
        selectedItem={selectedItem}
        activeTool={activeTool}
        markers={markers}
        regions={regions}
        addedObjects={addedObjects}
        onSelect={onSelect}
        onImageAction={onImageAction}
        onQuickEdit={onQuickEdit}
        onMultiAngle={onMultiAngle}
        onAddObject={onAddObject}
        onTool={onTool}
        onRealityCheck={onRealityCheck}
        onToast={onToast}
      />

      <MiniMap />
      <BottomToolDock
        activeTool={activeTool}
        gridVisible={gridVisible}
        onTool={onTool}
        onToggleGrid={onToggleGrid}
        onAddObject={onAddObject}
        onGenerate={onGenerate}
        onToast={onToast}
      />

      {mockConcepts.length > 0 || angleResults.length > 0 ? (
        <div className="output-tray absolute bottom-7 right-7 z-40 flex max-w-[440px] gap-3 overflow-x-auto rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-2xl shadow-black/12 backdrop-blur">
          {[...mockConcepts, ...angleResults].map((item, index) => (
            <div key={`${item}-${index}`} className="output-thumb w-28 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA]">
              <div className="h-20 bg-[linear-gradient(135deg,rgba(109,93,251,.22),#fff_54%,rgba(34,197,94,.16))]" />
              <p className="px-3 py-2 text-xs font-black text-[#111827]">{item}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
