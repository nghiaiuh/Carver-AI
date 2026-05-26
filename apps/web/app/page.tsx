import { ArrowRight, Eye, Sparkles } from "lucide-react";
import { AnimatedSection, EditorialHero, FilterBar, ReviewPanel, WaterFlowDivider } from "./gallery/components/GalleryComponents";
import { GalleryShell, MagneticButton } from "./gallery/components/GalleryShell";
import { projects } from "./gallery/data/galleryData";

export default function HomePage() {
  return (
    <GalleryShell active="Gallery">
      <EditorialHero
        eyebrow="International Exhibition Platform"
        title="Explore the World’s Most Inspiring AI Landscape Designs"
        copy="Discover garden concepts, waterfall compositions, koi pond systems, rock formations, and landscape projects reviewed by designers and engineers."
        image={projects[0].image}
      />

      <section className="relative z-10 mx-auto grid max-w-[1560px] gap-4 px-5 pb-10 lg:grid-cols-3 lg:px-8">
        {[
          ["Awarded Projects", "Curated large-format landscape cards with technical review scores."],
          ["Engineer Reviews", "Water systems, materials, feasibility, construction logic, and maintenance notes."],
          ["AI-Assisted Workflow", "A gallery for studios using AI visualization without losing professional judgment."],
        ].map(([title, copy], index) => (
          <div key={title} className="rounded-[2rem] border border-black/10 bg-white/55 p-6 shadow-xl shadow-black/[0.05] backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-black/38">0{index + 1}</p>
            <h2 className="mt-8 text-2xl font-black">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-black/62">{copy}</p>
          </div>
        ))}
      </section>

      <WaterFlowDivider />
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
