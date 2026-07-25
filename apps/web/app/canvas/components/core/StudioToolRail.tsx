"use client";

import {
  Crop,
  Eraser,
  Hand,
  Link2,
  MousePointer2,
  PenLine,
  Plus,
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
    { id: "add-object", label: "Add object", icon: Plus },
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
  ],
];

export default function StudioToolRail({ activeTool, onTool, onAddObject, onUpload }: StudioToolRailProps) {
  return (
    <aside
      className="absolute left-3 top-4 z-[90] flex w-[48px] flex-col items-center rounded-[26px] border border-[#E6E4DD] bg-[#FFFEFA]/95 px-2 py-2 text-[#365744] shadow-[0_10px_28px_rgba(35,54,42,0.12)] backdrop-blur"
      data-canvas-ui="true"
    >
      {toolGroups.map((group, groupIndex) => (
        <div
          key={groupIndex}
          className="flex w-full flex-col items-center gap-1.5 border-b border-[#E8E7E0] py-1.5 last:border-b-0"
        >
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
                  "grid h-8 w-8 place-items-center rounded-full transition duration-150",
                  selected
                    ? "bg-[#244B38] text-white shadow-[0_5px_12px_rgba(36,75,56,0.26)]"
                    : "text-[#41614B] hover:bg-[#E9F0E8] hover:text-[#173225]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
