"use client";

import type { RefObject } from "react";
import { gsap } from "./gsapSetup";

export const reduceMotionQuery = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return window.matchMedia(reduceMotionQuery).matches;
}

export function scopedSelector(rootRef: RefObject<Element | null>) {
  return gsap.utils.selector(rootRef);
}

export function revealUp(
  targets: Parameters<typeof gsap.from>[0],
  vars: Parameters<typeof gsap.from>[1] = {},
) {
  return gsap.from(targets, {
    y: 36,
    autoAlpha: 0,
    duration: 0.75,
    stagger: 0.08,
    ease: "power3.out",
    ...vars,
  });
}
