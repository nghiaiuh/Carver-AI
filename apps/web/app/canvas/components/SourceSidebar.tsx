"use client";

import { Link2, Plus, Upload } from "lucide-react";
import NextImage from "next/image";
import { demoSources, Source } from "../data/canvasData";

type SourceSidebarProps = {
  selectedId?: string;
  onSelectSource: (sourceId: string) => void;
};

const addButtons = ["Site Photo", "Floorplan", "Style Reference", "Material Reference", "Object Reference"];

export default function SourceSidebar({ selectedId, onSelectSource }: SourceSidebarProps) {
  return (
    <aside className="flex w-[300px] h-full shrink-0 flex-col border-r border-[#E5E7EB] bg-white overflow-hidden">
      <div className="border-b border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-[#0A0A0A]">Source Library</p>
            <p className="mt-1 text-xs font-semibold text-[#667085]">Guide AI with visual inputs</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-xl bg-[#111827] text-white shadow-sm" title="Upload source">
            <Upload className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {addButtons.map((label) => (
            <button
              key={label}
              className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-left text-xs font-bold text-[#111827] transition hover:border-[#D0D5DD] hover:bg-white"
            >
              <span>Add {label}</span>
              <Plus className="h-3.5 w-3.5 text-[#667085]" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#98A2B3]">Demo Sources</div>
        <div className="grid gap-3">
          {demoSources.map((source) => (
            <SourceCard key={source.id} source={source} active={selectedId === source.id} onSelect={() => onSelectSource(source.id)} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function SourceCard({ source, active, onSelect }: { source: Source; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`group w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
        active ? "border-[#22C55E] ring-4 ring-[#22C55E]/10" : "border-[#E5E7EB] hover:border-[#D0D5DD] hover:shadow-md"
      }`}
    >
      <div className="flex gap-3">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F7F8FA]">
          <NextImage
            src={source.thumbnail}
            alt={source.name}
            fill
            className="object-cover transition group-hover:scale-105"
            sizes="80px"
          />
          <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${source.accent}44, transparent)` }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-[#0A0A0A]">{source.name}</p>
          <p className="mt-1 text-xs font-semibold text-[#667085]">{source.type}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#667085]">{source.role}</span>
            <Link2 className="h-3.5 w-3.5 text-[#98A2B3] transition group-hover:text-[#6D5DFB]" aria-hidden="true" />
          </div>
        </div>
      </div>
    </button>
  );
}
