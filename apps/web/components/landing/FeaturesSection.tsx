"use client";

import {
  BadgeCheck,
  ClipboardList,
  Droplets,
  FileText,
  Gauge,
  ImagePlus,
  Layers3,
  Leaf,
  Palette,
  PiggyBank,
  Sparkles,
} from "lucide-react";
import { useRef } from "react";
import { features } from "../../data/features";
import AnimatedCard from "./AnimatedCard";
import { gsap, useGSAP } from "./gsapSetup";

const icons = [
  ImagePlus,
  Sparkles,
  Palette,
  PiggyBank,
  Droplets,
  Leaf,
  Layers3,
  BadgeCheck,
  Gauge,
  ClipboardList,
  FileText,
];

const highlights = new Set([
  "Reality Check",
  "Non Bộ & Waterfall Composer",
  "Photo / Floorplan Redesign",
  "Proposal Preview",
]);

export default function FeaturesSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".feature-card", {
        y: 40,
        opacity: 0,
        duration: 0.75,
        stagger: 0.05,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 70%" },
      });
    },
    { scope: rootRef },
  );

  return (
    <section id="features" ref={rootRef} className="px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#4F6F52]">Features</p>
          <h2 className="mt-4 text-4xl font-black leading-tight text-[#102A24] sm:text-5xl">
            Tính năng nổi bật của Carver AI
          </h2>
          <p className="mt-5 text-lg leading-8 text-[#102A24]/70">
            Không chỉ là AI tạo ảnh. Đây là workflow giúp biến cảm hứng sân vườn
            thành concept có thể kiểm tra, chia sẻ và tiếp tục triển khai.
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(260px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = icons[index];
            const big = highlights.has(feature.title);
            return (
              <AnimatedCard
                key={feature.title}
                className={`feature-card rounded-[2rem] border border-[#102A24]/10 p-6 shadow-xl shadow-[#102A24]/5 ${
                  big
                    ? "bg-[#102A24] text-[#FFFDF6] md:col-span-2"
                    : "bg-[#FFFDF6]/75 text-[#102A24]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${big ? "bg-[#D9A441]/20 text-[#D9A441]" : "bg-[#4F6F52]/10 text-[#4F6F52]"}`}>
                    {feature.tag}
                  </span>
                  <Icon className={`h-7 w-7 ${big ? "text-[#D9A441]" : "text-[#4F6F52]"}`} aria-hidden="true" />
                </div>
                <h3 className={`mt-12 font-black leading-tight ${big ? "max-w-lg text-4xl" : "text-2xl"}`}>
                  {feature.title}
                </h3>
                <p className={`mt-4 max-w-2xl leading-7 ${big ? "text-[#FFFDF6]/68" : "text-[#102A24]/68"}`}>
                  {feature.description}
                </p>
              </AnimatedCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
