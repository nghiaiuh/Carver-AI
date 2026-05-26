import { EditorialHero, ToolCard, WaterFlowDivider } from "../gallery/components/GalleryComponents";
import { GalleryShell } from "../gallery/components/GalleryShell";
import { projects } from "../gallery/data/galleryData";

const tools = [
  ["Photo to Garden Concept", "Upload a site photo and generate landscape directions with style, material, and budget controls."],
  ["Waterfall Composer", "Sketch cascade layers, pump zones, basin logic, and stone massing before production drawings."],
  ["Koi Pond System Checker", "Review filtration, oxygen, depth, overflow, maintenance access, and viewing angles."],
  ["Rock Formation Assistant", "Plan primary peaks, secondary ridges, voids, supports, and construction sequence."],
  ["Proposal Preview Builder", "Turn a concept into a client-facing story with technical notes and score panels."],
  ["Reality Check", "Score feasibility, sustainability, maintenance, client experience, and construction practicality."],
];

export default function AIToolsPage() {
  return (
    <GalleryShell active="AI Tools">
      <EditorialHero
        eyebrow="AI Tools"
        title="Professional AI workflows for landscape concept, review, and proposal craft."
        copy="Tools designed for designers and engineers who need expressive garden visualization backed by technical judgment."
        image={projects[5].image}
      />
      <WaterFlowDivider />
      <section className="relative z-10 mx-auto grid max-w-[1560px] gap-5 px-5 pb-28 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {tools.map(([title, copy]) => (
          <ToolCard key={title} title={title} copy={copy} />
        ))}
      </section>
    </GalleryShell>
  );
}
