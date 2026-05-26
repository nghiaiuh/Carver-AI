"use client";

import { FileText, Save, Share2, Sparkles } from "lucide-react";
import { projectName } from "../data/canvasData";

type TopBarProps = {
  status: string;
  onGenerate: () => void;
};

export default function TopBar({ status, onGenerate }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#111827] text-sm font-black text-white">C</div>
          <div>
            <p className="text-sm font-black leading-none text-[#0A0A0A]">Carver AI</p>
            <p className="mt-1 text-[11px] font-semibold text-[#667085]">Canvas Workspace</p>
          </div>
        </div>
        <div className="hidden h-8 w-px bg-[#E5E7EB] md:block" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#0A0A0A]">{projectName}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
            <span className="text-xs font-semibold text-[#667085]">{status}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="hidden items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#111827] shadow-sm transition hover:bg-[#F7F8FA] sm:flex">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save
        </button>
        <button className="hidden items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#111827] shadow-sm transition hover:bg-[#F7F8FA] sm:flex">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
        <button className="hidden items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#111827] shadow-sm transition hover:bg-[#F7F8FA] lg:flex">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Export Brief
        </button>
        <button
          onClick={onGenerate}
          className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10 transition hover:bg-black"
        >
          <Sparkles className="h-4 w-4 text-[#A7A1FF]" aria-hidden="true" />
          Generate Concept
        </button>
      </div>
    </header>
  );
}
