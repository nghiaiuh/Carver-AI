"use client";

import { Banknote, CheckCircle2, FileText, ImagePlus, Palette, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "./gsapSetup";
import { prefersReducedMotion, revealUp, scopedSelector } from "./landingMotion";

const steps = [
  { title: "Upload ảnh/mặt bằng", copy: "Bắt đầu từ ảnh sân thật, plan hoặc sketch.", icon: ImagePlus },
  { title: "Chọn phong cách", copy: "Tropical, courtyard, Koi, minimal hoặc non bộ.", icon: Palette },
  { title: "Chọn ngân sách", copy: "Đặt kỳ vọng trước khi AI tạo concept.", icon: Banknote },
  { title: "Generate concept", copy: "Tạo nhiều hướng nhìn để so sánh nhanh.", icon: WandSparkles },
  { title: "Reality Check", copy: "Kiểm tra thi công, khí hậu, bảo trì, ngân sách.", icon: CheckCircle2 },
  { title: "Tạo brief gửi chuyên gia", copy: "Chuyển cảm hứng thành tài liệu dễ trao đổi.", icon: FileText },
];

export default function WorkflowSection() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !rootRef.current || !trackRef.current) return;

      const q = scopedSelector(rootRef);
      const cards = q(".workflow-step");
      const totalShift = () => Math.max(trackRef.current!.scrollWidth - window.innerWidth + 80, 0);
      const setActiveIndex = (index: number) => {
        if (activeRef.current === index) return;
        activeRef.current = index;
        setActive(index);
      };

      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 900px)",
        },
        (context) => {
          if (!context.conditions?.isDesktop || !trackRef.current) return;

          // 1. Create pinning ScrollTrigger first
          gsap.to(trackRef.current, {
            x: () => -totalShift(),
            ease: "none",
            scrollTrigger: {
              trigger: rootRef.current,
              start: "top top",
              end: () => `+=${Math.max(totalShift(), 1) + window.innerHeight}`,
              pin: true,
              scrub: 0.8,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                setActiveIndex(Math.min(steps.length - 1, Math.round(self.progress * (steps.length - 1))));
              },
            },
          });

          // 2. Create reveal ScrollTrigger after pinning so GSAP handles spacing correctly
          revealUp(cards, {
            y: 28,
            duration: 0.7,
            stagger: 0.06,
            scrollTrigger: { trigger: rootRef.current, start: "top 68%" },
          });

          ScrollTrigger.refresh();
        },
        rootRef,
      );

      mm.add("(max-width: 899px)", () => {
        // Mobile: Just reveal and scroll track active steps
        revealUp(cards, {
          y: 28,
          duration: 0.7,
          stagger: 0.06,
          scrollTrigger: { trigger: rootRef.current, start: "top 68%" },
        });

        const triggers = cards.map((card, index) =>
          ScrollTrigger.create({
            trigger: card,
            start: "top 58%",
            end: "bottom 45%",
            onEnter: () => setActiveIndex(index),
            onEnterBack: () => setActiveIndex(index),
          }),
        );

        return () => {
          triggers.forEach((trigger) => trigger.kill());
        };
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section id="workflow" ref={rootRef} className="relative overflow-hidden bg-[#102A24] px-5 py-24 text-[#FFFDF6] lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#D9A441_0,transparent_28%),radial-gradient(circle_at_80%_40%,#4F6F52_0,transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[#D9A441]">Workflow</p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Một flow đơn giản từ ý tưởng đến brief chuyên nghiệp
            </h2>
          </div>
          <p className="text-lg leading-8 text-[#FFFDF6]/70">
            Thay vì bắt người dùng viết prompt dài, Carver AI chuyển lựa chọn về
            phong cách, ngân sách, loại sân vườn và mong muốn thành concept trực quan.
          </p>
        </div>

        <div className="mt-14 overflow-x-auto overflow-y-visible pb-4 lg:overflow-visible lg:pb-0">
          <div ref={trackRef} className="flex w-max gap-5 pr-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = active === index;
              return (
                <article
                  key={step.title}
                  className={`workflow-step h-[410px] w-[78vw] max-w-[430px] rounded-[2rem] border p-6 transition-colors duration-300 md:w-[430px] ${
                    isActive
                      ? "scale-[1.02] border-[#D9A441]/60 bg-[#FFFDF6] text-[#102A24]"
                      : "border-white/10 bg-white/10 text-[#FFFDF6]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-6xl font-black opacity-20">0{index + 1}</span>
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl ${isActive ? "bg-[#D9A441]/20 text-[#102A24]" : "bg-white/10 text-[#D9A441]"}`}>
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-12 text-3xl font-black leading-tight">{step.title}</h3>
                  <p className={`mt-4 leading-7 ${isActive ? "text-[#102A24]/70" : "text-[#FFFDF6]/65"}`}>{step.copy}</p>
                  <div className="mt-10 rounded-3xl border border-current/10 bg-current/5 p-4">
                    <div className="h-3 w-24 rounded-full bg-current/20" />
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="h-20 rounded-2xl bg-current/10" />
                      <div className="h-20 rounded-2xl bg-current/20" />
                      <div className="h-20 rounded-2xl bg-current/10" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
