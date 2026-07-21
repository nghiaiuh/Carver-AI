"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Leaf, Loader2, Plus } from "lucide-react";
import { buildAuthPageHref, getBrowserAuthClient } from "./auth/authClient";
import { useAuthSession } from "./auth/useAuthSession";
import { getLandingAssetUrl } from "./landingAssetUrl";

const projectPreviewImages = [
  getLandingAssetUrl("/landing/hero-courtyard-reference.png"),
  getLandingAssetUrl("/landing/gallery-zen.webp"),
];

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
    let cancelled = false;

    if (status !== "authenticated") {
      queueMicrotask(() => {
        if (cancelled) return;
        setProjects([]);
        setLoadingProjects(false);
      });
      return () => {
        cancelled = true;
      };
    }

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

  const recentProjects = useMemo(() => projects.slice(0, 2), [projects]);
  const activityProjects = useMemo(() => projects.slice(0, 4), [projects]);

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
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-[#B59C6B]/45 pb-5">
        <div>
          <h3 className="botanical-display mt-3 text-[clamp(2.4rem,3.5vw,4.05rem)] font-medium leading-[0.92] tracking-[-0.05em] text-[#17372A]">Your projects</h3>
          <p className="mt-5 text-sm font-medium text-[#9A7A43]">
            {status === "authenticated"
              ? "Tiếp tục phát triển những phương án gần đây của bạn."
              : "Đăng nhập để xem các dự án cảnh quan đã lưu."}
          </p>
        </div>
        <Link
          href={status === "authenticated" ? "/canvas" : buildAuthPageHref("/login", pathname, "recent-projects")}
          className="inline-flex -translate-y-5 items-center gap-3 rounded-md border border-[#B59C6B]/40 bg-white/25 px-5 py-3 text-sm font-semibold text-[#17372A] transition hover:border-[#9A7A43]/70 hover:bg-white/55"
        >
          {status === "authenticated" ? "Mở canvas" : "Đăng nhập"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {errorMessage ? (
        <div className="mb-5 rounded-[1.35rem] border border-[#B42318]/12 bg-[#FEF3F2] px-5 py-4 text-sm font-semibold text-[#7A271A]">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(200px,0.78fr)_minmax(270px,1.08fr)_minmax(270px,1.08fr)_minmax(230px,0.92fr)]">
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creatingProject}
          className="group relative flex min-h-[390px] flex-col justify-between overflow-hidden rounded-[1.25rem] border border-dashed border-[#B59C6B]/45 bg-[linear-gradient(135deg,rgba(255,255,255,0.5),rgba(244,236,221,0.86))] p-7 text-left transition hover:-translate-y-1 hover:border-[#9A7A43]/70 hover:shadow-[0_24px_48px_rgba(40,53,38,0.12)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(154,122,67,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(154,122,67,0.1)_1px,transparent_1px)] [background-size:26px_26px]" />
          <span className="pointer-events-none absolute left-1/2 top-[30%] h-36 w-36 -translate-x-1/2 rounded-full border border-[#B59C6B]/20" />
          <span className="pointer-events-none absolute left-[22%] top-[41%] h-16 w-16 rounded-full border border-[#B59C6B]/15" />
          <span className="relative grid h-20 w-20 place-items-center rounded-full border border-[#B59C6B]/65 bg-[#FBF7EE] text-[#17372A] shadow-[0_14px_30px_rgba(81,67,41,0.13)] transition group-hover:rotate-[-8deg] group-hover:bg-[#F1E5CB]">
            {creatingProject ? <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" /> : <Plus className="h-9 w-9" aria-hidden="true" />}
          </span>
          <div className="relative">
            <span className="font-[family-name:var(--font-botanical-display)] text-[1.9rem] font-medium tracking-[-0.04em] text-[#17372A]">Dự án mới</span>
            <p className="mt-2 text-sm leading-6 text-[#17372A]">
              {status === "authenticated" ? "Mở một canvas cảnh quan mới" : "Đăng nhập để tạo project đầu tiên"}
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-[#9A7A43]">Bắt đầu <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
          </div>
        </button>

        {status === "loading" || loadingProjects ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`project-skeleton-${index}`}
              className="min-h-[390px] overflow-hidden rounded-[1.25rem] border border-[#8C7D68]/12 bg-[#F7F2E9]"
            >
              <div className="h-[238px] animate-pulse bg-black/[0.05]" />
              <div className="m-6 h-5 w-2/3 animate-pulse rounded-full bg-black/[0.06]" />
              <div className="mx-6 h-4 w-1/2 animate-pulse rounded-full bg-black/[0.05]" />
            </div>
          ))
        ) : false && status !== "authenticated" ? (
          <div className="md:col-span-1 xl:col-span-4 flex min-h-[232px] flex-col justify-center rounded-[1.5rem] border border-[#17372A]/12 bg-[#E4E7D8] p-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#17372A] text-[#F5F2E9]">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-5 font-[family-name:var(--font-botanical-display)] text-3xl font-semibold tracking-[-0.04em] text-[#17372A]">
              Không gian thiết kế riêng bắt đầu sau khi đăng nhập
            </h3>
            <p className="mt-3 max-w-[38rem] text-sm leading-7 text-[#17372A]/58">
              Lưu phiên bản canvas, tiếp tục lịch sử AI chat và giữ từng concept sân vườn trong tài khoản của bạn.
            </p>
            <div className="mt-6">
              <Link
                href={buildAuthPageHref("/login", pathname, "recent-projects")}
                className="inline-flex items-center gap-2 rounded-full bg-[#17372A] px-5 py-3 text-sm font-bold text-[#F5F2E9]"
              >
                Đăng nhập để tiếp tục
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : false && recentProjects.length === 0 ? (
          <div className="md:col-span-1 xl:col-span-4 flex min-h-[232px] flex-col justify-center rounded-[1.5rem] border border-[#17372A]/12 bg-[#E4E7D8] p-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#C7F36B] text-[#17372A]">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-5 font-[family-name:var(--font-botanical-display)] text-3xl font-semibold tracking-[-0.04em] text-[#17372A]">
              Chưa có dự án nào
            </h3>
            <p className="mt-3 max-w-[34rem] text-sm leading-7 text-[#17372A]/58">
              Tạo workspace cảnh quan đầu tiên. Carver AI sẽ chuẩn bị sẵn snapshot, chat và canvas để bạn bắt đầu.
            </p>
          </div>
        ) : (
          recentProjects.map((project, index) => (
            <Link
              key={project.id}
              href={`/canvas?projectId=${project.id}`}
              className="group flex min-h-[390px] flex-col overflow-hidden rounded-[1.25rem] border border-[#17372A]/12 bg-[#FAF6ED] transition hover:-translate-y-1 hover:border-[#9A7A43]/45 hover:shadow-[0_24px_48px_rgba(23,55,42,0.13)]"
            >
              <div className="relative flex h-[238px] items-end overflow-hidden px-5 py-4 text-white">
                <img src={projectPreviewImages[index % projectPreviewImages.length]} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-black/5 to-black/5" />
                <span className="absolute left-4 top-4 rounded-sm bg-[#17372A]/92 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F9F5E9]">
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#D5B66F]" />{project.status}
                </span>
                <div className="relative border-b border-[#D5B66F]/85 pb-1 text-3xl font-medium leading-none text-white/92">
                  {String(index + 1).padStart(2, "0")}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-[family-name:var(--font-botanical-display)] text-[1.7rem] font-medium leading-[0.98] tracking-[-0.035em] text-[#17372A] transition group-hover:text-[#62755B]">
                  {project.name}
                </h3>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#17372A]">
                  {buildProjectSubtitle(project)}
                </p>
                <div className="mt-auto flex items-center justify-between pt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#17372A]">
                  <span>Updated {formatProjectDate(project.updated_at)}</span>
                  <span className="inline-flex items-center gap-2 text-[#62755B]">
                    Mở
                    <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}

        {status === "authenticated" && !loadingProjects ? (
          <aside className="hidden min-h-[390px] flex-col rounded-[1.25rem] border border-[#B59C6B]/24 bg-[linear-gradient(135deg,rgba(255,255,255,0.48),rgba(245,237,222,0.72))] p-6 xl:flex">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#9A7A43]">Continue designing</p>
            <div className="mt-5 space-y-4 border-t border-[#B59C6B]/35 pt-4">
              {activityProjects.length ? activityProjects.map((project, index) => (
                <Link key={project.id} href={`/canvas?projectId=${project.id}`} className="group flex items-center gap-3 border-b border-[#17372A]/8 pb-4 last:border-0">
                  <img src={projectPreviewImages[index % projectPreviewImages.length]} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#17372A]">{project.name}</span>
                    <span className="mt-0.5 block text-[10px] text-[#17372A]/48">Edited {formatProjectDate(project.updated_at)}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#9A7A43] transition group-hover:translate-x-0.5" />
                </Link>
              )) : <p className="text-sm leading-6 text-[#17372A]/48">Your active studies will appear here.</p>}
            </div>
            <Link href="/canvas" className="mt-auto inline-flex items-center justify-between gap-2 border-b border-[#B59C6B]/55 pb-2 text-sm font-medium text-[#17372A] transition hover:border-[#9A7A43] hover:text-[#9A7A43]">
              Open recent canvases <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
