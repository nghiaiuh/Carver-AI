import type { Metadata } from "next";
import CanvasBenchmarkDashboard from "./CanvasBenchmarkDashboard";

export const metadata: Metadata = {
  title: "Canvas Autosave Benchmarks",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CanvasBenchmarkPage() {
  return <CanvasBenchmarkDashboard />;
}
