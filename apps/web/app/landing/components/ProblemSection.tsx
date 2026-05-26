"use client";

import { Brain, Clock, ImageOff, WandSparkles } from "lucide-react";
import { useRef } from "react";
import AnimatedCard from "./AnimatedCard";
import { useGSAP } from "./gsapSetup";
import { prefersReducedMotion, revealUp, scopedSelector } from "./landingMotion";

const problems = [
  ["Khách khó tưởng tượng sân vườn tương lai", Brain],
  ["AI tạo ảnh đẹp nhưng không biết có hợp nhà, hợp ngân sách, hợp khí hậu không", WandSparkles],
  ["Xem nhiều mẫu đẹp nhưng áp dụng vào sân thật lại rất khó", ImageOff],
  ["Kỹ sư mất thời gian hỏi nhu cầu, làm concept và giải thích cho khách", Clock],
];

export default function ProblemSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = scopedSelector(rootRef);

      revealUp(q(".problem-card"), {
        y: 42,
        duration: 0.8,
        stagger: 0.09,
        scrollTrigger: { trigger: rootRef.current, start: "top 72%" },
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#4F6F52]">The gap</p>
          <h2 className="mt-4 text-4xl font-black leading-tight text-[#102A24] sm:text-5xl">
            Ảnh đẹp chưa chắc là thiết kế làm được
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {problems.map(([text, Icon], index) => (
            <AnimatedCard
              key={String(text)}
              className={`problem-card min-h-64 rounded-[2rem] border border-[#102A24]/10 bg-[#FFFDF6]/75 p-6 shadow-xl shadow-[#102A24]/5 backdrop-blur ${index === 1 ? "lg:mt-12" : ""}`}
            >
              <Icon className="h-8 w-8 text-[#D9A441]" aria-hidden="true" />
              <p className="mt-10 text-xl font-black leading-snug text-[#102A24]">{text}</p>
            </AnimatedCard>
          ))}
        </div>

        <div className="mt-12 rounded-[2rem] border border-[#102A24]/10 bg-[#102A24] p-8 text-[#FFFDF6] shadow-2xl shadow-[#102A24]/15 md:p-10">
          <p className="max-w-5xl text-2xl font-black leading-snug md:text-3xl">
            Carver AI không chỉ tạo ảnh sân vườn. Carver AI giúp biến cảm hứng
            thành concept có ngữ cảnh, có ngân sách, có kiểm tra phù hợp và có
            brief để chuyên gia tiếp tục triển khai.
          </p>
        </div>
      </div>
    </section>
  );
}
