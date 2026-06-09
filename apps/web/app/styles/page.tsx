/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import { EditorialHero, GardenStyleCard, WaterFlowDivider } from "../gallery/components/GalleryComponents";
import { GalleryShell } from "../gallery/components/GalleryShell";
import { projects, styleDirectory } from "../gallery/data/galleryData";

export default function StylesPage() {
  return (
    <GalleryShell active="Styles">
      <EditorialHero
        eyebrow="Garden Style Directory"
        title="World garden languages, translated into buildable landscape systems."
        copy="Explore Vietnamese, Chinese, Japanese, tropical, Mediterranean, rooftop, balcony, koi pond, and waterfall rock garden styles with material and difficulty notes."
        image={projects[1].image}
      />
      <WaterFlowDivider />
      <section className="relative z-10 mx-auto grid max-w-[1560px] gap-5 px-5 pb-28 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {styleDirectory.map((style) => (
          <GardenStyleCard key={style.name} style={style} />
        ))}
      </section>
    </GalleryShell>
  );
}
