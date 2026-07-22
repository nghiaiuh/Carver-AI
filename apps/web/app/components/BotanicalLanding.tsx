"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Clapperboard, ImagePlus, Rose, Layers, Menu, Wand2, Palette, Sparkles, Banana, X } from "lucide-react";
import { gsap, useGSAP } from "./gsapSetup";
import { buildAuthPageHref, getBrowserAuthClient } from "./auth/authClient";
import { useAuthSession } from "./auth/useAuthSession";
import { getLandingAssetUrl } from "./landingAssetUrl";
import RecentProjectsSection from "./RecentProjectsSection";

const HERO_IMAGE = getLandingAssetUrl("/landing/hero-project-transition.png");
const WINNER_IMAGE = getLandingAssetUrl("/landing/hero-courtyard-reference.png");
const VALUE_IMAGE = getLandingAssetUrl("/landing/value-aerial.webp");
const WORKFLOW_IMAGE = getLandingAssetUrl("/landing/workflow-warm.webp");
const CONTROL_IMAGE = getLandingAssetUrl("/landing/control-blue.webp");
const GALLERY_COLORFUL_IMAGE = getLandingAssetUrl("/landing/gallery-colorful.webp");
const GALLERY_ZEN_IMAGE = getLandingAssetUrl("/landing/gallery-zen.webp");
const GALLERY_TROPICAL_IMAGE = getLandingAssetUrl("/landing/gallery-tropical.webp");
const RAINFOREST_IMAGE = getLandingAssetUrl("/landing/rainforest-courtyard.webp");
const STONE_PATH_IMAGE = getLandingAssetUrl("/landing/stone-path-meditation.webp");
const BRIDGE_PLAN_IMAGE = getLandingAssetUrl("/landing/bridge-landscape-plan.webp");
const FOOTER_CONTOUR_IMAGE = getLandingAssetUrl("/landing/footer-contour-moss.webp");
const BOTANICAL_CORNER_IMAGE = getLandingAssetUrl("/landing/decor/botanical-corner-branch.png");
const BOTANICAL_SPRIG_IMAGE = getLandingAssetUrl("/landing/decor/botanical-vertical-sprig.png");
const BOTANICAL_WREATH_IMAGE = getLandingAssetUrl("/landing/decor/botanical-open-wreath.png");

const modelOptions = [
  { label: "GPT Image 2", Icon: Sparkles },
  { label: "Nano Banana Pro", Icon: Banana },
  { label: "Seedream 5.0", Icon: ImagePlus },
  { label: "Seedance 2.0", Icon: Clapperboard },
  { label: "Design", Icon: Palette },
  { label: "Branding", Icon: Layers },
  { label: "Garden", Icon: Rose },
];
const templateCards = [
  {
    title: "Koi courtyard retreat",
    copy: "Quiet water, tropical layers, and a calm villa approach for premium homeowners.",
    image: WINNER_IMAGE,
    tone: "Featured",
  },
  {
    title: "Japanese moss study",
    copy: "Stone rhythm, restrained greenery, and soft light for elegant minimal sites.",
    image: GALLERY_ZEN_IMAGE,
    tone: "Zen",
  },
  {
    title: "Tropical resort garden",
    copy: "Lush canopy, warm timber, and deeper planting density around outdoor living.",
    image: GALLERY_TROPICAL_IMAGE,
    tone: "Tropical",
  },
  {
    title: "Color-rich courtyard",
    copy: "A brighter, more expressive direction for presentation-ready homeowner concepts.",
    image: GALLERY_COLORFUL_IMAGE,
    tone: "Color",
  },
  {
    title: "Masterplan aerial mood",
    copy: "Use layout-first studies to keep structure clear before moving into details.",
    image: VALUE_IMAGE,
    tone: "Layout",
  },
  {
    title: "Warm evening concept",
    copy: "Golden-hour atmosphere with layered planting for client-facing emotional reviews.",
    image: WORKFLOW_IMAGE,
    tone: "Evening",
  },
  {
    title: "Controlled edit pass",
    copy: "Refine only the approved areas while preserving circulation, scale, and hardscape.",
    image: CONTROL_IMAGE,
    tone: "Refine",
  },
  {
    title: "Rainforest courtyard",
    copy: "Dense tropical layers, reflective water, and a measured stone approach for immersive courtyards.",
    image: RAINFOREST_IMAGE,
    tone: "Tropical",
  },
  {
    title: "Stone path meditation",
    copy: "A quiet sequence of slate, moss, and filtered light for contemplative garden circulation.",
    image: STONE_PATH_IMAGE,
    tone: "Zen",
  },
];

