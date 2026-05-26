"use client";

import { CanvasTool, canvasTools, ToolId } from "../data/canvasData";

type ToolDockProps = {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
};

const groups: CanvasTool["group"][] = ["Navigate", "Mark & Region", "Object", "Camera", "Assist"];

export default function ToolDock({ activeTool, onToolChange }: ToolDockProps) {
  return (
    <div className="tool-dock absolute left-5 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-white/92 p-2 shadow-2xl shadow-black/10 backdrop-blur">
      {groups.map((group, groupIndex) => (
        <div key={group} className="flex flex-col gap-1">
          {groupIndex > 0 ? <div className="my-1 h-px bg-[#E5E7EB]" /> : null}
          {canvasTools.filter((tool) => tool.group === group).map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => onToolChange(tool.id)}
                title={`${tool.label}: ${tool.tip}`}
                className={`group relative grid h-10 w-10 place-items-center rounded-xl transition ${
                  active ? "bg-[#111827] text-white shadow-lg shadow-black/15" : "text-[#667085] hover:bg-[#F7F8FA] hover:text-[#111827]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-bold text-[#111827] shadow-lg group-hover:block">
                  {tool.label}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
