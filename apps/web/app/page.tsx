import type { Metadata } from "next";
import BotanicalLanding from "./components/BotanicalLanding";

export const metadata: Metadata = {
  title: "Carver AI | AI Landscape Design Studio",
  description:
    "From site photo to premium landscape concepts with an AI canvas built for controlled garden and outdoor design.",
};

export default function HomePage() {
  return <BotanicalLanding />;
}
