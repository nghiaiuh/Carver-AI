"use client";

import Link from "next/link";
import { ArrowRight, Sprout } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(navRef.current, {
        y: -24,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      });
    },
    { scope: navRef },
  );

  return (
    <nav
      ref={navRef}
      className="fixed left-0 right-0 top-0 z-50 border-b border-[#102A24]/10 bg-[#FFFDF6]/70 backdrop-blur-xl"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#D9A441]">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#102A24] text-[#D9A441] shadow-lg shadow-[#102A24]/15">
            <Sprout className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-base font-black tracking-[0.12em] text-[#102A24]">
            CARVER AI
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-sm font-semibold text-[#102A24]/70 md:flex">
          <a href="#features" className="transition hover:text-[#102A24]">Features</a>
          <a href="#workflow" className="transition hover:text-[#102A24]">Workflow</a>
          <a href="#reality" className="transition hover:text-[#102A24]">Reality Check</a>
        </div>

        <Link
          href="/canvas"
          className="inline-flex items-center gap-2 rounded-full bg-[#102A24] px-4 py-2.5 text-sm font-bold text-[#FFFDF6] shadow-xl shadow-[#102A24]/15 transition hover:bg-[#2F4A3D] focus:outline-none focus:ring-2 focus:ring-[#D9A441]"
        >
          Tạo demo
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
