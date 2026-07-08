/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import { ArrowRight, Eye, FileText, Leaf, Sparkles, Sprout, Video, Wand2 } from "lucide-react";
import HeroPromptBox from "./components/HeroPromptBox";
import RecentProjectsSection from "./components/RecentProjectsSection";
import { AnimatedSection, FilterBar, ReviewPanel } from "./gallery/components/GalleryComponents";
import { GalleryShell, MagneticButton } from "./gallery/components/GalleryShell";

export default function HomePage() {
  const promptTypes = [
    { label: "AI Plant Mix", Icon: Sparkles, active: true },
    { label: "3D Concept", Icon: Wand2, active: false },
    { label: "Tropical Plants", Icon: Sprout, active: false },
    { label: "Proposal PDF", Icon: FileText, active: false },
    { label: "Before / After", Icon: Video, active: false },
  ];

  return (
    <GalleryShell active="Gallery">
      <section className="relative z-10 px-5 pb-16 pt-32 lg:px-8">
        <div className="mx-auto max-w-[1560px]">
          <div className="mx-auto flex max-w-[980px] flex-col items-center text-center">
            <h1 className="text-balance text-4xl font-black tracking-[-0.05em] text-[#06100f] md:text-6xl">
              Landscape concept is easier with{" "}
              <span className="inline-flex items-center gap-3 whitespace-nowrap">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-black text-white shadow-xl shadow-black/15 md:h-14 md:w-14">
                  <Leaf className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="relative -top-3">Carver AI</span>
              </span>
            </h1>
            <p className="mt-7 text-lg font-bold text-black/40">
              The AI landscape assistant that turns site photos into controlled concept renders
            </p>

            <HeroPromptBox />

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {promptTypes.map(({ label, Icon, active }) => (
                <button
                  key={label}
                  className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-black shadow-sm transition ${
                    active
                      ? "border-[#7ab46b] bg-[#effbea] text-[#27683f] shadow-[#7ab46b]/20"
                      : "border-black/10 bg-white/60 text-black/65 hover:border-black/20 hover:bg-white"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <RecentProjectsSection />
        </div>
      </section>

      <FilterBar />

      <AnimatedSection className="relative z-10 bg-[#101412] px-5 py-24 text-[#f8f5ee] lg:px-8">
        <div className="mx-auto grid max-w-[1560px] gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a7d5d8]">Review Culture</p>
            <h2 className="mt-5 text-5xl font-black leading-tight">Every garden is judged as space, system, and story.</h2>
            <p className="mt-6 text-lg leading-8 text-white/62">
              Carver AI Gallery brings designer taste and engineering critique into one calm exhibition format.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MagneticButton href="/reviews">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Read Reviews
              </MagneticButton>
              <MagneticButton href="/submit">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Submit Work
              </MagneticButton>
            </div>
          </div>
          <div data-reveal>
            <ReviewPanel compact />
          </div>
        </div>
      </AnimatedSection>

      <section className="relative z-10 px-5 py-24 lg:px-8">
        <div className="mx-auto flex max-w-[1560px] flex-col items-start justify-between gap-6 rounded-[2.5rem] border border-black/10 bg-[#fbf8f1]/78 p-8 shadow-2xl shadow-black/[0.07] backdrop-blur md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-black/42">Open Call</p>
            <h2 className="mt-4 text-4xl font-black">Submit a waterfall, koi pond, courtyard, rooftop, or AI-assisted garden concept.</h2>
          </div>
          <MagneticButton href="/submit" dark>
            Submit Project
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </MagneticButton>
        </div>
      </section>
    </GalleryShell>
  );
}
