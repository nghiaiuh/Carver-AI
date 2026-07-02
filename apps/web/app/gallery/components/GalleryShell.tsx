/*
 * Flow: Provides reusable gallery presentation components.
 * 1. Receive display props from pages.
 * 2. Render editorial cards, shells, and sections.
 * 3. Keep gallery pages visually consistent.
 */

"use client";

import Link from "next/link";
import { ReactNode, useRef } from "react";
import { ArrowRight, Bot, GalleryHorizontalEnd, Medal, Send, SlidersHorizontal } from "lucide-react";
import { motion, useScroll, useSpring } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { gsap, useGSAP } from "../../components/gsapSetup";
import { buildAuthPageHref, getBrowserAuthClient } from "../../components/auth/authClient";
import { useAuthSession } from "../../components/auth/useAuthSession";

type ShellProps = {
  children: ReactNode;
  active?: "Gallery" | "Styles" | "Engineers" | "Reviews" | "AI Tools" | "Submit";
};

const topLinks = [
  ["Nominees", "/"],
  ["Garden Styles", "/styles"],
  ["Engineers", "/engineers"],
  ["Reviews", "/reviews"],
  ["Submit", "/submit"],
];

const dockLinks = [
  ["Gallery", "/", GalleryHorizontalEnd],
  ["Styles", "/styles", SlidersHorizontal],
  ["Reviews", "/reviews", Medal],
  ["Submit", "/submit", Send],
  ["AI Tools", "/ai-tools", Bot],
];

const AUTH_LOGIN_LABEL = "\u0110\u0103ng nh\u1eadp";
const AUTH_REGISTER_LABEL = "\u0110\u0103ng k\u00fd";

export function GalleryShell({ children, active = "Gallery" }: ShellProps) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f0e8] text-[#101412] isolate">
      <motion.div className="fixed left-0 right-0 top-0 z-[80] h-1 origin-left bg-[#101412]" style={{ scaleX }} />
      <ContourBackground />
      <RippleCursor />
      <TopNav />
      {children}
      <FloatingDock active={active} />
    </main>
  );
}

