"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowUpRight, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { gsap, useGSAP } from "../../components/gsapSetup";
import type { Project } from "../../gallery/data/galleryData";

/* ─────────────────────────────────────────────────────────── */
/*  Background / cursor decorations (shared with GalleryShell) */
/* ─────────────────────────────────────────────────────────── */

export function ContourBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden opacity-60">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(122,166,167,0.12),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(139,130,114,0.09),transparent_26%),linear-gradient(180deg,#f5f2ef,#ece6dc)]" />
    </div>
  );
}

export function RippleCursor() {
  const rippleRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const ripple = rippleRef.current;
      if (!ripple || window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);
      const xTo = gsap.quickTo(ripple, "x", { duration: 0.45, ease: "power3" });
      const yTo = gsap.quickTo(ripple, "y", { duration: 0.45, ease: "power3" });
      const onMove = safe((event: PointerEvent) => {
        xTo(event.clientX - 18);
        yTo(event.clientY - 18);
      });
      window.addEventListener("pointermove", onMove);
      return () => window.removeEventListener("pointermove", onMove);
    },
    { scope: rippleRef },
  );

  return <div ref={rippleRef} className="pointer-events-none fixed left-0 top-0 z-[90] hidden h-9 w-9 rounded-full border border-[#4c7177]/35 mix-blend-multiply md:block" />;
}

/* ─────────────────────────────────────────────────────────── */
/*  Main client component                                      */
/* ─────────────────────────────────────────────────────────── */

type Tab = "Info" | "Elements" | "Method" | "Scores";
const TABS: Tab[] = ["Info", "Elements", "Method", "Scores"];

