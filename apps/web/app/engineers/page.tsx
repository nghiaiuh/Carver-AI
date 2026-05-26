import { EngineerCard, EditorialHero, WaterFlowDivider } from "../gallery/components/GalleryComponents";
import { GalleryShell } from "../gallery/components/GalleryShell";
import { engineers, projects } from "../gallery/data/galleryData";

const groups = [
  "Top landscape designers",
  "Top waterfall specialists",
  "Top koi pond designers",
  "Top rock formation artists",
  "Top AI-assisted creators",
];

export default function EngineersPage() {
  return (
    <GalleryShell active="Engineers">
      <EditorialHero
        eyebrow="Engineer Ranking"
        title="Meet the designers and specialists shaping reviewed garden work."
        copy="A ranking surface for landscape designers, waterfall engineers, koi pond designers, rock formation artists, and AI-assisted creators."
        image={projects[3].image}
      />
      <WaterFlowDivider />
      <section className="relative z-10 mx-auto max-w-[1560px] px-5 pb-28 lg:px-8">
        <div className="mb-8 flex gap-2 overflow-x-auto">
          {groups.map((group, index) => (
            <span key={group} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${index === 0 ? "bg-[#101412] text-[#f8f5ee]" : "bg-white/60 text-black/58"}`}>
              {group}
            </span>
          ))}
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {engineers.map((engineer) => (
            <EngineerCard key={engineer.name} engineer={engineer} />
          ))}
        </div>
      </section>
    </GalleryShell>
  );
}
