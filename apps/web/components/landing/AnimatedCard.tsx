"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { gsap, useGSAP } from "./gsapSetup";

type AnimatedCardProps = {
  children: ReactNode;
  className?: string;
};

export default function AnimatedCard({ children, className = "" }: AnimatedCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const card = cardRef.current;
      if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const enter = () =>
        gsap.to(card, {
          y: -8,
          rotateX: 1.5,
          rotateY: -1.5,
          duration: 0.45,
          ease: "power3.out",
        });
      const leave = () =>
        gsap.to(card, {
          y: 0,
          rotateX: 0,
          rotateY: 0,
          duration: 0.45,
          ease: "power3.out",
        });

      card.addEventListener("mouseenter", enter);
      card.addEventListener("mouseleave", leave);

      return () => {
        card.removeEventListener("mouseenter", enter);
        card.removeEventListener("mouseleave", leave);
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
