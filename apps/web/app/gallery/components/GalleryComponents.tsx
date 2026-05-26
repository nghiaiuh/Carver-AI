"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Droplets, Hammer, Leaf, MessageCircle, Mountain, Star, Waves } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { gsap, useGSAP } from "../../landing/components/gsapSetup";
import { engineers, filters, Project, projects, reviewRoles, sortOptions, styleDirectory, technicalIcons } from "../data/galleryData";
import { MagneticButton } from "./GalleryShell";

export function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(ref.current.querySelectorAll("[data-reveal]"), {
        y: 32,
        autoAlpha: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 76%" },
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className={className}>
      {children}
    </section>
  );
}

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`grid place-items-center rounded-full border border-white/50 bg-[#101412] text-[#f8f5ee] shadow-xl shadow-black/20 ${size === "lg" ? "h-24 w-24" : size === "sm" ? "h-12 w-12 text-sm" : "h-16 w-16"}`}>
      <span className={`${size === "lg" ? "text-3xl" : "text-lg"} font-black`}>{score.toFixed(1)}</span>
    </div>
  );
}

export function FilterBar() {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Latest");
  const filteredProjects = useMemo(() => {
    const selected = filter === "All" ? projects : projects.filter((project) => project.tags.includes(filter) || project.category.includes(filter) || project.style.includes(filter));
    return [...selected].sort((a, b) => {
      if (sort === "Highest Score") return b.score - a.score;
      if (sort === "Most Reviewed") return b.reviews - a.reviews;
      if (sort === "Most Creative") return b.metrics.Creativity - a.metrics.Creativity;
      if (sort === "Most Feasible") return b.metrics.Feasibility - a.metrics.Feasibility;
      return projects.indexOf(a) - projects.indexOf(b);
    });
  }, [filter, sort]);

  return (
    <>
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-5 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-black/45">Nominee Gallery</p>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-bold text-black/70 shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-[#7aa6a7]"
          >
            {sortOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {filters.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                filter === item ? "border-[#101412] bg-[#101412] text-[#f8f5ee]" : "border-black/10 bg-white/55 text-black/62 hover:border-black/25"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <ProjectGrid projects={filteredProjects} />
    </>
  );
}

export function ProjectGrid({ projects: visibleProjects = projects }: { projects?: Project[] }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!gridRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(gridRef.current.querySelectorAll(".project-card"), {
        y: 44,
        autoAlpha: 0,
        duration: 0.8,
        stagger: 0.07,
        ease: "power3.out",
        scrollTrigger: { trigger: gridRef.current, start: "top 76%" },
      });
    },
    { scope: gridRef, dependencies: [visibleProjects.length], revertOnUpdate: true },
  );

  return (
    <div ref={gridRef} className="mx-auto mt-8 grid max-w-[1560px] gap-5 px-5 pb-28 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
      <AnimatePresence mode="popLayout">
        {visibleProjects.map((project, index) => (
          <motion.div
            key={project.slug}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, delay: index * 0.02 }}
          >
            <ProjectCard project={project} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const cardRef = useRef<HTMLElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const card = cardRef.current;
      if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);
      const image = card.querySelector("[data-card-image]");
      const ripple = card.querySelector("[data-ripple]");
      const overlay = card.querySelector("[data-overlay]");

      const enter = safe(() => {
        gsap.to(image, { scale: 1.08, duration: 0.8, ease: "power3.out", overwrite: "auto" });
        gsap.to(overlay, { autoAlpha: 1, duration: 0.35, ease: "power2.out", overwrite: "auto" });
        gsap.fromTo(ripple, { scale: 0.7, autoAlpha: 0.45 }, { scale: 2.6, autoAlpha: 0, duration: 0.85, ease: "power2.out" });
      });
      const leave = safe(() => {
        gsap.to(image, { scale: 1, duration: 0.75, ease: "power3.out", overwrite: "auto" });
        gsap.to(overlay, { autoAlpha: 0, duration: 0.3, ease: "power2.out", overwrite: "auto" });
      });
      const move = safe((event: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        gsap.to(card, {
          y: -6,
          rotateX: (event.clientY - rect.top - rect.height / 2) * -0.01,
          rotateY: (event.clientX - rect.left - rect.width / 2) * 0.01,
          duration: 0.35,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerleave", leave);
      card.addEventListener("pointerleave", safe(() => gsap.to(card, { y: 0, rotateX: 0, rotateY: 0, duration: 0.55, ease: "power3.out", overwrite: "auto" })));
      return () => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerleave", leave);
      };
    },
    { scope: cardRef },
  );

  return (
    <article ref={cardRef} className="project-card group h-full [transform-style:preserve-3d]">
      <div className="h-full overflow-hidden rounded-[2rem] border border-black/10 bg-[#fbf8f1] shadow-2xl shadow-black/[0.08]">
        <Link href={`/projects/${project.slug}`} className="block focus:outline-none focus:ring-2 focus:ring-[#7aa6a7]">
          <div className="relative aspect-[1.14] overflow-hidden bg-stone-200">
            <img data-card-image src={project.image} alt="" className="h-full w-full object-cover will-change-transform" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20" />
            <div data-ripple className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 opacity-0" />
            <div className="absolute left-4 top-4 rounded-full bg-[#f8f5ee]/88 px-3 py-1.5 text-xs font-black text-[#101412] backdrop-blur">
              {project.category}
            </div>
            <div className="absolute right-4 top-4">
              <ScoreBadge score={project.score} size="sm" />
            </div>
            <div data-overlay className="invisible absolute inset-0 flex flex-col justify-between bg-black/62 p-5 text-white opacity-0 backdrop-blur-[2px]">
              <div className="grid gap-2">
                {Object.entries(project.metrics).map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/72">
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/18">
                      <div className="h-full rounded-full bg-[#a7d5d8]" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                {["View Technical Notes", "Review Design", "Open Case Study"].map((label) => (
                  <span key={label} className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-center text-xs font-black backdrop-blur">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Link>
        <div className="p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-black/[0.05] px-3 py-1 text-xs font-bold text-black/58">
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-2xl font-black leading-tight tracking-tight">{project.title}</h3>
          <p className="mt-2 text-sm font-bold text-black/52">{project.style}</p>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black">{project.designer}</p>
              <p className="text-sm text-black/50">{project.country}</p>
            </div>
            <div className="flex gap-2 text-black/42">
              {technicalIcons.slice(0, 3).map((Icon, index) => (
                <Icon key={index} className="h-4 w-4" aria-hidden="true" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function WaterFlowDivider() {
  return (
    <div className="mx-auto my-8 h-24 max-w-[1560px] px-5 lg:px-8">
      <svg className="h-full w-full text-[#4c7177]/30" viewBox="0 0 1400 120" fill="none" aria-hidden="true">
        <motion.path
          d="M0 68C168 12 270 124 442 62C620 -2 731 118 904 58C1081 -4 1216 98 1400 40"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

export function TechnicalSpecTable({ project }: { project: Project }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(project.technical).map(([label, value]) => (
        <div key={label} className="rounded-3xl border border-black/10 bg-white/58 p-5 backdrop-blur">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-black/42">{label}</p>
          <p className="mt-2 text-base font-bold leading-6 text-black/78">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function ReviewPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {reviewRoles.map((review, index) => (
        <article key={review.role} className="rounded-[2rem] border border-black/10 bg-[#fbf8f1]/78 p-6 shadow-xl shadow-black/[0.06] backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#101412] text-sm font-black text-[#f8f5ee]">{index + 1}</div>
            <div>
              <p className="font-black">{review.role}</p>
              <p className="text-sm font-bold text-black/50">Engineer Review</p>
            </div>
            <div className="ml-auto">
              <ScoreBadge score={review.score} size="sm" />
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-black/66">{review.comment}</p>
          {!compact && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-black/42">Pros</p>
                {review.pros.map((item) => (
                  <p key={item} className="mt-2 text-sm font-bold text-black/68">+ {item}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-black/42">Improve</p>
                {review.improvements.map((item) => (
                  <p key={item} className="mt-2 text-sm font-bold text-black/68">- {item}</p>
                ))}
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function GardenStyleCard({ style }: { style: (typeof styleDirectory)[number] }) {
  return (
    <article className="overflow-hidden rounded-[2rem] border border-black/10 bg-[#fbf8f1]/78 shadow-xl shadow-black/[0.06]">
      <div className="aspect-[1.35] overflow-hidden">
        <img src={style.image} alt="" className="h-full w-full object-cover transition duration-700 hover:scale-105" />
      </div>
      <div className="p-5">
        <h3 className="text-2xl font-black">{style.name}</h3>
        <p className="mt-3 min-h-14 text-sm leading-6 text-black/62">{style.description}</p>
        <div className="mt-5 grid gap-3 text-sm">
          <SpecLine label="Materials" value={style.materials} />
          <SpecLine label="Space" value={style.space} />
          <SpecLine label="Difficulty" value={style.difficulty} />
        </div>
      </div>
    </article>
  );
}

export function EngineerCard({ engineer }: { engineer: (typeof engineers)[number] }) {
  return (
    <article className="rounded-[2rem] border border-black/10 bg-white/62 p-5 shadow-xl shadow-black/[0.06] backdrop-blur">
      <div className="flex items-center gap-4">
        <img src={engineer.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
        <div>
          <h3 className="text-xl font-black">{engineer.name}</h3>
          <p className="text-sm font-bold text-black/52">{engineer.role}</p>
        </div>
      </div>
      <div className="mt-5 rounded-3xl bg-[#101412] p-4 text-[#f8f5ee]">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/48">{engineer.badge}</p>
        <p className="mt-2 text-sm leading-6 text-white/72">{engineer.specialty}</p>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Country" value={engineer.country} />
        <MiniStat label="Projects" value={engineer.projectCount} />
        <MiniStat label="Avg" value={engineer.averageScore.toFixed(1)} />
      </div>
    </article>
  );
}

export function SubmitProjectForm() {
  const steps = ["Project", "Technical", "AI & Cost", "Submit"];
  const [step, setStep] = useState(0);
  const fields = [
    ["Project title", "Garden style", "Project category", "Location", "Site area"],
    ["Designer name", "Studio name", "Materials used", "Construction method", "Technical description"],
    ["AI tools used", "Estimated cost", "Maintenance notes", "Water system", "Planting strategy"],
    ["Upload images", "Review notes", "Publication consent", "Engineer contact", "Final statement"],
  ];

  return (
    <div className="rounded-[2.5rem] border border-black/10 bg-[#fbf8f1]/80 p-5 shadow-2xl shadow-black/[0.08] backdrop-blur md:p-8">
      <div className="flex gap-2 overflow-x-auto">
        {steps.map((label, index) => (
          <button
            key={label}
            onClick={() => setStep(index)}
            className={`flex min-w-40 items-center gap-3 rounded-full px-4 py-3 text-sm font-black transition ${
              step === index ? "bg-[#101412] text-[#f8f5ee]" : "bg-black/[0.05] text-black/52"
            }`}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/18">{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <label className="grid min-h-[360px] cursor-pointer place-items-center rounded-[2rem] border border-dashed border-black/20 bg-white/55 p-8 text-center">
          <input type="file" multiple className="sr-only" />
          <div>
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#101412] text-[#f8f5ee]">
              <Mountain className="h-8 w-8" aria-hidden="true" />
            </div>
            <p className="mt-5 text-2xl font-black">Upload garden imagery</p>
            <p className="mt-2 text-sm leading-6 text-black/55">Plans, renderings, site photos, waterfall sections, pond diagrams.</p>
          </div>
        </label>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="grid gap-4"
          >
            {fields[step].map((field, index) => (
              <label key={field} className={index > 1 ? "md:col-span-2" : ""}>
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-black/42">{field}</span>
                {index > 1 ? (
                  <textarea className="min-h-28 w-full rounded-3xl border border-black/10 bg-white/68 p-4 text-sm outline-none transition focus:border-[#4c7177] focus:ring-4 focus:ring-[#7aa6a7]/20" />
                ) : (
                  <input className="h-14 w-full rounded-full border border-black/10 bg-white/68 px-5 text-sm outline-none transition focus:border-[#4c7177] focus:ring-4 focus:ring-[#7aa6a7]/20" />
                )}
              </label>
            ))}
            <div className="mt-2 flex justify-between gap-3">
              <button onClick={() => setStep(Math.max(0, step - 1))} className="rounded-full border border-black/10 px-5 py-3 text-sm font-black text-black/62">
                Back
              </button>
              <button onClick={() => setStep(Math.min(steps.length - 1, step + 1))} className="rounded-full bg-[#101412] px-5 py-3 text-sm font-black text-[#f8f5ee]">
                {step === steps.length - 1 ? "Submit for Review" : "Continue"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function EditorialHero({ eyebrow, title, copy, image }: { eyebrow: string; title: string; copy: string; image?: string }) {
  return (
    <section className="relative z-10 px-5 pb-16 pt-32 lg:px-8 lg:pt-40">
      <div className="mx-auto grid max-w-[1560px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-black/42">{eyebrow}</p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.94] tracking-tight sm:text-7xl lg:text-8xl">{title}</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-black/62">{copy}</p>
        </div>
        {image ? (
          <div className="relative min-h-[360px] overflow-hidden rounded-[2.5rem] border border-black/10 shadow-2xl shadow-black/15">
            <img src={image} alt="" className="h-full min-h-[360px] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#f4f0e8]/30 via-transparent to-white/15" />
          </div>
        ) : (
          <div className="rounded-[2.5rem] border border-black/10 bg-white/50 p-8 shadow-2xl shadow-black/[0.06] backdrop-blur">
            <div className="grid grid-cols-3 gap-3">
              {[Waves, Mountain, Droplets, Leaf, Hammer, MessageCircle].map((Icon, index) => (
                <div key={index} className="grid aspect-square place-items-center rounded-3xl bg-[#101412] text-[#f8f5ee]">
                  <Icon className="h-8 w-8" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function DiscussionList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={item} className="flex gap-4 rounded-3xl border border-black/10 bg-white/58 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#101412] text-xs font-black text-[#f8f5ee]">{index + 1}</div>
          <p className="text-sm font-semibold leading-6 text-black/68">{item}</p>
        </div>
      ))}
    </div>
  );
}

function SpecLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/10 pt-3">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-black/40">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-bold text-black/68">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-black/38">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

export function ToolCard({ title, copy }: { title: string; copy: string }) {
  return (
    <article className="rounded-[2rem] border border-black/10 bg-white/62 p-6 shadow-xl shadow-black/[0.06]">
      <Star className="h-7 w-7 text-[#4c7177]" aria-hidden="true" />
      <h3 className="mt-8 text-2xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-black/62">{copy}</p>
      <div className="mt-6">
        <MagneticButton href="/canvas" dark>
          Open Tool
        </MagneticButton>
      </div>
    </article>
  );
}