export default function BotanicalLanding() {
  const rootRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuthSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroPrompt, setHeroPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("GPT Image 2");
  const [isPromptFocused, setIsPromptFocused] = useState(false);

  const primaryHref =
    status === "authenticated"
      ? "/canvas"
      : buildAuthPageHref("/register", pathname, "luxury-landing");

  useGSAP(
    () => {
      if (!rootRef.current) return;

      const media = gsap.matchMedia();
      media.add(
        {
          desktop: "(min-width: 768px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { desktop, reduceMotion } = context.conditions as {
            desktop: boolean;
            reduceMotion: boolean;
          };

          if (reduceMotion) {
            gsap.set("[data-intro]", { clearProps: "all" });
            return;
          }

          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .from("[data-nav]", { y: -18, autoAlpha: 0, duration: 0.65 })
            .from(
              "[data-intro='title'] > span",
              { yPercent: 104, autoAlpha: 0, duration: 0.88, stagger: 0.08 },
              "-=0.15",
            )
            .from("[data-intro='copy']", { y: 18, autoAlpha: 0, duration: 0.6 }, "-=0.45")
            .fromTo(
              "[data-intro='actions']",
              { y: 18, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.7, clearProps: "opacity,transform" },
              "-=0.38",
            )
            .from(
              "[data-intro='proof']",
              { y: desktop ? 20 : 12, autoAlpha: 0, duration: 0.62, stagger: 0.06 },
              "-=0.38",
            );

        },
      );

      return () => media.revert();
    },
    { scope: rootRef },
  );

  const handleSignOut = async () => {
    const supabase = getBrowserAuthClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  };

  const handleHeroSubmit = () => {
    const prompt = heroPrompt.trim();
    const destination =
      status === "authenticated"
        ? prompt
          ? `/canvas?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(selectedModel)}`
          : "/canvas"
        : buildAuthPageHref("/register", pathname, "hero-prompt");

    router.push(destination);
  };

  return (
    <main
      ref={rootRef}
      className="botanical-landing min-h-screen overflow-x-hidden bg-[#F4EFE6] text-[#17372A]"
    >
      <header data-nav className="absolute inset-x-0 top-0 z-50 text-white">
        <div className="mx-auto flex h-[92px] max-w-[1520px] items-center justify-between px-5 lg:px-10">
          <Link
            href="/"
            className="botanical-display -translate-y-2 text-[1.85rem] font-medium tracking-[0.06em] text-white"
            aria-label="Carver AI home"
          >
            Carver AI
          </Link>

          <nav className="hidden items-center gap-10 text-[13px] uppercase tracking-[0.18em] text-white/84 md:flex">
            <Link href="#projects" className="transition-colors hover:text-white">
              Projects
            </Link>
            <Link href="#templates" className="transition-colors hover:text-white">
              Templates
            </Link>
            <Link href={primaryHref} className="transition-colors hover:text-white">
              Canvas
            </Link>
            {status === "authenticated" ? (
              <button type="button" onClick={handleSignOut} className="transition-colors hover:text-white">
                Sign out
              </button>
            ) : (
              <Link
                href={buildAuthPageHref("/login", pathname, "luxury-landing")}
                className="transition-colors hover:text-white"
              >
                Login
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/15 backdrop-blur md:hidden"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="mx-4 rounded-[1.5rem] border border-white/12 bg-[#0F1511]/86 px-5 py-5 backdrop-blur-xl md:hidden">
            <div className="grid gap-2 text-sm font-medium text-white">
              <Link href="#projects" onClick={() => setMobileMenuOpen(false)} className="py-2">
                Projects
              </Link>
              <Link href="#templates" onClick={() => setMobileMenuOpen(false)} className="py-2">
                Templates
              </Link>
              <Link href={primaryHref} onClick={() => setMobileMenuOpen(false)} className="py-2">
                Canvas
              </Link>
              <Link
                href={buildAuthPageHref("/login", pathname, "luxury-landing")}
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#F2EFE6] px-5 py-3 text-[#17372A]"
              >
                Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <section className="relative isolate overflow-hidden bg-[#0E1512] text-[#F3F0E7]">
        <img src={HERO_IMAGE} alt="Luxury courtyard landscape" className="absolute inset-0 h-full w-full object-cover object-top" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,13,9,0.42)_0%,rgba(5,13,9,0.50)_48%,rgba(5,13,9,0.14)_74%,rgba(5,13,9,0.08)_100%)]" />

        <div className="relative z-10 mx-auto flex min-h-[50rem] max-w-[1520px] items-center px-5 pb-4 pt-24 sm:min-h-[50rem] sm:pb-6 sm:pt-28 lg:min-h-[44rem] lg:px-10 lg:pb-8 lg:pt-20 xl:min-h-[100svh] xl:pb-12 xl:pt-24">
          <div className="mx-auto flex w-full max-w-[940px] translate-y-1 flex-col items-center text-center sm:translate-y-2 lg:translate-y-0 xl:translate-y-3">
            <h1
              data-intro="title"
              className="botanical-display max-w-[680px] text-[clamp(2.85rem,4.7vw,4.8rem)] font-medium leading-[0.88] tracking-[-0.05em] text-[#F5EFE6]"
            >
              <span className="block overflow-hidden pb-[0.25em]">AI landscape design</span>
              <span className="block overflow-hidden pb-[0.08em]">from real spaces</span>
            </h1>
            <p
              data-intro="copy"
              className="mt-3 max-w-[520px] text-[0.98rem] leading-7 text-[#F5EFE6]/86 sm:text-[1.04rem]"
            >
              Create refined garden concepts that elevate the site while keeping your real layout, pond, and circulation intact.
            </p>

            <div className="mt-6 w-full max-w-[700px]">
              <div
                data-intro="actions"
                className={`rounded-[1.6rem] border border-white/26 px-5 py-4 shadow-[0_20px_48px_rgba(0,0,0,0.16)] transition-colors duration-300 sm:px-6 sm:py-4.5 ${
                  isPromptFocused
                    ? "bg-[rgba(24,20,16,0.07)] backdrop-blur-[8px]"
                    : "bg-[rgba(98,88,79,0.07)] backdrop-blur-[5px]"
                }`}
              >
                <textarea
                  aria-label="Ask Carver AI to design your landscape"
                  placeholder="Ask Carver AI to design your landscape"
                  rows={2}
                  value={heroPrompt}
                  onChange={(event) => setHeroPrompt(event.target.value)}
                  onFocus={() => setIsPromptFocused(true)}
                  onBlur={() => setIsPromptFocused(false)}
                  className="block min-h-[58px] w-full resize-none bg-transparent text-left text-[1rem] leading-8 text-[#F7F2E9] placeholder:text-white/58 outline-none sm:text-[1.05rem]"
                />

                <div className="mt-3 flex items-center justify-between text-[#F7F2E9]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-[rgba(255,255,255,0.10)] text-[#F7F2E9] transition hover:bg-[#F7F2E9] hover:text-[#241F18]"
                      aria-label="Add reference"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-[rgba(255,255,255,0.10)] text-[#F7F2E9] transition hover:bg-[#F7F2E9] hover:text-[#241F18]"
                      aria-label="Lock layout"
                    >
                      <Layers className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="hidden rounded-full border border-white/30 bg-[rgba(255,255,255,0.10)] px-3.5 py-1.5 text-[13px] font-medium text-[#F7F2E9] transition hover:bg-[#F7F2E9] hover:text-[#241F18] sm:inline-flex"
                    >
                      Refine prompt
                      <Wand2 className="ml-1.5 h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleHeroSubmit}
                      className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-[rgba(255,255,255,0.10)] text-[#F7F2E9] transition hover:bg-[#F7F2E9] hover:text-[#241F18]"
                      aria-label="Send prompt"
                    >
                      <ArrowRight className="h-4.5 w-4.5 -rotate-45" />
                    </button>
                  </div>
                </div>
              </div>

              <div
                data-intro="proof"
                className="mx-auto mt-5 flex max-w-[860px] flex-wrap items-center justify-center gap-3 text-[12px] text-white/88"
              >
                {modelOptions.map(({ label, Icon }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    onClick={() => setSelectedModel(label)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm transition ${
                      selectedModel === label
                        ? "border-[#AD8CFF]/72 bg-[#7D60E8]/22 text-[#EFE7FF] shadow-[0_8px_24px_rgba(125,96,232,0.22)]"
                        : "border-white/30 bg-[rgba(255,255,255,0.10)] text-[#F7F2E9] hover:bg-[rgba(255,255,255,0.16)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section id="projects" className="relative z-10 px-3 pb-0 pt-3 sm:px-6 sm:pt-6 lg:px-10 lg:pt-14">
          <div className="relative mx-auto max-w-[1320px] rounded-t-[1.4rem] border border-b-0 border-[#D8CEBE] bg-[#F3EEE4] px-3 py-5 shadow-[0_32px_90px_rgba(4,16,11,0.24)] sm:rounded-t-[1.75rem] sm:px-8 sm:py-11 lg:rounded-t-[2.2rem] lg:px-12 lg:py-14">
            <RecentProjectsSection />
          </div>
        </section>
      </section>

      <div className="relative z-10 flex min-h-[5.5rem] items-center justify-center overflow-hidden bg-[#CBD3C4] px-5 py-3 text-[#17372A] sm:min-h-40 sm:py-5 lg:px-10 lg:py-6">
        <img src={BRIDGE_PLAN_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <p className="relative mx-auto text-center botanical-display text-[clamp(1.25rem,3vw,2rem)] font-medium italic leading-none tracking-[-0.03em] text-[#F7F4EC]">
          From real space to refined direction
        </p>
      </div>

      <section id="templates" data-template-section className="relative z-10 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.9),transparent_42%),#F6F2E9] px-4 py-10 text-[#294539] sm:px-5 sm:py-14 lg:px-10 lg:py-20">
        <img
          src={BOTANICAL_WREATH_IMAGE}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-52 top-[1rem] hidden w-[30rem] rotate-[30deg] opacity-35 lg:block"
        />
        <img
          src={BOTANICAL_CORNER_IMAGE}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 bottom-1 hidden w-[27rem] rotate-[-11deg] opacity-40 lg:block"
        />
        <div className="relative mx-auto max-w-[1320px]">
          <div className="flex items-end justify-between gap-5 border-b border-[#294539]/15 pb-4">
            <div>
              <h2 className="botanical-display text-[clamp(1.7rem,2.5vw,2.45rem)] font-medium leading-none tracking-[-0.04em] text-[#294539]">Nominees</h2>
              <p className="mt-2 text-xs text-[#294539]/58">Top community picks this month.</p>
            </div>
            <Link href={primaryHref} className="mb-1 hidden items-center gap-2 text-xs font-semibold text-[#59715D] transition hover:text-[#294539] sm:inline-flex">
              View all nominees <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-4">
            {templateCards.slice(1, 5).map(({ title, image, tone }, index) => (
              <article
                key={title}
                className="group overflow-hidden rounded-[0.65rem] border border-[#294539]/12 bg-[#FCFAF5]/72 transition hover:-translate-y-1 hover:bg-[#FFFEFA] hover:shadow-[0_14px_28px_rgba(41,69,57,0.08)]"
              >
                <div className="relative aspect-[1.55] overflow-hidden">
                  <img
                    src={image}
                    alt={title}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
                  />
                  <span className="absolute left-2 top-2 rounded-full border border-[#294539]/12 bg-[#F8F5ED]/95 px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-[#294539]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="p-2 sm:p-2.5">
                  <div>
                    <h3 className="botanical-display text-[0.92rem] font-medium leading-none tracking-[-0.03em] text-[#294539] sm:text-[1.1rem]">{title}</h3>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between sm:mt-2">
                    <span className="rounded-full border border-[#294539]/10 bg-[#F6F2E9] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[#59715D]">{tone}</span>
                    <span className="text-[11px] text-[#294539]/45">&#9825; {128 - index * 11}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="relative mt-6 border-y border-[#294539]/15 py-6 sm:mt-8 sm:py-10">
            <div className="flex items-end justify-between gap-5 pb-4">
              <div>
                <h2 className="botanical-display text-[clamp(1.7rem,2.5vw,2.45rem)] font-medium leading-none tracking-[-0.04em] text-[#294539]">Winner project of the month</h2>
                <p className="mt-2 text-xs text-[#294539]/58">Community voted. Crafted with vision.</p>
              </div>
            </div>
          <img src={BOTANICAL_CORNER_IMAGE} alt="" aria-hidden="true" className="pointer-events-none absolute -left-[13rem] top-[6rem] hidden w-72 -scale-x-100 opacity-50 lg:block" />
          <img src={BOTANICAL_WREATH_IMAGE} alt="" aria-hidden="true" className="pointer-events-none absolute -right-32 top-1/2 hidden w-80 -translate-y-1/2 opacity-46 lg:block" />
            <div className="relative mx-auto grid max-w-[1180px] grid-cols-[1.08fr_0.92fr] items-center gap-3 rounded-[0.9rem] border border-[#294539]/12 bg-[#FCFAF5] p-2 sm:grid-cols-[1.18fr_0.92fr_0.56fr] sm:gap-5 sm:p-4">
              <div className="relative aspect-[1.2] overflow-hidden rounded-[0.6rem] sm:aspect-[1.48]">
                <img src={templateCards[0].image} alt="Koi courtyard retreat" className="h-full w-full object-cover" />
                <span className="absolute left-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-[#EED9A7]/55 bg-[#A88A50]/90 text-[8px] font-bold uppercase tracking-[0.12em] text-white">Winner</span>
              </div>
              <div className="px-2 py-1 sm:px-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#59715D] sm:text-[11px] sm:tracking-[0.18em]">June 2026</p>
                <h2 className="botanical-display mt-1.5 text-[1.55rem] font-medium leading-[0.92] tracking-[-0.045em] text-[#294539] sm:mt-2 sm:text-[clamp(2rem,3vw,3rem)]">Koi courtyard retreat</h2>
                <p className="mt-3 text-sm leading-6 text-[#294539]/62">“A calm sequence of water, stone, and verdant layers that frames everyday life as a quiet ritual.”</p>
                <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#59715D]"><span className="h-5 w-5 rounded-full bg-[#486044]" /> Designed by Garden Studio</p>
                <Link href={primaryHref} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#A88A50] px-3 py-2 text-[10px] font-bold text-white transition hover:bg-[#8E733F] sm:mt-5 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs">
                  View project <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative hidden aspect-[0.82] overflow-hidden rounded-[0.55rem] sm:block">
                <img src={GALLERY_TROPICAL_IMAGE} alt="Winner detail" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>

          <div className="relative mt-6 flex flex-col gap-3 border-b border-[#294539]/15 pb-4 sm:mt-9 sm:gap-5 sm:flex-row sm:items-end sm:justify-between">
            <img src={BOTANICAL_SPRIG_IMAGE} alt="" aria-hidden="true" className="pointer-events-none absolute -right-20 -top-10 hidden h-80 w-auto -scale-x-100 -rotate-[-20deg] opacity-60 xl:block" />
            <img src={BOTANICAL_SPRIG_IMAGE} alt="" aria-hidden="true" className="pointer-events-none absolute -left-24 top-24 hidden h-72 w-auto -rotate-[18deg] opacity-34 xl:block" />
            <div>
              <h2 className="botanical-display text-[clamp(1.7rem,2.5vw,2.45rem)] font-medium leading-none tracking-[-0.04em] text-[#294539]">Inspiration</h2>
              <p className="mt-2 text-xs text-[#294539]/58">Explore styles and spark new ideas.</p>
            </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {["All", "Courtyard", "Tropical", "Zen", "Night"].map((filter, index) => (
                <button key={filter} type="button" className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-[10px] ${index === 0 ? "border-[#294539] bg-[#294539] text-[#F7F4EC]" : "border-[#294539]/12 bg-[#FCFAF5]/65 text-[#294539]/62 hover:bg-white"}`}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-4">
            {templateCards.slice(1).map(({ title, image, tone }, index) => (
              <article key={title} className="group overflow-hidden rounded-[0.65rem] border border-[#294539]/12 bg-[#FCFAF5]/72 transition hover:-translate-y-1 hover:bg-[#FFFEFA] hover:shadow-[0_14px_28px_rgba(41,69,57,0.07)]">
                <div className="relative aspect-[1.55] overflow-hidden">
                  <img src={image} alt={title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <span className="absolute left-2 top-2 rounded-full border border-[#294539]/12 bg-[#F8F5ED]/95 px-2 py-0.5 text-[9px] font-bold text-[#294539]">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="p-2 sm:p-2.5">
                  <h3 className="botanical-display text-[0.92rem] font-medium leading-none tracking-[-0.03em] text-[#294539] sm:text-[1.08rem]">{title}</h3>
                  <div className="mt-1.5 flex items-center justify-between sm:mt-2">
                    <span className="rounded-full border border-[#294539]/10 bg-[#F6F2E9] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[#59715D]">{tone}</span>
                    <span className="text-[11px] text-[#294539]/45">&#9825; {142 - index * 9}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 text-center sm:mt-7">
            <Link href={primaryHref} className="inline-flex items-center gap-2 rounded-full border border-[#294539]/12 bg-[#EEE9DE] px-5 py-2.5 text-xs font-bold text-[#294539] transition hover:bg-white">
              Browse more inspiration <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden bg-[#080D0B] px-5 pb-8 pt-9 text-[#F5F0E5] sm:pt-14 lg:px-10 lg:pt-16">
        <img src={FOOTER_CONTOUR_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(149, 154, 152, 0.1),rgba(8,13,11,0.78))]" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#D5E0C7]/10" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-[#64795E]/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1480px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b border-white/12 pb-8 md:grid-cols-[1.35fr_0.7fr_0.7fr_0.9fr] md:gap-12 md:pb-14">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="botanical-display text-[2rem] font-medium tracking-[-0.04em] sm:text-4xl">Carver AI</Link>
              <p className="mt-5 max-w-sm text-sm leading-7 text-white/58">AI landscape design for real spaces, built around controlled composition and the details worth preserving.</p>
              <Link href={primaryHref} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#E7EEE0] px-5 py-3 text-sm font-bold text-[#17372A] transition hover:bg-white">
                Open your canvas <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/42">Explore</p>
              <div className="mt-5 flex flex-col gap-3 text-sm text-white/72">
                <Link href="#projects" className="transition hover:text-white">Projects</Link>
                <Link href="#templates" className="transition hover:text-white">Inspiration</Link>
                <Link href={primaryHref} className="transition hover:text-white">Canvas</Link>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/42">Studio</p>
              <div className="mt-5 flex flex-col gap-3 text-sm text-white/72">
                <Link href="/styles" className="transition hover:text-white">Styles</Link>
                <Link href="/reviews" className="transition hover:text-white">Reviews</Link>
                <Link href="/ai-tools" className="transition hover:text-white">AI tools</Link>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/42">Design notes</p>
              <p className="mt-5 text-sm leading-7 text-white/58">Keep the house, pond, paths, perspective, and planting logic intact while exploring the next version.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-6 text-xs text-white/42 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Carver AI. Designed for real landscapes.</span>
            <span>Ho Chi Minh City, Vietnam</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
