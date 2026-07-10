"use client";

import {
  Crop,
  Eraser,
  Hand,
  Link2,
  Maximize2,
  MousePointer2,
  PenLine,
  Ruler,
  Shapes,
  Type,
  Upload,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { EditorTool } from "../../types/canvas";

type StudioToolRailProps = {
  activeTool: EditorTool;
  onTool: (tool: EditorTool) => void;
  onAddObject: () => void;
  onUpload: () => void;
};

const toolGroups: Array<Array<{ id: EditorTool | "upload" | "measure"; label: string; icon: LucideIcon }>> = [
  [
    { id: "select", label: "Select", icon: MousePointer2 },
    { id: "move-object", label: "Pan / move", icon: Hand },
  ],
  [
    { id: "pen", label: "Sketch", icon: PenLine },
    { id: "text-note", label: "Annotation", icon: Type },
    { id: "grid", label: "Shape", icon: Shapes },
    { id: "region", label: "Region Brush", icon: WandSparkles },
    { id: "eraser", label: "Eraser", icon: Eraser },
  ],
  [
    { id: "add-source", label: "Connect", icon: Link2 },
    { id: "edit-elements", label: "Crop / edit", icon: Crop },
    { id: "measure", label: "Measure", icon: Ruler },
  ],
  [
    { id: "upload", label: "Upload / add image", icon: Upload },
    { id: "add-object", label: "Add object", icon: Maximize2 },
  ],
];

export default function StudioToolRail({ activeTool, onTool, onAddObject, onUpload }: StudioToolRailProps) {
  return (
    <aside className="z-[80] flex w-[70px] shrink-0 flex-col items-center gap-4 bg-[#173225] px-3 py-4 text-[#B8C9B8] shadow-[8px_0_28px_rgba(23,50,37,0.12)]">
      {toolGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex w-full flex-col items-center gap-2 border-b border-white/10 pb-4 last:border-b-0">
          {group.map((tool) => {
            const Icon = tool.icon;
            const selected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={selected}
                onClick={() => {
                  if (tool.id === "upload") {
                    onUpload();
                    return;
                  }
                  if (tool.id === "add-object") {
                    onAddObject();
                    return;
                  }
                  if (tool.id === "measure") {
                    onTool("mark-position");
                    return;
                  }
                  onTool(tool.id);
                }}
                className={[
                  "grid h-11 w-11 place-items-center rounded-[16px] transition",
                  selected
                    ? "bg-[#5D8067] text-white shadow-[0_10px_20px_rgba(0,0,0,0.18)]"
                    : "text-[#B8C9B8] hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
