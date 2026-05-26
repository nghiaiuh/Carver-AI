"use client";

import { ImagePlus, Layers3, Link2, Plus, Upload } from "lucide-react";
import type { SelectedItem } from "./CanvasWorkspace";

type EditorLeftSidebarProps = {
  selectedItem: SelectedItem;
  onSelectReference: () => void;
  onToast: (message: string) => void;
};

const sources = [
  { id: "main", title: "Main Garden Photo", type: "Site Photo", role: "Layout", color: "#16A34A" },
  { id: "floorplan", title: "Villa Floorplan", type: "Floorplan", role: "Layout", color: "#111827" },
  { id: "reference", title: "Koi Pond Reference", type: "Object Reference", role: "Object", color: "#6D5DFB" },
  { id: "stone", title: "Tai Meo Stone", type: "Material Reference", role: "Material", color: "#667085" },
];

export default function EditorLeftSidebar({ selectedItem, onSelectReference, onToast }: EditorLeftSidebarProps) {
  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-[#0A0A0A]">Sources</p>
            <p className="mt-1 text-xs font-semibold text-[#667085]">Images that guide Carver</p>
          </div>
          <button onClick={() => onToast("Upload source mock")} className="grid h-9 w-9 place-items-center rounded-xl bg-[#111827] text-white shadow-sm" title="Upload source">
            <Upload className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {["Site Photo", "Floorplan", "Style Ref", "Object Ref"].map((label) => (
            <button key={label} onClick={() => onToast(`${label} added`)} className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs font-black text-[#111827] hover:bg-white">
              {label}
              <Plus className="h-3.5 w-3.5 text-[#667085]" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">Source Library</p>
        <div className="grid gap-3">
          {sources.map((source) => {
            const active = (source.id === "main" && selectedItem.type === "image") || (source.id === "reference" && selectedItem.type === "reference");
            return (
              <button
                key={source.id}
                onClick={() => {
                  if (source.id === "reference") onSelectReference();
                  else onToast(`${source.title} selected`);
                }}
                className={`w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
                  active ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/10" : "border-[#E5E7EB] hover:border-[#D0D5DD]"
                }`}
              >
                <div className="flex gap-3">
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F7F8FA]">
                    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${source.color}2E, #fff 58%, ${source.color}1F)` }} />
                    <ImagePlus className="absolute left-2 top-2 h-4 w-4 text-[#667085]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[#0A0A0A]">{source.title}</p>
                    <p className="mt-1 text-xs font-semibold text-[#667085]">{source.type}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#667085]">{source.role}</span>
                      <Link2 className="h-3.5 w-3.5 text-[#98A2B3]" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#E5E7EB] p-4">
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
            <p className="text-xs font-black text-[#111827]">Source Mix</p>
          </div>
          <div className="mt-3 grid gap-2 text-xs font-bold text-[#667085]">
            <div className="flex justify-between"><span>Layout</span><span>Floorplan</span></div>
            <div className="flex justify-between"><span>Style</span><span>Tropical</span></div>
            <div className="flex justify-between"><span>Material</span><span>Tai Meo Stone</span></div>
            <div className="flex justify-between"><span>Object</span><span>Koi Pond</span></div>
          </div>
        </div>
      </div>
    </aside>
  );
}
