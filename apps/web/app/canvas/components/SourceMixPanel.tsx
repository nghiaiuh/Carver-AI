"use client";

import { SourceMix, SourceRole } from "../data/canvasData";

type SourceMixPanelProps = {
  mix: SourceMix;
  compact?: boolean;
  onSelectRole?: (role: SourceRole) => void;
};

const roles: SourceRole[] = ["layout", "style", "material", "object"];

export default function SourceMixPanel({ mix, compact = false, onSelectRole }: SourceMixPanelProps) {
  return (
    <section className={`rounded-2xl border border-[#E5E7EB] bg-white shadow-xl shadow-black/5 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#0A0A0A]">Source Mix</p>
          <p className="mt-1 text-xs font-semibold text-[#667085]">Assigned roles guide Carver AI.</p>
        </div>
        <span className="rounded-full bg-[#F4F3FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#6D5DFB]">core</span>
      </div>
      <div className="mt-4 grid gap-2">
        {roles.map((role) => (
          <button
            key={role}
            onClick={() => onSelectRole?.(role)}
            className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F8FA] px-3 py-2 text-left transition hover:bg-[#F2F4F7]"
          >
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">{role}</span>
            <span className="truncate text-sm font-bold text-[#111827]">{mix[role]}</span>
          </button>
        ))}
        <div className="rounded-xl bg-[#111827] px-3 py-2 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Instruction</p>
          <p className="mt-1 text-sm font-bold">{mix.instruction}</p>
        </div>
      </div>
    </section>
  );
}
