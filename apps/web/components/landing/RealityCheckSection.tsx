"use client";

import { AlertTriangle, ArrowRight, Waves } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";

const scores = [
  ["Phù hợp kiến trúc", 82],
  ["Phù hợp ngân sách", 68],
  ["Dễ bảo trì", 54],
  ["Khả thi thi công", 71],
  ["Phù hợp khí hậu", 80],
];

const warnings = [
  "Hồ Koi cần kiểm tra thể tích lọc, oxy và dòng nước",
  "Non bộ cần kiểm tra tải trọng, chống thấm và vị trí đặt",
  "Cây lớn cần kiểm tra nắng, rễ và khoảng cách với nền nhà",
  "Thác nước cần kiểm tra chống bắn nước, chống tràn và bơm",
  "Ngân sách cần được khảo sát thực tế trước khi báo giá chính xác",
];

export default function RealityCheckSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.fromTo(
        ".score-fill",
        { width: "0%" },
        {
          width: (_, el) => `${el.getAttribute("data-score")}%`,
          duration: 1.1,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: rootRef.current, start: "top 65%" },
        },
      );
      gsap.from(".warning-card", {
        x: 24,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 62%" },
      });
      gsap.to(".reality-blob", {
        y: -40,
        x: 20,
        scrollTrigger: { trigger: rootRef.current, start: "top bottom", end: "bottom top", scrub: 1 },
      });
    },
    { scope: rootRef },
  );

  return (
    <section id="reality" ref={rootRef} className="relative isolate overflow-hidden bg-[#102A24] px-5 py-24 text-[#FFFDF6] lg:px-8">
      <div className="reality-blob absolute -right-20 top-24 h-80 w-80 rounded-[44%_56%_60%_40%] bg-[#4F6F52]/35 blur-3xl" />
      <div className="reality-blob absolute -left-24 bottom-20 h-72 w-72 rounded-full bg-[#D9A441]/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#D9A441]">Reality Check</p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">
            Concept đẹp. Nhưng có làm được không?
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#FFFDF6]/70">
            Carver AI giúp kiểm tra các điểm rủi ro trước khi bạn đem ý tưởng đi
            tư vấn hoặc thi công.
          </p>
          <a
            href="/canvas"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#D9A441] px-6 py-4 text-sm font-black text-[#102A24] transition hover:bg-[#e1b65c] focus:outline-none focus:ring-2 focus:ring-[#FFFDF6]"
          >
            Xem Reality Check mẫu
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/10 bg-[#FFFDF6] p-6 text-[#102A24] shadow-2xl shadow-black/15">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black">Garden Fit Score</h3>
              <Waves className="h-7 w-7 text-[#4F6F52]" aria-hidden="true" />
            </div>
            <div className="mt-8 space-y-5">
              {scores.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between text-sm font-black">
                    <span>{label}</span>
                    <span>{value}/100</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#102A24]/10">
                    <div
                      className="score-fill h-full rounded-full bg-gradient-to-r from-[#4F6F52] to-[#D9A441]"
                      data-score={value}
                      style={{ width: "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {warnings.map((warning) => (
              <div key={warning} className="warning-card flex gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-[#D9A441]" aria-hidden="true" />
                <p className="text-sm font-semibold leading-6 text-[#FFFDF6]/80">{warning}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
