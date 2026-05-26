"use client";

import { FileText, Gauge, Maximize2 } from "lucide-react";
import { GenerationStatus, outputConcepts } from "../data/canvasData";

type OutputPanelProps = {
  status: GenerationStatus;
  showOutputs: boolean;
  onAngles: () => void;
};

export default function OutputPanel({ status, showOutputs, onAngles }: OutputPanelProps) {
  return (
    <section className="absolute bottom-28 right-5 z-30 w-[390px] rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xl shadow-black/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-[#0A0A0A]">Output Results</p>
          <p className="mt-1 text-xs font-semibold text-[#667085]">{status}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${status === "Concept created" ? "bg-[#ECFDF3] text-[#16A34A]" : status === "Generating" ? "bg-[#FFFAEB] text-[#F59E0B]" : "bg-[#F2F4F7] text-[#667085]"}`}>
          {status}
        </span>
      </div>
      {showOutputs ? (
        <div className="output-cards mt-4 grid gap-3">
          {outputConcepts.map((concept) => (
            <article key={concept.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-3">
              <div className="flex gap-3">
                <div className="h-20 w-24 shrink-0 rounded-xl" style={{ background: `linear-gradient(135deg, ${concept.accent}33, #FFFFFF 55%, #22C55E22)` }} />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[#0A0A0A]">{concept.title}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-[#667085]">{concept.style}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-[#667085]">
                    <span>Budget {concept.budgetFit}%</span>
                    <span>Feasible {concept.feasibility}%</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-[#111827]">Open</button>
                <button className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-[#111827]">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  Brief
                </button>
                <button className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-[#111827]">
                  <Gauge className="h-3 w-3" aria-hidden="true" />
                  Reality
                </button>
                <button onClick={onAngles} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#111827] px-2.5 py-1.5 text-xs font-black text-white">
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  Angles
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#D0D5DD] bg-[#F7F8FA] p-4 text-sm font-semibold text-[#667085]">
          Generate a concept to reveal variations, feasibility, and brief actions.
        </div>
      )}
    </section>
  );
}
