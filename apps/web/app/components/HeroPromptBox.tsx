/*
 * Flow: Renders a shared app-level UI component.
 * 1. Own local UI state when needed.
 * 2. Call API routes or parent callbacks for actions.
 * 3. Return reusable interface pieces for pages.
 */

"use client";

import { useState } from "react";
import { ChevronDown, Gift, Mic, Plus, Send, Wand2 } from "lucide-react";

type EnhancePromptResponse = {
  enhancedDraft?: string;
};

export default function HeroPromptBox() {
  const [prompt, setPrompt] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const hasPrompt = prompt.trim().length > 0;

  const updatePrompt = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    if (!nextPrompt.trim()) setIsEnhancing(false);
  };

  const enhancePrompt = async () => {
    const rawPrompt = prompt.trim();
    if (!rawPrompt || isEnhancing) return;

    setIsEnhancing(true);

    try {
      const response = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPrompt }),
      });

      if (!response.ok) {
        throw new Error("Prompt enhance failed");
      }

      const data = (await response.json()) as EnhancePromptResponse;
      if (data.enhancedDraft) {
        setPrompt(data.enhancedDraft);
      }
    } catch {
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="mt-10 w-full rounded-[1.75rem] border border-black/10 bg-white/75 p-6 text-left shadow-[0_28px_80px_rgba(16,20,18,0.10)] backdrop-blur-xl">
      <textarea
        aria-label="Describe your landscape idea"
        placeholder="Describe your idea. Attach a design to guide the result."
        rows={1}
        value={prompt}
        onChange={(event) => updatePrompt(event.target.value)}
        className="block max-h-32 min-h-8 w-full resize-none overflow-y-auto bg-transparent text-lg font-normal text-black/80 placeholder:text-black/32 outline-none [field-sizing:content]"
      />
      <div className="mt-8 flex items-center justify-between gap-4 text-black/58">
        <div className="flex items-center gap-2">
          <button className="grid h-10 w-10 place-items-center rounded-full border border-black/10 transition hover:bg-black/5" aria-label="Add prompt material">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={enhancePrompt}
            disabled={!hasPrompt || isEnhancing}
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enhance prompt"
            title="Enhance prompt"
          >
            <Wand2 className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-black text-black/75 transition hover:bg-black/5" aria-label="Select build mode">
            Build
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-black text-black/75 transition hover:bg-black/5" aria-label="Select style preset">
            Default
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full border border-black/10 transition hover:bg-black/5" aria-label="Open assets">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[#7568a6] text-white shadow-lg shadow-[#7568a6]/25 transition hover:bg-[#66599a]" aria-label={hasPrompt ? "Send prompt" : "Record voice prompt"}>
            {hasPrompt ? <Send className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}