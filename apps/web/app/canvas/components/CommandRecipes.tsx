"use client";

import { WandSparkles } from "lucide-react";
import { commandRecipes } from "../data/canvasData";

type CommandRecipesProps = {
  activeId?: string;
  onPick: (recipe: (typeof commandRecipes)[number]) => void;
};

export default function CommandRecipes({ activeId, onPick }: CommandRecipesProps) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-xl shadow-black/5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-[#0A0A0A]">Quick Actions</p>
          <p className="mt-1 text-xs font-semibold text-[#667085]">Command recipes for common edits.</p>
        </div>
        <WandSparkles className="h-4 w-4 text-[#6D5DFB]" aria-hidden="true" />
      </div>
      <div className="grid gap-2">
        {commandRecipes.map((recipe) => (
          <button
            key={recipe.id}
            onClick={() => onPick(recipe)}
            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
              activeId === recipe.id ? "border-[#6D5DFB] bg-[#F4F3FF] text-[#111827]" : "border-[#E5E7EB] bg-white text-[#667085] hover:bg-[#F7F8FA]"
            }`}
          >
            {recipe.title}
          </button>
        ))}
      </div>
    </section>
  );
}
