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
    <div className="mt-14">
      <div className="mb-7 flex items-end justify-between gap-4 border-b border-[#17372A]/15 pb-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#17372A]">Recent projects</h3>
          <p className="mt-2 text-sm font-medium text-[#17372A]/48">
            {status === "authenticated"
              ? "Tiếp tục phát triển những phương án gần đây của bạn."
              : "Đăng nhập để xem các dự án cảnh quan đã lưu."}
          </p>
        </div>
        <Link
          href={status === "authenticated" ? "/canvas" : buildAuthPageHref("/login", pathname, "recent-projects")}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#62755B] transition hover:text-[#17372A]"
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => void createProject()}
          disabled={creatingProject}
          className="group flex min-h-[232px] flex-col justify-between rounded-[1.5rem] border border-dashed border-[#17372A]/22 bg-[#F5F2E9]/55 p-6 text-left transition hover:border-[#62755B] hover:bg-[#F5F2E9] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full border border-[#17372A]/18 text-[#17372A] transition group-hover:rotate-[-8deg] group-hover:bg-[#C7F36B]">
            {creatingProject ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /> : <Plus className="h-8 w-8" aria-hidden="true" />}
          </span>
          <div>
            <span className="font-[family-name:var(--font-botanical-display)] text-2xl font-semibold tracking-[-0.03em]">Dự án mới</span>
            <p className="mt-2 text-sm font-medium leading-6 text-[#17372A]/48">
              {status === "authenticated" ? "Mở một canvas cảnh quan mới" : "Đăng nhập để tạo project đầu tiên"}
            </p>
          </div>
        </button>

        {status === "loading" || loadingProjects ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`project-skeleton-${index}`}
              className="min-h-[232px] rounded-[1.5rem] border border-[#17372A]/8 bg-[#F5F2E9]/60 p-5"
            >
              <div className="h-28 animate-pulse rounded-[1.2rem] bg-black/[0.05]" />
              <div className="mt-4 h-5 w-2/3 animate-pulse rounded-full bg-black/[0.06]" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded-full bg-black/[0.05]" />
            </div>
          ))
        ) : status !== "authenticated" ? (
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
        ) : recentProjects.length === 0 ? (
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
              className="group flex min-h-[232px] flex-col overflow-hidden rounded-[1.5rem] border border-[#17372A]/12 bg-[#F5F2E9] transition hover:-translate-y-1 hover:border-[#62755B]/45 hover:shadow-[0_20px_50px_rgba(23,55,42,0.10)]"
            >
              <div
                className="flex h-[124px] items-end justify-between px-5 py-4 text-white"
                style={{
                  background: [
                    "linear-gradient(135deg, rgba(23,55,42,0.98), rgba(98,117,91,0.86))",
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
                <h3 className="font-[family-name:var(--font-botanical-display)] text-xl font-semibold leading-tight tracking-[-0.025em] text-[#17372A] transition group-hover:text-[#62755B]">
                  {project.name}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#17372A]/52">
                  {buildProjectSubtitle(project)}
                </p>
                <div className="mt-auto flex items-center justify-between pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#17372A]/38">
                  <span>Updated {formatProjectDate(project.updated_at)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[#62755B]">
                    Mở
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