export function ProjectDetailClient({ project }: { project: Project }) {
  const [activeTab, setActiveTab] = useState<Tab>("Info");

  // Simulate a few "screenshots" from the same hero image
  const screenshots = [
    { label: "Hero View", img: project.image },
    { label: "Design Overview", img: project.image },
    { label: "Technical Detail", img: project.image },
    { label: "Final Output", img: project.image },
    { label: "Material Study", img: project.image },
  ];

  return (
    <div className="relative min-h-screen bg-[#f2f0ed] font-sans text-[#222222] isolate">
      <ContourBackground />
      <RippleCursor />

      {/* ── Sticky top bar ── */}
      <header className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-white px-5 py-3" style={{ height: 60 }}>
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="shrink-0 text-[11px] font-black uppercase tracking-[0.22em] text-[#222222] transition-colors hover:text-black">
            ← Back
          </Link>
          <span className="text-black/18">|</span>
          <span className="hidden truncate text-sm font-bold sm:block ">{project.title}</span>
          <span className="hidden items-center gap-1.5 text-xs text-[#222222]/70 lg:flex">
            <span className="text-[#222222]/50">by</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 font-bold text-[#222222] shadow-sm">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#101412] text-[8px] font-black text-white">
                {project.designer[0]}
              </span>
              {project.designer}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {[
            { icon: Bookmark, label: "Bookmark" },
            { icon: Share2, label: "Share" },
            { icon: ExternalLink, label: "Open externally" },
          ].map(({ icon: Icon, label }) => (
            <button key={label} className="grid h-9 w-9 place-items-center rounded-full text-[#222222]/80 transition hover:bg-black/6 hover:text-black" aria-label={label}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </header>

      {/* ── Page body ── */}
      <main className="pb-32 pt-[52px]">

        {/* ═══ Hero ═══ */}
        <div className="mx-auto max-w-[960px] px-5 pt-14 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-[#222222]/70">
            {project.category}&nbsp;·&nbsp;{project.location}
          </p>
          <h1 className="mt-4 text-[clamp(2.4rem,7vw,5.2rem)] font-black leading-[0.92] tracking-tight">
            {project.title}
          </h1>

          {/* Creator chips */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {[
              { initial: project.designer[0], name: project.designer, color: "#101412" },
              { initial: project.engineer[0], name: project.engineer, color: "#4c7177" },
            ].map(({ initial, name, color }) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold shadow-sm"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-black text-white"
                  style={{ background: color }}
                >
                  {initial}
                </span>
                {name}
              </span>
            ))}
            {/* Score badge */}
            <span className="grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-[#101412] text-base font-black text-[#f8f5ee] shadow-md">
              {project.score.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Full-width hero image */}
        <div className="mx-auto mt-8 max-w-[1400px] px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-[1.25rem]">
            <img
              src={project.image}
              alt={project.title}
              className="h-[540px] w-full object-cover sm:h-[660px] lg:h-[810px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/38 via-transparent to-transparent" />
            {/* Floating score */}
            <div className="absolute bottom-5 right-5 rounded-xl bg-black/65 px-4 py-2 text-white backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Overall Score</p>
              <p className="text-2xl font-black">{project.score.toFixed(1)}</p>
            </div>
            {/* Category chip */}
            <div className="absolute left-5 top-5 rounded-full bg-white/88 px-4 py-1.5 text-xs font-black text-[#101412] backdrop-blur">
              {project.category}
            </div>
          </div>
        </div>

        {/* Centered description */}
        <div className="mx-auto mt-14 max-w-[720px] px-5 text-center">
          <p className="text-[1.18rem] font-medium leading-[1.8] text-[#222222]">
            {project.style} — a garden scored as an engineered landscape system. The detail view captures
            material decisions, water logic, stone arrangement, maintenance level, and construction risk
            across {project.location}.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {project.tags.map((tag) => (
              <span key={tag} className="cursor-default rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-bold text-[#222222]/90 shadow-sm transition-colors hover:border-black/22">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <Divider />

        {/* ═══ Elements (screenshot gallery) ═══ */}
        <SectionWrapper>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#4c7177]">Elements</p>
          <h2 className="mt-3 max-w-[320px] text-4xl font-black leading-tight">
            See the highlights of this project.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {screenshots.slice(0, 4).map((s, i) => (
              <ScreenshotCard key={i} label={s.label} img={s.img} />
            ))}
          </div>
          {screenshots[4] && (
            <div className="mt-4 sm:max-w-[320px]">
              <ScreenshotCard label={screenshots[4].label} img={screenshots[4].img} />
            </div>
          )}
        </SectionWrapper>

        <Divider />

        {/* ═══ Technical Specs ═══ */}
        <SectionWrapper>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#222222]/80">Technical Specs</p>
          <h2 className="mt-3 text-3xl font-black">Built with these materials &amp; methods.</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(project.technical).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#222222]/60">{label}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-[#222222]">{value}</p>
              </div>
            ))}
          </div>

          {/* Tags / tech bubbles */}
          <div className="mt-12 text-center">
            <p className="text-sm text-[#222222]">This project was built with…</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <span className="h-8 w-8 rounded-full bg-[#6c5ce7]" />
              <span className="h-8 w-8 rounded-full border-2 border-black/12 bg-white" />
              {[project.style, ...project.tags].map((tag) => (
                <span key={tag} className="cursor-default rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold text-[#222222] shadow-sm transition-colors hover:border-black/22">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </SectionWrapper>

        <Divider />

        {/* ═══ Method + Creativity ═══ */}
        <SectionWrapper>
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#222222]/80">Design Method</p>
              <h2 className="mt-3 text-3xl font-black">How this garden was designed.</h2>
              <ol className="mt-7 grid gap-3">
                {project.method.map((item, i) => (
                  <li key={item} className="flex gap-4 rounded-2xl border border-black/8 bg-white p-4 shadow-sm">
                    <span className="shrink-0 font-black text-[#4c7177]">{String(i + 1).padStart(2, "0")}</span>
                    <p className="text-sm font-semibold leading-6 text-[#222222]">{item}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#222222]/80">Creativity</p>
              <h2 className="mt-3 text-3xl font-black">Creative choices that define it.</h2>
              <ol className="mt-7 grid gap-3">
                {project.creativity.map((item, i) => (
                  <li key={item} className="flex gap-4 rounded-2xl border border-black/8 bg-white p-4 shadow-sm">
                    <span className="shrink-0 font-black text-[#4c7177]">{String(i + 1).padStart(2, "0")}</span>
                    <p className="text-sm font-semibold leading-6 text-[#222222]">{item}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </SectionWrapper>

        <Divider />

        {/* ═══ Scores / Votes ═══ */}
        <SectionWrapper>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.28em] text-[#222222]/80">
                Votes ({project.reviews})
              </span>
              <h2 className="mt-3 text-3xl font-black">Community Members</h2>
            </div>
          </div>

          {/* Votes table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-black/8">
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wider text-[#222222]/80">Member</th>
                  {Object.keys(project.metrics).map((m) => (
                    <th key={m} className="px-3 pb-3 text-center text-xs font-bold text-[#222222]/80">{m}</th>
                  ))}
                  <th className="pb-3 pl-3 text-center text-xs font-black text-black">Overall</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: project.designer, from: project.country },
                  { name: project.engineer, from: "Engineer" },
                  { name: "Community Reviewer", from: "International" },
                ].map((row, i) => {
                  const vals = Object.values(project.metrics);
                  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length / 10).toFixed(2);
                  return (
                    <tr key={i} className="border-b border-black/6 transition-colors hover:bg-black/[0.015]">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7aa6a7] to-[#4c7177] text-xs font-black text-white">
                            {row.name[0]}
                          </div>
                          <div>
                            <p className="font-bold">{row.name}</p>
                            <p className="text-xs text-[#222222]/70">from {row.from}</p>
                          </div>
                        </div>
                      </td>
                      {Object.values(project.metrics).map((val, mi) => (
                        <td key={mi} className="px-3 py-4 text-center font-bold text-[#4c7177]">
                          {Math.round(val / 10)}
                        </td>
                      ))}
                      <td className="py-4 pl-3 text-center">
                        <span className="inline-block rounded-lg bg-[#f0efec] px-3 py-1 text-sm font-black">{avg}</span>
                      </td>
                    </tr>
                  );
                })}
                {/* Locked / blurred row */}
                <tr className="border-b border-black/6 opacity-35">
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/10 text-xs font-black text-black/30">?</div>
                      <div>
                        <p className="font-bold text-black/30">More Reviewers</p>
                        <p className="text-xs text-black/22">from Various</p>
                      </div>
                    </div>
                  </td>
                  {Object.values(project.metrics).map((_, mi) => (
                    <td key={mi} className="px-3 py-4 text-center">
                      <span className="inline-block h-2 w-5 rounded bg-black/10" />
                    </td>
                  ))}
                  <td className="py-4 pl-3 text-center">
                    <button className="inline-flex items-center justify-center rounded-full border border-black/12 px-3 py-1 text-xs font-bold text-black/30">
                      •••
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Metric gauge cards */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(project.metrics).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-black/8 bg-white p-5 text-center shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#222222]/60">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/8">
                  <motion.div
                    className="h-full rounded-full bg-[#4c7177]"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${value}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionWrapper>

        <Divider />

        {/* ═══ Discussion ═══ */}
        <SectionWrapper>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#222222]/80">Discussion</p>
          <h2 className="mt-3 text-3xl font-black">Designers debate strengths, risks &amp; alternatives.</h2>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {project.discussion.map((item, i) => (
              <div key={item} className="flex gap-4 rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#101412] text-xs font-black text-[#f8f5ee]">
                  {i + 1}
                </div>
                <p className="text-sm font-semibold leading-6 text-[#222222]">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/reviews" className="inline-flex items-center gap-2 rounded-full bg-[#101412] px-5 py-3 text-sm font-black text-[#f8f5ee] shadow-xl shadow-black/20 transition hover:opacity-90">
              Open Reviews
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link href="/submit" className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white px-5 py-3 text-sm font-black shadow-sm transition hover:bg-black/4">
              Submit Similar Work
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </SectionWrapper>
      </main>

      {/* ── Fixed bottom bar (Awwwards-style) ── */}
      <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-[#1a1a1a]/90 px-1.5 py-1.5 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <Link href="/" className="mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-[#101412]">
            C.
          </Link>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-10 rounded-full px-4 text-sm font-bold transition-all ${activeTab === tab ? "bg-[#e8dcc5] text-[#101412]" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
            >
              {tab}
            </button>
          ))}
          <Link
            href={`/projects/${project.slug}`}
            className="ml-1 flex h-10 items-center gap-1.5 rounded-full bg-[#e6d84a] px-4 text-sm font-black text-[#111] transition hover:brightness-105"
          >
            View Full
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Divider() {
  return <hr className="mx-auto my-16 max-w-[1024px] border-black/8 px-5" />;
}

function SectionWrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1400px] px-4 sm:px-6">{children}</div>;
}

function ScreenshotCard({ label, img }: { label: string; img: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-black/8 bg-white shadow-md transition-shadow hover:shadow-xl">
      <img src={img} alt={label} className="h-[200px] w-full object-cover transition duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/58 via-transparent to-transparent p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">{label}</span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 backdrop-blur">
            <ArrowUpRight className="h-3.5 w-3.5 text-white" />
          </span>
        </div>
      </div>
    </div>
  );
}
