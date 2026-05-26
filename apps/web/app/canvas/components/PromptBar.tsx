"use client";

import { Send, Sparkles } from "lucide-react";
import { promptChips } from "../data/canvasData";

type PromptBarProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onChip: (chip: string) => void;
  onGenerate: () => void;
};

export default function PromptBar({ prompt, onPromptChange, onChip, onGenerate }: PromptBarProps) {
  return (
    <div className="absolute bottom-5 left-1/2 z-40 w-[min(900px,calc(100%-440px))] -translate-x-1/2 rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-2xl shadow-black/12 backdrop-blur">
      <div className="mb-3 flex flex-wrap gap-2">
        {promptChips.map((chip) => (
          <button
            key={chip}
            onClick={() => onChip(chip)}
            className="rounded-full bg-[#F7F8FA] px-3 py-1.5 text-xs font-black text-[#667085] transition hover:bg-[#F4F3FF] hover:text-[#6D5DFB]"
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F4F3FF] text-[#6D5DFB]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={1}
          className="max-h-28 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm font-semibold text-[#111827] outline-none placeholder:text-[#98A2B3]"
          placeholder="Tell Carver what to design... e.g. Add a small koi pond here, keep the house unchanged, use tropical plants."
        />
        <button onClick={onGenerate} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#111827] px-4 text-sm font-black text-white">
          Generate
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
