/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import { notFound } from "next/navigation";
import { projects } from "../../gallery/data/galleryData";
import { ProjectDetailClient } from "./ProjectDetailClient";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((item) => item.slug === slug);
  if (!project) notFound();

  return <ProjectDetailClient project={project} />;
}
