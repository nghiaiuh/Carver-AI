import { EditorialHero, SubmitProjectForm, WaterFlowDivider } from "../gallery/components/GalleryComponents";
import { GalleryShell } from "../gallery/components/GalleryShell";
import { projects } from "../gallery/data/galleryData";

export default function SubmitPage() {
  return (
    <GalleryShell active="Submit">
      <EditorialHero
        eyebrow="Submit Project"
        title="Publish a garden concept for designer and engineer review."
        copy="Submit technical descriptions, materials, construction methods, AI tools, cost logic, and maintenance notes through an editorial multi-step form."
        image={projects[4].image}
      />
      <WaterFlowDivider />
      <section className="relative z-10 mx-auto max-w-[1560px] px-5 pb-32 lg:px-8">
        <SubmitProjectForm />
      </section>
    </GalleryShell>
  );
}
