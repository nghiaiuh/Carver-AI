"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Brush,
  Check,
  HardHat,
  Layers,
  Leaf,
  Menu,
  MousePointer2,
  PenTool,
  ScanLine,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "./gsapSetup";
import { buildAuthPageHref, getBrowserAuthClient } from "./auth/authClient";
import { useAuthSession } from "./auth/useAuthSession";
import RecentProjectsSection from "./RecentProjectsSection";

const SITE_IMAGE =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88";
const GARDEN_IMAGE =
  "https://images.unsplash.com/photo-1660232370139-d38f527522fe?q=88&w=1800&auto=format&fit=crop";
const TROPICAL_IMAGE =
  "https://images.unsplash.com/photo-1654077842967-1af3695ba1b6?q=88&w=1400&auto=format&fit=crop";
const STUDIO_IMAGE =
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=88";

const processSteps = [
  {
    number: "01",
    title: "Phác thảo ý tưởng",
    copy: "Đặt ảnh hiện trạng, sketch bố cục và kết nối các hình tham chiếu ngay trên một canvas trực quan.",
    Icon: PenTool,
  },
  {
    number: "02",
    title: "Chỉnh sửa theo vùng",
    copy: "Dùng Region Brush để chỉ rõ vùng được thay đổi. Nhà, lối đi, hồ và góc máy vẫn được bảo toàn.",
    Icon: Brush,
  },
  {
    number: "03",
    title: "Trực quan hóa",
    copy: "AI chuyển brief thiết kế thành phối cảnh thuyết phục, đủ rõ để trao đổi với khách hàng và đội thi công.",
    Icon: Sparkles,
  },
];

const audiences = [
  {
    eyebrow: "Cho studio thiết kế",
    title: "Tăng tốc thử nghiệm, không đánh đổi chủ đích thiết kế.",
    copy: "Khám phá nhiều phương án vật liệu, cây trồng và phong cách trong khi giữ nguyên cấu trúc không gian quan trọng.",
    points: ["Brief theo từng vùng", "Tham chiếu trực tiếp trên canvas", "Lưu phiên bản để so sánh"],
    image: TROPICAL_IMAGE,
    Icon: Layers,
  },
  {
    eyebrow: "Cho đơn vị thi công",
    title: "Biến ý tưởng thành một hình ảnh mà cả đội cùng hiểu.",
    copy: "Diễn giải nhanh phương án cho chủ đầu tư, làm rõ phạm vi thay đổi và giảm vòng lặp chỉnh sửa trước khi triển khai.",
    points: ["Phối cảnh bám sát hiện trạng", "Vùng giữ nguyên rõ ràng", "Trao đổi phương án nhanh hơn"],
    image: STUDIO_IMAGE,
    Icon: HardHat,
  },
];