function TopNav() {
  const { status } = useAuthSession();
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = getBrowserAuthClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-black/10 bg-[#f8f5ee]/75 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1560px] items-center justify-between px-5 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#7aa6a7]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#101412] text-sm font-black text-[#f8f5ee]">C.</span>
          <span className="text-sm font-black uppercase tracking-[0.2em]">Carver AI</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-black/62 lg:flex" aria-label="Primary">
          {topLinks.map(([label, href]) => (
            <Link key={label} href={href} className="transition hover:text-black">
              {label}
            </Link>
          ))}
        </nav>
        {status === "authenticated" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2.5 text-sm font-bold text-black/70 transition hover:border-black/20 hover:bg-white hover:text-black"
            >
              Sign Out
            </button>
            <Link
              href="/canvas"
              className="group inline-flex items-center gap-2 rounded-full bg-[#101412] px-4 py-2.5 text-sm font-bold text-[#f8f5ee] shadow-xl shadow-black/15"
            >
              Open Canvas
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href={buildAuthPageHref("/login", pathname, "landing")}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2.5 text-sm font-bold text-black/70 transition hover:border-black/20 hover:bg-white hover:text-black"
            >
              {AUTH_LOGIN_LABEL}
            </Link>
            <Link
              href={buildAuthPageHref("/register", pathname, "landing")}
              className="group inline-flex items-center gap-2 rounded-full bg-[#101412] px-4 py-2.5 text-sm font-bold text-[#f8f5ee] shadow-xl shadow-black/15"
            >
              {AUTH_REGISTER_LABEL}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export function FloatingDock({ active = "Gallery" }: { active?: ShellProps["active"] }) {
  const dockRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const dock = dockRef.current;
      if (!dock || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);

      gsap.from(dock, { y: 34, autoAlpha: 0, duration: 0.75, ease: "power3.out", delay: 0.45 });

      const buttons = Array.from(dock.querySelectorAll<HTMLAnchorElement>("[data-dock-item]"));
      const moveHandlers = buttons.map((button) => {
        const onMove = safe((event: PointerEvent) => {
          const rect = button.getBoundingClientRect();
          const x = event.clientX - rect.left - rect.width / 2;
          const y = event.clientY - rect.top - rect.height / 2;
          gsap.to(button, { x: x * 0.18, y: y * 0.22, duration: 0.35, ease: "power3.out", overwrite: "auto" });
        });
        const onLeave = safe(() => {
          gsap.to(button, { x: 0, y: 0, duration: 0.45, ease: "elastic.out(1, 0.35)", overwrite: "auto" });
        });
        button.addEventListener("pointermove", onMove);
        button.addEventListener("pointerleave", onLeave);
        return () => {
          button.removeEventListener("pointermove", onMove);
          button.removeEventListener("pointerleave", onLeave);
        };
      });

      return () => moveHandlers.forEach((cleanup) => cleanup());
    },
    { scope: dockRef },
  );

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        ref={dockRef}
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-black/10 bg-white/85 p-1.5 text-[#111827] shadow-2xl shadow-black/10 backdrop-blur-2xl"
      >
        <Link
          href="/"
          className="mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#111827] text-sm font-black text-white"
        >
          C.
        </Link>

        {dockLinks.map(([label, href, Icon]) => {
          const isActive = active === label;

          return (
            <Link
              data-dock-item
              key={label}
              href={href}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${
                isActive
                  ? "bg-[#111827] text-white shadow-sm"
                  : "text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ContourBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden opacity-70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(122,166,167,0.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(139,130,114,0.13),transparent_26%),linear-gradient(180deg,#fbf8f1,#efe8db)]" />
      <svg className="absolute -left-40 top-8 h-[860px] w-[860px] text-[#7d8c7a]/25" viewBox="0 0 800 800" fill="none" aria-hidden="true">
        {[80, 135, 190, 245, 300].map((size, index) => (
          <motion.path
            key={size}
            d={`M${120 + index * 14} ${400 - index * 22}C${180 + size} ${80 + index * 34} ${520 - index * 16} ${110 + index * 22} ${650 - index * 18} ${360 + index * 21}C${760 - index * 20} ${570 - index * 8} ${470 - index * 10} ${735 - index * 20} ${260 + index * 8} ${690 - index * 17}C${90 + index * 12} ${652 - index * 8} ${18 + index * 22} ${520 - index * 9} ${120 + index * 14} ${400 - index * 22}Z`}
            stroke="currentColor"
            strokeWidth="1.2"
            initial={{ pathLength: 0, opacity: 0.25 }}
            animate={{ pathLength: 1, opacity: 0.75 }}
            transition={{ duration: 2.8 + index * 0.25, ease: "easeOut" }}
          />
        ))}
      </svg>
      <svg className="absolute -right-28 bottom-[-18rem] h-[780px] w-[780px] text-[#4c7177]/20" viewBox="0 0 800 800" fill="none" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <motion.circle
            key={index}
            cx="420"
            cy="360"
            r={110 + index * 74}
            stroke="currentColor"
            strokeWidth="1.2"
            initial={{ scale: 0.96, opacity: 0.25 }}
            animate={{ scale: [0.96, 1.02, 0.96], opacity: [0.25, 0.55, 0.25] }}
            transition={{ duration: 7 + index, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </svg>
    </div>
  );
}

function RippleCursor() {
  const rippleRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const ripple = rippleRef.current;
      if (!ripple || window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);
      const xTo = gsap.quickTo(ripple, "x", { duration: 0.45, ease: "power3" });
      const yTo = gsap.quickTo(ripple, "y", { duration: 0.45, ease: "power3" });
      const onMove = safe((event: PointerEvent) => {
        xTo(event.clientX - 18);
        yTo(event.clientY - 18);
      });
      window.addEventListener("pointermove", onMove);
      return () => window.removeEventListener("pointermove", onMove);
    },
    { scope: rippleRef },
  );

  return <div ref={rippleRef} className="pointer-events-none fixed left-0 top-0 z-[90] hidden h-9 w-9 rounded-full border border-[#4c7177]/35 mix-blend-multiply md:block" />;
}

export function MagneticButton({ href, children, dark = false }: { href: string; children: ReactNode; dark?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const button = ref.current;
      if (!button || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const safe = contextSafe ?? (<T extends (...args: never[]) => unknown>(fn: T) => fn);
      const onMove = safe((event: PointerEvent) => {
        const rect = button.getBoundingClientRect();
        gsap.to(button, {
          x: (event.clientX - rect.left - rect.width / 2) * 0.12,
          y: (event.clientY - rect.top - rect.height / 2) * 0.16,
          duration: 0.3,
          ease: "power3.out",
          overwrite: "auto",
        });
      });
      const onLeave = safe(() => gsap.to(button, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.35)", overwrite: "auto" }));
      button.addEventListener("pointermove", onMove);
      button.addEventListener("pointerleave", onLeave);
      return () => {
        button.removeEventListener("pointermove", onMove);
        button.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <Link
      ref={ref}
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-xl transition ${
        dark ? "bg-[#101412] text-[#f8f5ee] shadow-black/20" : "bg-[#f8f5ee] text-[#101412] shadow-black/10"
      }`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
