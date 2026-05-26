"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";
import { prefersReducedMotion } from "./landingMotion";

type AnimatedCardProps = {
  children: ReactNode;
  className?: string;
};

export default function AnimatedCard({ children, className = "" }: AnimatedCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const card = cardRef.current;
      if (!card || prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);

      const enter = safe(() =>
        gsap.to(card, {
          y: -8,
          rotateX: 1.5,
          rotateY: -1.5,
          duration: 0.45,
          ease: "power3.out",
          overwrite: "auto",
        }),
      );
      const leave = safe(() =>
        gsap.to(card, {
          y: 0,
          rotateX: 0,
          rotateY: 0,
          duration: 0.45,
          ease: "power3.out",
          overwrite: "auto",
        }),
      );

      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointerleave", leave);

      return () => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointerleave", leave);
      };
    },
    { scope: cardRef },
  );

  return (
    <div
      ref={cardRef}
      className={`will-change-transform [transform-style:preserve-3d] ${className}`}
    >
      {children}
    </div>
  );
}
