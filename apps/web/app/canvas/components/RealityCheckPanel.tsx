/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { AlertTriangle, FileText, X } from "lucide-react";

type RealityCheckPanelProps = {
  open: boolean;
  onClose: () => void;
};

const scores = [
  ["Architecture Fit", 82],
  ["Budget Fit", 68],
  ["Maintenance", 54],
  ["Construction Feasibility", 71],
  ["Climate Fit", 80],
] as const;

const warnings = [
  "Koi pond needs filtration and oxygen check.",
  "Rockery needs load and waterproofing check.",
  "Large trees need root and sun exposure review.",
  "Waterfall needs splash, overflow and pump check.",
  "Budget requires real site survey.",
];

export default function RealityCheckPanel({ open, onClose }: RealityCheckPanelProps) {
  if (!open) return null;

  return (
    <aside className="reality-panel absolute right-7 top-24 z-[80] w-[360px] rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-2xl shadow-black/18">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#0A0A0A]">Reality Check</h2>
          <p className="mt-1 text-sm font-semibold text-[#667085]">Engineering review preview</p>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F8FA] text-[#667085] hover:text-[#111827]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid gap-3">
        {scores.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between text-xs font-black text-[#111827]">
              <span>{label}</span>
              <span>{value}/100</span>
            </div>
            <div className="h-2 rounded-full bg-[#F2F4F7]">
              <div className="h-full rounded-full bg-[#6D5DFB]" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-2">
        {warnings.map((warning) => (
          <div key={warning} className="flex gap-2 rounded-2xl bg-[#FFFAEB] p-3 text-xs font-bold leading-5 text-[#92400E]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {warning}
          </div>
        ))}
      </div>
      <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white">
        <FileText className="h-4 w-4" aria-hidden="true" />
        Create Brief
      </button>
    </aside>
  );
}
