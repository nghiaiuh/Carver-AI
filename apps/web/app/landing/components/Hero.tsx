"use client";

import { ArrowDown, Sparkles, Upload } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { prefersReducedMotion, scopedSelector } from "./landingMotion";

const badges = [
  "Photo Redesign",
  "Reality Check",
  "Garden Fit Score",
  "Brief for Expert",
  "Vietnamese Landscape DNA",
];

const tags = ["Koi Pond", "Non Bộ", "Tropical Garden", "Budget Fit 68%"];

export default function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      const q = scopedSelector(rootRef);
      const intro = gsap.timeline({
        defaults: { duration: 0.9, ease: "power3.out" },
      });

      intro
        .from(q(".hero-line"), {
          yPercent: 105,
          autoAlpha: 0,
          duration: 1,
          stagger: 0.12,
          ease: "power4.out",
        })
        .from(
          q(".hero-reveal"),
          {
            y: 24,
            autoAlpha: 0,
            stagger: 0.08,
          },
          "-=0.45",
        );

      gsap.to(q(".floating-mockup"), {
        y: -12,
        duration: 3.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.2,
        overwrite: "auto",
      });
      gsap.to(q(".garden-orbit"), {
        y: 32,
        x: -18,
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1.1,
        },
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="relative isolate overflow-hidden px-5 pb-24 pt-32 lg:px-8 lg:pb-32 lg:pt-40">
      <div className="garden-orbit absolute left-[-9rem] top-24 h-72 w-72 rounded-full bg-[#4F6F52]/20 blur-3xl" />
      <div className="garden-orbit absolute right-[-8rem] top-52 h-96 w-96 rounded-full bg-[#D9A441]/20 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#F6F2E8] to-transparent" />

      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <p className="hero-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-[#102A24]/10 bg-[#FFFDF6]/70 px-4 py-2 text-sm font-bold text-[#2F4A3D] shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4 text-[#D9A441]" aria-hidden="true" />
            AI tạo cảm hứng. Chuyên gia tạo công trình.
          </p>

          <h1 className="max-w-5xl overflow-hidden text-5xl font-black leading-[0.98] tracking-tight text-[#102A24] sm:text-6xl lg:text-7xl">
            <span className="block overflow-hidden pb-2">
              <span className="hero-line block">Thiết kế ý tưởng</span>
            </span>
            <span className="block overflow-hidden pb-2">
              <span className="hero-line block">sân vườn từ ảnh</span>
            </span>
            <span className="block overflow-hidden pb-2 text-[#4F6F52]">
              <span className="hero-line block">chỉ trong vài phút</span>
            </span>
          </h1>

          <p className="hero-reveal mt-7 max-w-2xl text-lg leading-8 text-[#102A24]/70">
            Upload ảnh hiện trạng hoặc mặt bằng, chọn phong cách, chọn ngân sách.
            Carver AI tạo concept sân vườn, kiểm tra độ phù hợp và tạo brief rõ
            ràng để làm việc với chuyên gia.
          </p>

          <div className="hero-reveal mt-9 flex flex-col gap-3 will-change-transform sm:flex-row">
            <a
              href="/canvas"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102A24] px-6 py-4 text-sm font-black text-[#FFFDF6] shadow-2xl shadow-[#102A24]/20 transition hover:bg-[#2F4A3D] focus:outline-none focus:ring-2 focus:ring-[#D9A441]"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Tạo concept demo
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#102A24]/15 bg-[#FFFDF6]/80 px-6 py-4 text-sm font-black text-[#102A24] transition hover:border-[#102A24]/35 focus:outline-none focus:ring-2 focus:ring-[#D9A441]"
            >
              Xem tính năng nổi bật
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="hero-reveal mt-9 flex flex-wrap gap-2 will-change-transform">
            {badges.map((badge) => (
              <span key={badge} className="rounded-full border border-[#102A24]/10 bg-[#FFFDF6]/70 px-3 py-1.5 text-xs font-bold text-[#102A24]/70">
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="hero-reveal relative min-h-[560px] will-change-transform">
          <div className="floating-mockup relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-[#FFFDF6]/75 p-4 shadow-2xl shadow-[#102A24]/20 backdrop-blur-xl">
            <div className="rounded-[1.8rem] border border-[#102A24]/10 bg-[#F4EFE3] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#4F6F52]">Carver Studio</p>
                  <h2 className="mt-1 text-xl font-black text-[#102A24]">Courtyard concept board</h2>
                </div>
                <span className="rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-black text-[#102A24]">Live mock</span>
              </div>

              <div className="grid gap-3 md:grid-cols-[0.85fr_1.2fr_0.85fr]">
                <div className="rounded-3xl border border-[#102A24]/10 bg-[#FFFDF6] p-3">
                  <p className="mb-3 text-xs font-black text-[#102A24]/55">Uploaded garden photo</p>
                  <div className="relative h-64 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#D8C6A3,#4F6F52_54%,#102A24)]">
                    <div className="absolute bottom-5 left-5 right-5 h-20 rounded-[2rem] bg-[#102A24]/35 backdrop-blur-sm" />
                    <div className="absolute left-8 top-8 h-28 w-20 rounded-full bg-[#FFFDF6]/22" />
                    <div className="absolute right-7 top-11 h-24 w-24 rounded-[45%] bg-[#D9A441]/45" />
                  </div>
                </div>

                <div className="rounded-3xl border border-[#102A24]/10 bg-[#102A24] p-3 text-[#FFFDF6]">
                  <p className="mb-3 text-xs font-black text-[#D8C6A3]">AI generated concept</p>
                  <div className="relative h-64 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_28%_26%,#D9A441_0_13%,transparent_14%),linear-gradient(140deg,#2F4A3D,#102A24_58%,#0A1714)]">
                    <div className="absolute bottom-8 left-7 h-32 w-32 rounded-full border-[18px] border-[#4F6F52]/80" />
                    <div className="absolute bottom-16 right-8 h-24 w-32 rounded-[999px] bg-[#FFFDF6]/15" />
                    <div className="absolute left-36 top-16 h-28 w-16 rotate-12 rounded-[60%_40%_50%_60%] bg-[#D8C6A3]/70" />
                  </div>
                </div>

                <div className="rounded-3xl border border-[#102A24]/10 bg-[#FFFDF6] p-4">
                  <p className="text-xs font-black text-[#102A24]/55">Reality Check</p>
                  <div className="mt-5 grid place-items-center">
                    <div className="grid h-32 w-32 place-items-center rounded-full bg-[conic-gradient(#D9A441_0_68%,#E7DDC8_68%_100%)] p-3">
                      <div className="grid h-full w-full place-items-center rounded-full bg-[#FFFDF6]">
                        <span className="text-4xl font-black text-[#102A24]">68</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {["Budget", "Climate", "Maintain"].map((item, index) => (
                      <div key={item} className="h-2 overflow-hidden rounded-full bg-[#102A24]/10">
                        <div
                          className="h-full rounded-full bg-[#4F6F52]"
                          style={{ width: `${[68, 80, 54][index]}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {tags.map((tag, index) => (
            <span
              key={tag}
              className="floating-mockup absolute rounded-full border border-white/70 bg-[#FFFDF6]/85 px-4 py-2 text-sm font-black text-[#102A24] shadow-xl backdrop-blur"
              style={{
                left: ["2%", "58%", "14%", "64%"][index],
                top: ["8%", "2%", "78%", "84%"][index],
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
