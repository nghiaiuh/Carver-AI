import Link from "next/link";
import ProfilesPanel from "../components/ProfilesPanel";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-20">
      {/* Hero */}
      <section className="flex flex-col items-center text-center gap-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-sm font-medium text-violet-400 ring-1 ring-violet-500/20">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Powered by LangGraph & Liveblocks
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl lg:text-6xl">
          Draw together.
          <br />
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Think with AI.
          </span>
        </h1>
        <p className="max-w-xl text-base text-slate-400 sm:text-lg">
          A collaborative canvas where your team draws in realtime, AI assists
          with edits and generation, and background workers handle heavy
          rendering — all in the browser.
        </p>
        <div className="flex gap-4 pt-4">
          <Link
            href="/canvas"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Open Canvas
          </Link>
          <Link
            href="https://github.com/anthropics/carver-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Source
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-100">Realtime Sync</h2>
          <p className="mt-2 text-sm text-slate-400">
            Every cursor, shape, and stroke is synchronized across users via
            Liveblocks. No conflicts, no merge headaches.
          </p>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-100">AI Orchestration</h2>
          <p className="mt-2 text-sm text-slate-400">
            LangGraph routes user intents — chat, edit, generate, annotate —
            through a state machine that streams results back into the UI.
          </p>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 3v18" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-100">Canvas Engine</h2>
          <p className="mt-2 text-sm text-slate-400">
            Built on tldraw for an infinite canvas with shapes, arrows, text,
            and freehand drawing — all composable and extensible.
          </p>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-slate-700">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-100">Background Workers</h2>
          <p className="mt-2 text-sm text-slate-400">
            Heavy rendering and long-running jobs are offloaded to BullMQ
            workers with Redis, keeping the UI responsive at all times.
          </p>
        </div>
      </section>

      {/* Tech stack */}
      <section className="space-y-4">
        <h2 className="text-center text-sm font-medium uppercase tracking-[0.35em] text-slate-500">
          Tech Stack
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {["Next.js 16", "tldraw", "Liveblocks", "LangGraph", "BullMQ", "Redis", "PostgreSQL", "Prisma", "Tailwind CSS"].map(
            (tech) => (
              <span
                key={tech}
                className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm text-slate-300"
              >
                {tech}
              </span>
            )
          )}
        </div>
      </section>

      {/* Profile data */}
      <ProfilesPanel />
    </main>
  );
}
