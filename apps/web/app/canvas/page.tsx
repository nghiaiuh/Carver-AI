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

export default function CanvasPage({
  searchParams,
}: {
  searchParams?: {
    projectId?: string | string[];
    project?: string | string[];
  };
}) {
  const projectId =
    resolveProjectId(searchParams?.projectId) ??
    resolveProjectId(searchParams?.project);

  return <CanvasWorkspace projectId={projectId} />;
}
