/* eslint-disable @next/next/no-img-element */

import { notFound } from "next/navigation";
import { ArrowLeft, Compass, Route, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  AnimatedSection,
  DiscussionList,
  ReviewPanel,
  ScoreBadge,
  TechnicalSpecTable,
  WaterFlowDivider,
} from "../../gallery/components/GalleryComponents";
import { GalleryShell, MagneticButton } from "../../gallery/components/GalleryShell";
import { projects } from "../../gallery/data/galleryData";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  if (!project) notFound();

  return (
    <GalleryShell active="Gallery">
      <section className="relative z-10 min-h-screen overflow-hidden px-5 pb-16 pt-28 text-[#f8f5ee] lg:px-8">
        <img src={project.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/42 to-black/16" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#f4f0e8] to-transparent" />
        <div className="relative mx-auto flex min-h-[78vh] max-w-[1560px] flex-col justify-between">
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-black backdrop-blur">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Gallery
          </Link>
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-white/58">{project.category}</p>
              <h1 className="mt-5 max-w-6xl text-6xl font-black leading-[0.92] tracking-tight sm:text-8xl">{project.title}</h1>
              <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold text-white/80">
                <span className="rounded-full bg-white/12 px-4 py-2 backdrop-blur">{project.style}</span>
                <span className="rounded-full bg-white/12 px-4 py-2 backdrop-blur">{project.designer}</span>
                <span className="rounded-full bg-white/12 px-4 py-2 backdrop-blur">{project.location}</span>
              </div>
            </div>
            <ScoreBadge score={project.score} size="lg" />
          </div>
        </div>
      </section>

      <AnimatedSection className="relative z-10 px-5 py-20 lg:px-8">
        <div className="mx-auto grid max-w-[1560px] gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div data-reveal>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-black/42">Technical Description</p>
            <h2 className="mt-4 text-5xl font-black leading-tight">A garden scored as an engineered landscape system.</h2>
            <p className="mt-5 text-lg leading-8 text-black/62">
              The detail view captures material decisions, water logic, stone arrangement, maintenance level, and construction risk.
            </p>
          </div>
          <div data-reveal>
            <TechnicalSpecTable project={project} />
          </div>
        </div>
      </AnimatedSection>

      <WaterFlowDivider />

      <AnimatedSection className="relative z-10 px-5 py-20 lg:px-8">
        <div className="mx-auto grid max-w-[1560px] gap-6 lg:grid-cols-2">
          <MethodBlock title="Design Method" icon={Route} items={project.method} />
          <MethodBlock title="Creativity" icon={Sparkles} items={project.creativity} />
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative z-10 bg-[#101412] px-5 py-24 text-[#f8f5ee] lg:px-8">
        <div className="mx-auto max-w-[1560px]">
          <div data-reveal className="mb-10 max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a7d5d8]">Engineer Review Score</p>
            <h2 className="mt-4 text-5xl font-black leading-tight">Multiple technical voices, one project score.</h2>
          </div>
          <div data-reveal>
            <ReviewPanel />
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative z-10 px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-[1560px] gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-black/42">Discussion</p>
            <h2 className="mt-4 text-5xl font-black leading-tight">Designers debate strengths, risks, and alternatives.</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <MagneticButton href="/reviews" dark>
                Open Reviews
              </MagneticButton>
              <MagneticButton href="/submit">
                Submit Similar Work
              </MagneticButton>
            </div>
          </div>
          <div data-reveal>
            <DiscussionList items={project.discussion} />
          </div>
        </div>
      </AnimatedSection>
    </GalleryShell>
  );
}

function MethodBlock({ title, icon: Icon, items }: { title: string; icon: typeof Compass; items: string[] }) {
  return (
    <article data-reveal className="rounded-[2.5rem] border border-black/10 bg-[#fbf8f1]/78 p-7 shadow-2xl shadow-black/[0.07] backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#101412] text-[#f8f5ee]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="text-3xl font-black">{title}</h2>
      </div>
      <div className="mt-7 grid gap-3">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 rounded-3xl bg-white/55 p-4">
            <span className="font-black text-[#4c7177]">{String(index + 1).padStart(2, "0")}</span>
            <p className="text-sm font-semibold leading-6 text-black/68">{item}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
