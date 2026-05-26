"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { prefersReducedMotion, scopedSelector } from "./landingMotion";

const cards = [
  ["Hồ Koi sân vườn", "Luồng nước, điểm ngắm, vật liệu ven hồ và cảm giác thư giãn."],
  ["Hòn non bộ tam sơn nhị hà", "Ngôn ngữ đá, nước, thế núi và tinh thần sân vườn Việt."],
  ["Thác nước và đá tự nhiên", "Bố cục thác, đá tai mèo, cổ thạch và chống bắn nước."],
  ["Sân vườn biệt thự", "Không gian sống ngoài trời có chiều sâu và điểm nhấn sang trọng."],
  ["Sân nhà phố tropical", "Mảng xanh, ánh sáng, lối đi và privacy cho diện tích hẹp."],
  ["Cafe sân vườn / resort mini", "Concept có câu chuyện, góc check-in và nhịp trải nghiệm."],
];

export default function FlagshipSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = scopedSelector(rootRef);

      gsap.from(q(".flagship-card"), {
        scale: 0.94,
        autoAlpha: 0,
        duration: 0.75,
        stagger: 0.07,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 72%" },
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="overflow-hidden bg-[#F4EFE3] px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <h2 className="text-4xl font-black leading-tight text-[#102A24] sm:text-5xl">
            Sinh ra cho hồ Koi, non bộ và sân vườn nhiệt đới
          </h2>
          <p className="text-lg leading-8 text-[#102A24]/70">
            Carver AI tập trung vào những không gian mà công cụ quốc tế thường
            hiểu chưa sâu: hồ Koi, hòn non bộ, thác nước, đá tai mèo, sân vườn
            nhà phố, biệt thự Việt Nam và tropical garden Đông Nam Á.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map(([title, desc], index) => (
            <article
              key={title}
              className="flagship-card group relative min-h-80 overflow-hidden rounded-[2rem] border border-[#102A24]/10 bg-[#102A24] p-6 text-[#FFFDF6] shadow-2xl shadow-[#102A24]/12"
            >
              <div
                className="absolute inset-0 opacity-90 transition duration-500 group-hover:scale-110"
                style={{
                  background:
                    index % 3 === 0
                      ? "radial-gradient(circle at 20% 25%, #D9A441 0 9%, transparent 10%), radial-gradient(circle at 80% 65%, #4F6F52 0 22%, transparent 23%), linear-gradient(135deg, #102A24, #2F4A3D)"
                      : index % 3 === 1
                        ? "radial-gradient(ellipse at 55% 32%, #D8C6A3 0 18%, transparent 19%), radial-gradient(circle at 24% 72%, #4F6F52 0 20%, transparent 21%), linear-gradient(135deg, #2F4A3D, #102A24)"
                        : "radial-gradient(circle at 72% 22%, #D9A441 0 13%, transparent 14%), radial-gradient(ellipse at 32% 72%, #D8C6A3 0 24%, transparent 25%), linear-gradient(135deg, #102A24, #4F6F52)",
                }}
              />
              <div className="absolute bottom-6 left-6 right-6 z-10">
                <h3 className="text-2xl font-black leading-tight">{title}</h3>
                <p className="mt-4 translate-y-4 text-sm leading-6 text-[#FFFDF6]/0 transition duration-300 group-hover:translate-y-0 group-hover:text-[#FFFDF6]/75">
                  {desc}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
