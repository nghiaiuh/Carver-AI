"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Leaf, Loader2, Plus } from "lucide-react";
import { buildAuthPageHref, getBrowserAuthClient } from "./auth/authClient";
import { useAuthSession } from "./auth/useAuthSession";

type LandingProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  landscape_goal: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectsResponse = {
  projects?: LandingProject[];
  error?: string;
};

type CreateProjectResponse = {
  project?: LandingProject;
  error?: string;
};

async function getAuthorizedHeaders(init?: HeadersInit) {
  const supabase = getBrowserAuthClient();
  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in to manage your projects.");
  }

  const headers = new Headers(init);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function formatProjectDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildProjectSubtitle(project: LandingProject) {
  if (project.landscape_goal?.trim()) {
    return project.landscape_goal.trim();
  }

  if (project.description?.trim()) {
    return project.description.trim();
  }

  return project.status === "archived" ? "Archived project workspace" : "Ready for canvas design work";
}

export default function RecentProjectsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAuthSession();
  const [projects, setProjects] = useState<LandingProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setProjects([]);
      setLoadingProjects(false);
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      setLoadingProjects(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/projects", {
          cache: "no-store",
          headers: await getAuthorizedHeaders(),
        });
        const payload = (await response.json().catch(() => ({}))) as ProjectsResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load your recent projects.");
        }

        if (!cancelled) {
          setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load your recent projects.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const recentProjects = useMemo(() => projects.slice(0, 4), [projects]);

  const createProject = async () => {
    if (creatingProject) {
      return;
    }

    if (status !== "authenticated") {
      router.push(buildAuthPageHref("/login", pathname, "new-project"));
      return;
    }

    setCreatingProject(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          name: `Untitled landscape ${new Date().toLocaleDateString("en-CA")}`,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateProjectResponse;

      if (!response.ok || !payload.project?.id) {
        throw new Error(payload.error || "Unable to create a new project.");
      }

      setProjects((current) => [
        payload.project!,
        ...current.filter((project) => project.id !== payload.project!.id),
      ]);

      router.push(`/canvas?projectId=${payload.project.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create a new project.");
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="mt-24">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.04em]">Recent Projects</h2>
          <p className="mt-1 text-sm font-bold text-black/42">
            {status === "authenticated"
              ? "Continue the real work in your own canvas workspace."
              : "Sign in to see your saved landscape projects."}
          </p>
        </div>
        <Link
          href={status === "authenticated" ? "/canvas" : buildAuthPageHref("/login", pathname, "recent-projects")}
          className="inline-flex items-center gap-2 text-sm font-black text-black/42 transition hover:text-black"
        >
          {status === "authenticated" ? "Open Canvas" : "Sign In"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {errorMessage ? (
        <div className="mb-5 rounded-[1.35rem] border border-[#B42318]/12 bg-[#FEF3F2] px-5 py-4 text-sm font-semibold text-[#7A271A]">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creatingProject}
          className="flex min-h-[216px] flex-col justify-between rounded-[1.75rem] border border-dashed border-black/12 bg-white/35 p-6 text-left transition hover:border-[#2f7a4f]/40 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="grid flex-1 place-items-center text-black/35">
            {creatingProject ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /> : <Plus className="h-8 w-8" aria-hidden="true" />}
          </span>
          <div>
            <span className="text-lg font-black">New Project</span>
            <p className="mt-2 text-sm font-bold text-black/40">
              {status === "authenticated" ? "Create a fresh landscape workspace" : "Sign in first to create a project"}
            </p>
          </div>
        </button>

        {status === "loading" || loadingProjects ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`project-skeleton-${index}`}
              className="min-h-[216px] rounded-[1.5rem] border border-black/8 bg-white/45 p-5 shadow-lg shadow-black/[0.03]"
            >
              <div className="h-28 animate-pulse rounded-[1.2rem] bg-black/[0.05]" />
              <div className="mt-4 h-5 w-2/3 animate-pulse rounded-full bg-black/[0.06]" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded-full bg-black/[0.05]" />
            </div>
          ))
        ) : status !== "authenticated" ? (
          <div className="md:col-span-1 xl:col-span-4 flex min-h-[216px] flex-col justify-center rounded-[1.75rem] border border-black/10 bg-white/55 p-8 shadow-lg shadow-black/[0.04]">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#101412] text-[#f8f5ee]">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-2xl font-black tracking-[-0.03em] text-[#101412]">
              Your private project shelf starts after sign-in
            </h3>
            <p className="mt-3 max-w-[38rem] text-sm leading-7 text-black/55">
              Save canvas versions, continue AI chat history, and keep each garden concept tied to your own account instead of demo data.
            </p>
            <div className="mt-6">
              <Link
                href={buildAuthPageHref("/login", pathname, "recent-projects")}
                className="inline-flex items-center gap-2 rounded-full bg-[#101412] px-5 py-3 text-sm font-black text-[#f8f5ee] shadow-xl shadow-black/15"
              >
                Sign in to continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="md:col-span-1 xl:col-span-4 flex min-h-[216px] flex-col justify-center rounded-[1.75rem] border border-black/10 bg-white/55 p-8 shadow-lg shadow-black/[0.04]">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ea] text-[#27683f]">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-2xl font-black tracking-[-0.03em] text-[#101412]">
              No projects yet
            </h3>
            <p className="mt-3 max-w-[34rem] text-sm leading-7 text-black/55">
              Start your first landscape workspace and Carver AI will create a clean project shell with snapshot, chat thread, and canvas state ready to use.
            </p>
          </div>
        ) : (
          recentProjects.map((project, index) => (
            <Link
              key={project.id}
              href={`/canvas?projectId=${project.id}`}
              className="group flex min-h-[216px] flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-lg shadow-black/[0.04] transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/[0.06]"
            >
              <div
                className="flex h-[124px] items-end justify-between px-5 py-4 text-white"
                style={{
                  background: [
                    "linear-gradient(135deg, rgba(16,20,18,0.94), rgba(65,116,82,0.86))",
                    "radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 34%)",
                  ].join(", "),
                }}
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-black">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/78">
                  {project.status}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-black leading-tight text-[#101412] transition group-hover:text-[#27683f]">
                  {project.name}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-black/52">
                  {buildProjectSubtitle(project)}
                </p>
                <div className="mt-auto flex items-center justify-between pt-5 text-xs font-bold uppercase tracking-[0.14em] text-black/35">
                  <span>Updated {formatProjectDate(project.updated_at)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[#27683f]">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