export default function BotanicalLanding() {
  const rootRef = useRef<HTMLElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useAuthSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<0 | 1 | 2>(2);

  const primaryHref =
    status === "authenticated"
      ? "/canvas"
      : buildAuthPageHref("/register", pathname, "botanical-landing");

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
            gsap.set("[data-intro], [data-reveal]", { clearProps: "all" });
            return;
          }

          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .from("[data-nav]", { y: -20, autoAlpha: 0, duration: 0.7 })
            .from("[data-intro='eyebrow']", { y: 18, autoAlpha: 0, duration: 0.55 }, "-=0.25")
            .from(
              "[data-intro='title'] > span",
              { yPercent: 105, autoAlpha: 0, duration: 0.9, stagger: 0.08 },
              "-=0.25",
            )
            .from(
              "[data-intro='canvas']",
              { y: desktop ? 52 : 28, scale: 0.98, autoAlpha: 0, duration: 1.05 },
              "-=0.45",
            );

          ScrollTrigger.batch("[data-reveal]", {
            start: "top 86%",
            once: true,
            interval: 0.08,
            batchMax: desktop ? 3 : 1,
            onEnter: (elements) => {
              gsap.fromTo(
                elements,
                { y: 36, autoAlpha: 0 },
                { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1, ease: "power3.out" },
              );
            },
          });

          gsap.to("[data-parallax-leaf]", {
            y: desktop ? -80 : -30,
            rotation: desktop ? 8 : 3,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-process-section]",
              start: "top bottom",
              end: "bottom top",
              scrub: 1,
            },
          });

        },
      );

      return () => media.revert();
    },
    { scope: rootRef },
  );

  useGSAP(
    () => {
      const demo = demoRef.current;
      if (!demo) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const sketch = demo.querySelector("[data-demo-sketch]");
      const mask = demo.querySelector("[data-demo-mask]");
      const result = demo.querySelector("[data-demo-result]");
      const scan = demo.querySelector("[data-demo-scan]");

      gsap.to(sketch, {
        autoAlpha: demoMode === 0 ? 1 : demoMode === 1 ? 0.42 : 0,
        duration: reducedMotion ? 0 : 0.45,
      });
      gsap.to(mask, {
        autoAlpha: demoMode === 1 ? 1 : 0,
        scale: demoMode === 1 ? 1 : 0.96,
        duration: reducedMotion ? 0 : 0.55,
        ease: "power3.out",
      });
      gsap.to(result, {
        clipPath: demoMode === 2 ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)",
        duration: reducedMotion ? 0 : 0.9,
        ease: "power3.inOut",
      });
      gsap.to(scan, {
        xPercent: demoMode === 2 ? 0 : -100,
        autoAlpha: demoMode === 2 ? 1 : 0,
        duration: reducedMotion ? 0 : 0.9,
        ease: "power3.inOut",
      });
    },
    { scope: demoRef, dependencies: [demoMode], revertOnUpdate: true },
  );

  const handleSignOut = async () => {
    const supabase = getBrowserAuthClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <main
      ref={rootRef}
      className="botanical-landing min-h-screen overflow-hidden bg-[#F3F0E7] text-[#17372A] [--botanical-ink:#17372A] [--botanical-lime:#C7F36B] [--botanical-moss:#62755B] [--botanical-sage:#A8B7A2]"
    >
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] [background-image:url('data:image/svg+xml,%3Csvg_viewBox=%220_0_180_180%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter_id=%22n%22%3E%3CfeTurbulence_type=%22fractalNoise%22_baseFrequency=%22.85%22_numOctaves=%224%22_stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect_width=%22100%25%22_height=%22100%25%22_filter=%22url(%23n)%22_opacity=%22.8%22/%3E%3C/svg%3E')]" />

      <header data-nav className="relative z-50 border-b border-[#17372A]/12 bg-[#F3F0E7]">
        <div className="mx-auto flex h-[76px] max-w-[1480px] items-center justify-between px-5 lg:px-10">
          <Link href="/" className="group inline-flex items-center gap-3" aria-label="Carver AI home">
            <span className="relative grid h-9 w-9 place-items-center rounded-full border border-[#17372A]/20 bg-[#17372A] text-[#F3F0E7]">
              <Leaf className="h-4 w-4 transition-transform duration-500 group-hover:-rotate-12" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#C7F36B]" />
            </span>
            <span className="botanical-display text-[1.45rem] font-semibold tracking-[-0.035em]">Carver AI</span>
          </Link>

          <nav className="hidden items-center gap-8 text-[13px] font-semibold tracking-[0.01em] md:flex" aria-label="Điều hướng chính">
            <Link href="#workflow" className="transition-colors hover:text-[#62755B]">Quy trình</Link>
            <Link href="#for-whom" className="transition-colors hover:text-[#62755B]">Dành cho ai</Link>
            <Link href="#projects" className="transition-colors hover:text-[#62755B]">Dự án</Link>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {status === "authenticated" ? (
              <button type="button" onClick={handleSignOut} className="px-3 py-2 text-sm font-semibold text-[#17372A]/65 transition hover:text-[#17372A]">
                Đăng xuất
              </button>
            ) : (
              <Link href={buildAuthPageHref("/login", pathname, "botanical-landing")} className="px-3 py-2 text-sm font-semibold text-[#17372A]/65 transition hover:text-[#17372A]">
                Đăng nhập
              </Link>
            )}
            <Link href={primaryHref} className="group inline-flex items-center gap-2 rounded-full bg-[#17372A] px-5 py-3 text-sm font-semibold text-[#F8F6EF] transition hover:bg-[#244D3A]">
              {status === "authenticated" ? "Mở canvas" : "Dùng thử miễn phí"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>

          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full border border-[#17372A]/15 md:hidden" aria-label="Mở menu" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-[#17372A]/10 bg-[#F3F0E7]/95 px-5 py-5 backdrop-blur-xl md:hidden">
            <div className="grid gap-2 text-sm font-semibold">
              <Link href="#workflow" onClick={() => setMobileMenuOpen(false)} className="py-2">Quy trình</Link>
              <Link href="#for-whom" onClick={() => setMobileMenuOpen(false)} className="py-2">Dành cho ai</Link>
              <Link href="#projects" onClick={() => setMobileMenuOpen(false)} className="py-2">Dự án</Link>
              <Link href={primaryHref} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#17372A] px-5 py-3 text-[#F8F6EF]">
                {status === "authenticated" ? "Mở canvas" : "Dùng thử miễn phí"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <section className="relative z-10 px-5 pb-20 pt-16 sm:pt-20 lg:px-10 lg:pb-32 bg-[#F3F0E7] bg-[url('/assets/bg.png')] bg-[length:auto_100%] bg-right bg-no-repeat">
        <div className="mx-auto max-w-[1480px]">
          <div>
            <div data-intro="eyebrow" className="mb-7 inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#62755B]">
              <span className="h-px w-10 bg-[#62755B]" />
              AI Landscape Design Studio
            </div>
            <h1 data-intro="title" className="botanical-display max-w-[900px] text-[clamp(3.4rem,8vw,7.8rem)] font-medium leading-[0.84] tracking-[-0.062em]">
              <span className="block overflow-hidden pb-[0.08em]">Từ nét phác thảo</span>
              <span className="block overflow-hidden pb-[0.12em] italic text-[#62755B]">đến khu vườn</span>
              <span className="block overflow-hidden pb-[0.08em]">thuyết phục.</span>
            </h1>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-5 pb-20 pt-6 lg:px-10 lg:pb-32 bg-[#F3F0E7]">
        <div className="mx-auto max-w-[1480px]">
          <div data-intro="canvas">
            <HeroCanvas ref={demoRef} mode={demoMode} onModeChange={setDemoMode} />
          </div>
        </div>
      </section>

      <section id="workflow" data-process-section className="relative z-10 border-y border-[#17372A]/12 bg-[#E8E9DD] px-5 py-24 lg:px-10 lg:py-32">
        <BotanicalLineArt />
        <div className="relative mx-auto max-w-[1480px]">
          <SectionHeading eyebrow="Một quy trình có kiểm soát" title="Ý tưởng tự nhiên. Quy trình chính xác." />
          <div className="mt-16 grid border-l border-t border-[#17372A]/15 md:grid-cols-3">
            {processSteps.map(({ number, title, copy, Icon }) => (
              <article key={number} data-reveal className="group relative min-h-[360px] border-b border-r border-[#17372A]/15 p-7 sm:p-9">
                <div className="flex items-start justify-between">
                  <span className="botanical-display text-lg italic text-[#62755B]">{number}</span>
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-[#17372A]/20 transition duration-500 group-hover:-rotate-6 group-hover:bg-[#C7F36B]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-24">
                  <h3 className="botanical-display text-3xl font-medium tracking-[-0.035em] sm:text-4xl">{title}</h3>
                  <p className="mt-5 max-w-sm text-sm leading-7 text-[#17372A]/62">{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="for-whom" className="relative z-10 px-5 py-24 lg:px-10 lg:py-36">
        <div className="mx-auto max-w-[1480px]">
          <SectionHeading eyebrow="Thiết kế để cộng tác" title="Một công cụ. Hai góc nhìn chuyên nghiệp." align="right" />
          <div className="mt-16 grid gap-7 lg:grid-cols-2">
            {audiences.map(({ eyebrow, title, copy, points, image, Icon }, index) => (
              <article key={eyebrow} data-reveal className={`overflow-hidden rounded-[2rem] border border-[#17372A]/12 ${index === 0 ? "bg-[#17372A] text-[#F3F0E7]" : "bg-[#E8E9DD]"}`}>
                <div className="relative aspect-[1.45] overflow-hidden">
                  <img src={image} alt="Không gian sân vườn được thiết kế bằng Carver AI" className="h-full w-full object-cover transition duration-1000 hover:scale-[1.035]" />
                  <div className={`absolute inset-0 ${index === 0 ? "bg-gradient-to-t from-[#17372A]/65 to-transparent" : "bg-gradient-to-t from-[#E8E9DD]/35 to-transparent"}`} />
                  <div className="absolute left-6 top-6 grid h-12 w-12 place-items-center rounded-full bg-[#C7F36B] text-[#17372A]">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="p-7 sm:p-10">
                  <p className={`text-[11px] font-bold uppercase tracking-[0.24em] ${index === 0 ? "text-[#C7F36B]" : "text-[#62755B]"}`}>{eyebrow}</p>
                  <h3 className="botanical-display mt-5 max-w-xl text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-5xl">{title}</h3>
                  <p className={`mt-6 max-w-xl text-sm leading-7 ${index === 0 ? "text-white/62" : "text-[#17372A]/62"}`}>{copy}</p>
                  <div className={`mt-8 border-t ${index === 0 ? "border-white/15" : "border-[#17372A]/15"}`}>
                    {points.map((point) => (
                      <div key={point} className={`flex items-center gap-3 border-b py-3.5 text-sm font-medium ${index === 0 ? "border-white/15" : "border-[#17372A]/15"}`}>
                        <Check className={`h-4 w-4 ${index === 0 ? "text-[#C7F36B]" : "text-[#62755B]"}`} />
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="projects" className="relative z-10 border-t border-[#17372A]/12 bg-[#EEEADF] px-5 py-24 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1480px]">
          <div data-reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#62755B]">Project atelier</p>
            <h2 className="botanical-display mt-4 max-w-3xl text-5xl font-medium leading-[0.95] tracking-[-0.05em] sm:text-6xl">Tiếp tục nơi ý tưởng đang lớn lên.</h2>
          </div>
          <RecentProjectsSection />
        </div>
      </section>

      <section className="relative z-10 bg-[#C7F36B] px-5 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1480px]">
          <div data-reveal className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#17372A]/60">Bắt đầu một khu vườn mới</p>
              <h2 className="botanical-display mt-5 max-w-5xl text-[clamp(3.2rem,7vw,7rem)] font-medium leading-[0.86] tracking-[-0.06em]">
                Thiết kế với tự nhiên.<br />Trình bày với tự tin.
              </h2>
            </div>
            <Link href={primaryHref} className="group inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#17372A] text-[#F3F0E7] transition-transform hover:rotate-[-10deg] sm:h-28 sm:w-28" aria-label="Bắt đầu dùng Carver AI">
              <ArrowRight className="h-7 w-7 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <footer className="mt-20 flex flex-col gap-5 border-t border-[#17372A]/20 pt-6 text-xs font-semibold text-[#17372A]/60 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Carver AI — AI Landscape Design Studio</span>
            <div className="flex gap-6">
              <Link href="/login" className="hover:text-[#17372A]">Đăng nhập</Link>
              <Link href="/register" className="hover:text-[#17372A]">Đăng ký</Link>
              <Link href="/canvas" className="hover:text-[#17372A]">Canvas</Link>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}

type HeroCanvasProps = {
  mode: 0 | 1 | 2;
  onModeChange: (mode: 0 | 1 | 2) => void;
};

function HeroCanvas({ ref, mode, onModeChange }: HeroCanvasProps & { ref: React.RefObject<HTMLDivElement | null> }) {
  const modes = [
    { label: "Phác thảo", Icon: PenTool },
    { label: "Region Brush", Icon: Brush },
    { label: "AI hoàn thiện", Icon: Wand2 },
  ] as const;

  return (
    <div ref={ref} className="overflow-hidden rounded-[1.4rem] border border-[#17372A]/20 bg-[#D9DDD0] shadow-[0_35px_100px_rgba(23,55,42,0.16)] sm:rounded-[2rem]">
      <div className="flex flex-col gap-3 border-b border-[#17372A]/15 bg-[#EEEADF] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#17372A]/55">
          <span className="h-2 w-2 rounded-full bg-[#C7F36B] ring-4 ring-[#C7F36B]/25" />
          Courtyard study · Working canvas
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-full border border-[#17372A]/10 bg-[#F7F4EB] p-1">
          {modes.map(({ label, Icon }, index) => (
            <button key={label} type="button" onClick={() => onModeChange(index as 0 | 1 | 2)} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold transition ${mode === index ? "bg-[#17372A] text-[#F7F4EB]" : "text-[#17372A]/55 hover:text-[#17372A]"}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-[72px_1fr_290px]">
        <aside className="hidden border-r border-[#17372A]/15 bg-[#EEEADF] py-5 lg:flex lg:flex-col lg:items-center lg:gap-3">
          {[MousePointer2, PenTool, Brush, ScanLine].map((Icon, index) => (
            <span key={index} className={`grid h-10 w-10 place-items-center rounded-xl ${index === mode ? "bg-[#C7F36B] text-[#17372A]" : "text-[#17372A]/45"}`}>
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </aside>

        <div className="relative min-h-[420px] overflow-hidden bg-[#D4D7CD] p-4 sm:p-7 lg:min-h-[580px]">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(23,55,42,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(23,55,42,.12)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative mx-auto h-full max-w-[950px]">
            <div className="absolute left-[3%] top-[8%] w-[34%] rotate-[-2deg] overflow-hidden rounded-2xl border-[5px] border-[#F7F4EB] bg-[#F7F4EB] shadow-xl shadow-[#17372A]/12">
              <div className="relative aspect-[1.2] overflow-hidden">
                <img src={SITE_IMAGE} alt="Ảnh hiện trạng sân vườn" className="h-full w-full object-cover saturate-[0.65]" />
                <svg data-demo-sketch className="absolute inset-0 h-full w-full text-[#17372A]" viewBox="0 0 400 330" fill="none" aria-hidden="true">
                  <path d="M30 246C88 190 126 202 166 160C214 109 279 117 362 72" stroke="currentColor" strokeWidth="3" strokeDasharray="8 7" />
                  <path d="M68 274C122 215 193 220 242 172C276 139 321 136 368 108" stroke="currentColor" strokeWidth="2" />
                  <circle cx="170" cy="177" r="48" stroke="currentColor" strokeWidth="3" />
                  <path d="M145 91L163 49L181 91M154 75H174" stroke="currentColor" strokeWidth="3" />
                </svg>
                <div data-demo-mask className="invisible absolute inset-[12%_8%_10%_28%] rounded-[48%_35%_52%_38%] border-2 border-dashed border-[#C7F36B] bg-[#C7F36B]/35 opacity-0 shadow-[0_0_0_999px_rgba(23,55,42,.16)]" />
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#17372A]/55">
                <span>01 · Site image</span><span>Original</span>
              </div>
            </div>

            <svg className="absolute left-[31%] top-[31%] h-[22%] w-[22%] text-[#62755B]" viewBox="0 0 200 100" fill="none" aria-hidden="true">
              <path d="M2 54C57 7 112 95 198 38" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" />
              <path d="M184 29L198 38L186 50" stroke="currentColor" strokeWidth="2" />
            </svg>

            <div className="absolute bottom-[7%] right-[2%] w-[57%] rotate-[1deg] overflow-hidden rounded-2xl border-[5px] border-[#F7F4EB] bg-[#F7F4EB] shadow-2xl shadow-[#17372A]/18">
              <div className="relative aspect-[1.45] overflow-hidden bg-[#B8BCAF]">
                <img src={SITE_IMAGE} alt="Ảnh hiện trạng trước khi hoàn thiện" className="absolute inset-0 h-full w-full object-cover saturate-[0.55]" />
                <div data-demo-result className="absolute inset-0 [clip-path:inset(0_0_0_0)]">
                  <img src={GARDEN_IMAGE} alt="Phối cảnh sân vườn do AI hoàn thiện" className="h-full w-full object-cover" />
                </div>
                <div data-demo-scan className="absolute inset-y-0 left-[58%] w-px bg-[#F7F4EB] shadow-[0_0_18px_4px_rgba(247,244,235,.75)]">
                  <span className="absolute -left-10 top-4 rounded-full bg-[#C7F36B] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#17372A]">AI pass</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#17372A]/55">
                <span>03 · Visual proposal</span><span className="text-[#62755B]">Layout preserved</span>
              </div>
            </div>

            <div className="absolute bottom-[10%] left-[2%] max-w-[230px] rounded-2xl border border-[#17372A]/15 bg-[#F7F4EB]/95 p-4 shadow-xl backdrop-blur">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#62755B]">Design brief</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#17372A]">Giữ nguyên góc máy, lối đi và hình dáng hồ. Chỉ thay đổi vùng trồng cây.</p>
            </div>
          </div>
        </div>

        <aside className="hidden border-l border-[#17372A]/15 bg-[#EEEADF] p-5 lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#62755B]">AI design notes</p>
          <h3 className="botanical-display mt-4 text-2xl font-medium leading-tight">Khu vườn Nhật đương đại</h3>
          <div className="mt-6 space-y-4">
            {["Góc máy & phối cảnh", "Hình dáng lối đi", "Vị trí công trình"].map((item) => (
              <div key={item} className="flex items-center gap-3 border-b border-[#17372A]/10 pb-3 text-xs font-semibold">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#DCE5D7] text-[#62755B]"><Check className="h-3 w-3" /></span>
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-[#17372A] p-4 text-[#F3F0E7]">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#C7F36B]"><Sparkles className="h-3.5 w-3.5" /> Spatial lock</div>
            <p className="mt-3 text-xs leading-5 text-white/62">AI chỉ can thiệp vào vùng đã chọn, không tự ý thay đổi bố cục chính.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, align = "left" }: { eyebrow: string; title: string; align?: "left" | "right" }) {
  return (
    <div data-reveal className={`grid gap-6 lg:grid-cols-[0.55fr_1fr] ${align === "right" ? "lg:grid-cols-[1fr_0.55fr]" : ""}`}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.24em] text-[#62755B] ${align === "right" ? "lg:order-2" : ""}`}>{eyebrow}</p>
      <h2 className={`botanical-display max-w-4xl text-5xl font-medium leading-[0.92] tracking-[-0.05em] sm:text-6xl lg:text-7xl ${align === "right" ? "lg:order-1" : ""}`}>{title}</h2>
    </div>
  );
}

function BotanicalLineArt() {
  return (
    <svg data-parallax-leaf className="pointer-events-none absolute -right-28 top-14 h-[430px] w-[430px] text-[#62755B]/12 sm:h-[620px] sm:w-[620px]" viewBox="0 0 500 500" fill="none" aria-hidden="true">
      <path d="M77 429C174 340 236 245 341 71" stroke="currentColor" strokeWidth="1.2" />
      <path d="M181 321C107 313 76 261 75 203C144 205 196 238 181 321Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M260 211C206 166 211 107 246 63C298 107 319 161 260 211Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M326 107C340 54 387 27 439 31C430 91 394 129 326 107Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M203 295L90 218M267 197L250 78M337 92L420 42" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
