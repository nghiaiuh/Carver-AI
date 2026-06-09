/*
 * Flow: Renders a shared app-level UI component.
 * 1. Own local UI state when needed.
 * 2. Call API routes or parent callbacks for actions.
 * 3. Return reusable interface pieces for pages.
 */

"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, useGSAP, ScrollTrigger };
