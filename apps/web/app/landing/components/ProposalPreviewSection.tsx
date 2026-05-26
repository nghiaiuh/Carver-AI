"use client";

import { ArrowRight, CalendarDays, FileText, Gauge, Gem, Layers3 } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { prefersReducedMotion, scopedSelector } from "./landingMotion";

export default function ProposalPreviewSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = scopedSelector(rootRef);

      gsap.from(q(".proposal-card"), {
        y: 50,
        rotate: -2,
        scale: 0.96,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 70%" },
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="px-5 py-24 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#4F6F52]">Proposal</p>
          <h2 className="mt-4 text-4xl font-black leading-tight text-[#102A24] sm:text-5xl">
            Biến concept thành proposal trình bày chuyên nghiệp
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#102A24]/70">
            Tạo bản proposal gồm concept, mô tả ý tưởng, phong cách, vật liệu đề
            xuất, ngân sách tham khảo, Reality Check và timeline sơ bộ.
          </p>
          <p className="mt-6 rounded-3xl border border-[#102A24]/10 bg-[#FFFDF6]/70 p-5 text-xl font-black leading-snug text-[#102A24]">
            Từ vài hình ảnh rời rạc thành một câu chuyện thiết kế dễ gửi, dễ hiểu, dễ chốt.
          </p>
        </div>

        <article className="proposal-card rounded-[2.5rem] border border-[#102A24]/10 bg-[#FFFDF6] p-5 shadow-2xl shadow-[#102A24]/15">
          <div className="overflow-hidden rounded-[2rem] bg-[#102A24] text-[#FFFDF6]">
            <div className="relative min-h-72 p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_24%,#D9A441_0_12%,transparent_13%),radial-gradient(ellipse_at_72%_62%,#4F6F52_0_26%,transparent_27%),linear-gradient(135deg,#102A24,#2F4A3D)]" />
              <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D8C6A3]">Cover</p>
                <h3 className="mt-4 max-w-md text-5xl font-black leading-none">Tropical Koi Garden Concept</h3>
              </div>
            </div>
            <div className="grid gap-3 bg-[#FFFDF6] p-5 text-[#102A24] md:grid-cols-2">
              {[
                ["Design idea", FileText],
                ["Suggested materials", Gem],
                ["Budget range", Layers3],
                ["Reality Check", Gauge],
                ["Timeline", CalendarDays],
              ].map(([label, Icon]) => (
                <div key={String(label)} className="rounded-3xl border border-[#102A24]/10 bg-[#F4EFE3] p-4">
                  <Icon className="h-5 w-5 text-[#4F6F52]" aria-hidden="true" />
                  <p className="mt-4 text-sm font-black">{label}</p>
                  <div className="mt-3 h-2 w-24 rounded-full bg-[#102A24]/12" />
                </div>
              ))}
              <button className="inline-flex items-center justify-center gap-2 rounded-3xl bg-[#D9A441] p-4 text-sm font-black text-[#102A24] transition hover:bg-[#e1b65c] focus:outline-none focus:ring-2 focus:ring-[#102A24] md:col-span-2">
                Preview proposal
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
