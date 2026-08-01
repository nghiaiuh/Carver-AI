"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Leaf } from "lucide-react";
import Sparkles from "../icons/CarverSparklesIcon";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export default function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthPageShellProps) {
  return (
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-8 text-[#101412] lg:px-8">
      <div className="mx-auto flex max-w-[1560px] items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-[#f8f5ee]/90 px-4 py-2 text-sm font-bold text-[#101412] shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </Link>
        <div className="inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#101412] text-[#f8f5ee] shadow-xl shadow-black/15">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-black uppercase tracking-[0.2em]">Carver AI</span>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-[1560px] gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-black/10 bg-[#101412] px-8 py-10 text-[#f8f5ee] shadow-[0_28px_80px_rgba(16,20,18,0.16)] lg:px-12 lg:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(167,213,216,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(122,180,107,0.14),transparent_34%)]" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a7d5d8]">{eyebrow}</p>
            <h1 className="mt-6 max-w-[14ch] text-4xl font-black tracking-[-0.05em] md:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-[38rem] text-base leading-7 text-white/68 md:text-lg">
              {description}
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {[
                "Save projects and continue work across devices.",
                "Use the preset library, cloud assets, and protected project APIs.",
                "Keep canvas references, prompts, and outputs tied to your own workspace.",
                "Return to landscape concepts without losing your flow.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.5rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-medium leading-6 text-white/78 backdrop-blur-sm"
                >
                  <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[#a7d5d8]">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-[560px] rounded-[2rem] border border-black/10 bg-[#fbf8f1]/96 p-6 shadow-[0_28px_70px_rgba(16,20,18,0.09)] backdrop-blur md:p-8">
            {children}
            <div className="mt-6 border-t border-black/10 pt-5 text-sm text-black/62">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
