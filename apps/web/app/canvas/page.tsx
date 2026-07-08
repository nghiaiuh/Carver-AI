/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import CanvasWorkspace from "./components/core/CanvasWorkspace";

function resolveProjectId(value: string | string[] | undefined) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : undefined;
}

type CanvasSearchParams = {
  projectId?: string | string[];
  project?: string | string[];
};

function isPromiseLike<T>(value: Promise<T> | T | undefined): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === "function";
}

export default async function CanvasPage({
  searchParams,
}: {
  searchParams?: Promise<CanvasSearchParams> | CanvasSearchParams;
}) {
  const resolvedSearchParams: CanvasSearchParams | undefined = isPromiseLike(searchParams)
    ? await searchParams
    : searchParams;

  const projectId =
    resolveProjectId(resolvedSearchParams?.projectId) ??
    resolveProjectId(resolvedSearchParams?.project);

  return <CanvasWorkspace projectId={projectId} />;
}
