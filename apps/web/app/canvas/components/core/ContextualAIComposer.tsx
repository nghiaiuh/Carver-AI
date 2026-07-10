"use client";

import { Image as ImageIcon, Paperclip, SendHorizontal, Sparkles, Wand2 } from "lucide-react";

type ContextualAIComposerProps = {
  targetTitle?: string | null;
  promptText: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onOpenHistory: () => void;
  onEnhance: () => void;
};

const quickActions = [
  "Restyle",
  "Add plants",
  "Change season",
  "Replace material",
  "Improve realism",
  "Edit region",
];

export default function ContextualAIComposer({
  targetTitle,
  promptText,
  isGenerating,
  onPromptChange,
  onGenerate,
  onOpenHistory,
  onEnhance,
}: ContextualAIComposerProps) {
  return (
    <div
      className="pointer-events-auto absolute bottom-20 left-1/2 z-[75] w-[min(760px,calc(100%-180px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#D8D2C3] bg-[#FFFDF8]/96 shadow-[0_24px_70px_rgba(23,50,37,0.14)] backdrop-blur-xl"
      data-prompt-composer="true"
    >
      <div className="flex h-12 items-center gap-3 border-b border-[#E4DFD3] px-4 text-sm text-[#657465]">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ECE7DB] text-[#5D8067]">
          <ImageIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="truncate">
          {targetTitle ? `Designing from ${targetTitle}` : "Select a site image to start designing"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {quickActions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onPromptChange(promptText ? `${promptText} ${action.toLowerCase()}.` : `${action}.`)}
            className="rounded-full bg-[#F3EFE3] px-3 py-1.5 text-xs font-medium text-[#294235] transition hover:bg-[#E6DEC9]"
          >
            {action}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-3 px-4 py-3">
        <textarea
          value={promptText}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={2}
          placeholder="Describe what you want to design, preserve, or change..."
          className="max-h-28 min-h-12 flex-1 resize-none bg-transparent text-base text-[#173225] outline-none placeholder:text-[#8A9588]"
        />
        <button
          type="button"
          title="Attach"
          onClick={onOpenHistory}
          className="grid h-10 w-10 place-items-center rounded-full text-[#506254] transition hover:bg-[#F3EFE3]"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          title="Enhance prompt"
          onClick={onEnhance}
          className="grid h-10 w-10 place-items-center rounded-full bg-[#F3EFE3] text-[#506254] transition hover:bg-[#E6DEC9]"
        >
          <Wand2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="grid h-11 w-11 place-items-center rounded-full bg-[#173225] text-white transition hover:bg-[#284D39] disabled:cursor-not-allowed disabled:opacity-60"
          title={isGenerating ? "Generating" : "Generate"}
        >
          {isGenerating ? <Sparkles className="h-4 w-4 animate-pulse" aria-hidden /> : <SendHorizontal className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
