/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import { MessageCircle, Scale, ShieldCheck } from "lucide-react";
import { EditorialHero, ReviewPanel, WaterFlowDivider } from "../gallery/components/GalleryComponents";
import { GalleryShell } from "../gallery/components/GalleryShell";
import { projects } from "../gallery/data/galleryData";

const criteria = [
  "Creativity",
  "Technical feasibility",
  "Landscape harmony",
  "Material selection",
  "Construction practicality",
  "Sustainability",
  "Client experience",
];

export default function ReviewsPage() {
  return (
    <GalleryShell active="Reviews">
      <EditorialHero
        eyebrow="Review Board"
        title="Landscape projects reviewed through creative and technical criteria."
        copy="A professional critique layer for concepts that need to be beautiful, feasible, maintainable, and buildable."
        image={projects[2].image}
      />
      <WaterFlowDivider />
      <section className="relative z-10 mx-auto grid max-w-[1560px] gap-8 px-5 pb-16 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div className="rounded-[2.5rem] border border-black/10 bg-white/58 p-7 shadow-xl shadow-black/[0.06] backdrop-blur">
          <Scale className="h-8 w-8 text-[#4c7177]" aria-hidden="true" />
          <h2 className="mt-8 text-4xl font-black">Seven review criteria</h2>
          <div className="mt-7 grid gap-3">
            {criteria.map((criterion, index) => (
              <div key={criterion} className="flex items-center justify-between rounded-full bg-black/[0.04] px-4 py-3 text-sm font-black">
                <span>{criterion}</span>
                <span className="text-black/36">{String(index + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <ReviewPanel />
        </div>
      </section>
      <section className="relative z-10 mx-auto grid max-w-[1560px] gap-5 px-5 pb-28 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {[
          ["Strong points", "Composition, cultural clarity, proportion, atmosphere, and client experience.", ShieldCheck],
          ["Construction risks", "Stone massing, water proofing, overflow, pump access, slope, and safety.", MessageCircle],
          ["Material alternatives", "Local stone, reclaimed timber, lower-carbon paving, and plant substitutions.", Scale],
        ].map(([title, copy, Icon]) => (
          <article key={String(title)} className="rounded-[2rem] border border-black/10 bg-[#fbf8f1]/78 p-6 shadow-xl shadow-black/[0.06]">
            <Icon className="h-7 w-7 text-[#4c7177]" aria-hidden="true" />
            <h3 className="mt-8 text-2xl font-black">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-black/62">{copy}</p>
          </article>
        ))}
      </section>
    </GalleryShell>
  );
}
