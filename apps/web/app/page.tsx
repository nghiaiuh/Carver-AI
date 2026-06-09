/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import { ArrowRight, Eye, FileText, Leaf, Plus, Sparkles, Sprout, Video, Wand2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import HeroPromptBox from "./components/HeroPromptBox";
import { AnimatedSection, FilterBar, ReviewPanel } from "./gallery/components/GalleryComponents";
import { GalleryShell, MagneticButton } from "./gallery/components/GalleryShell";
import { projects } from "./gallery/data/galleryData";

export default function HomePage() {
  const recentProjects = [
    { title: "Tropical Courtyard", date: "Updated Jun 08, 2026", image: projects[3].image, href: `/canvas?project=${projects[3].slug}` },
    { title: "Koi Pond Residence", date: "Updated Jun 06, 2026", image: projects[1].image, href: `/canvas?project=${projects[1].slug}` },
    { title: "Palm Arrival Walk", date: "Updated Jun 03, 2026", image: projects[2].image, href: `/canvas?project=${projects[2].slug}` },
    { title: "Villa Concept Plan", date: "Updated May 31, 2026", image: projects[0].image, href: `/canvas?project=${projects[0].slug}` },
  ];
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

          <div className="mt-24">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-[-0.04em]">Recent Projects</h2>
              <a href="/submit" className="inline-flex items-center gap-2 text-sm font-black text-black/42 transition hover:text-black">
                See All
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Link href="/canvas" className="flex min-h-[216px] flex-col justify-between rounded-[1.75rem] border border-dashed border-black/12 bg-white/35 p-6 transition hover:border-[#2f7a4f]/40 hover:bg-white/60">
                <span className="grid flex-1 place-items-center text-black/35">
                  <Plus className="h-8 w-8" aria-hidden="true" />
                </span>
                <span className="text-lg font-black">New Project</span>
              </Link>
              {recentProjects.map((project) => (
                <Link key={project.title} href={project.href} className="group">
                  <div className="relative aspect-[1.75/1] overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-lg shadow-black/[0.04]">
                    <Image
                      src={project.image}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 20vw, (min-width: 768px) 50vw, 100vw"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <h3 className="mt-3 text-lg font-black leading-tight">{project.title}</h3>
                  <p className="mt-1 text-sm font-bold text-black/38">{project.date}</p>
                </Link>
              ))}
            </div>
          </div>
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
