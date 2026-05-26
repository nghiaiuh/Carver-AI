"use client";

import { ArrowRight, Upload } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { prefersReducedMotion, scopedSelector } from "./landingMotion";

export default function FinalCTA() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const q = scopedSelector(rootRef);

      gsap.to(q(".cta-glow"), {
        scale: 1.14,
        autoAlpha: 0.75,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    },
    { scope: rootRef },
  );

  return (
    <section id="demo" ref={rootRef} className="relative overflow-hidden px-5 py-24 lg:px-8">
      <div className="cta-glow absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D9A441]/25 blur-3xl" />
      <div className="relative mx-auto max-w-5xl rounded-[2.5rem] border border-[#102A24]/10 bg-[#102A24] px-6 py-16 text-center text-[#FFFDF6] shadow-2xl shadow-[#102A24]/20 md:px-14">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-[#D9A441]">Start</p>
        <h2 className="mx-auto mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
          Bắt đầu với concept sân vườn đầu tiên của bạn
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#FFFDF6]/70">
          Upload ảnh, chọn phong cách và để Carver AI tạo ý tưởng sân vườn có
          thể kiểm tra, chia sẻ và gửi chuyên gia.
        </p>
        <a
          href="/canvas"
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-[#D9A441] px-7 py-4 text-sm font-black text-[#102A24] transition hover:bg-[#e1b65c] focus:outline-none focus:ring-2 focus:ring-[#FFFDF6]"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Tạo concept demo
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
