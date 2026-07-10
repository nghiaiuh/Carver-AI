import type { Metadata } from "next";
import BotanicalLanding from "./components/BotanicalLanding";

export const metadata: Metadata = {
  title: "Carver AI | AI Landscape Design Studio",
  description:
    "Từ nét phác thảo đến phối cảnh sân vườn thuyết phục với canvas AI dành cho thiết kế cảnh quan.",
};

export default function HomePage() {
  return <BotanicalLanding />;
}
