import type { Metadata } from "next";
import AiJobBenchmarkDashboard from "./AiJobBenchmarkDashboard";

export const metadata: Metadata = {
  title: "AI Job Reliability Benchmarks",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AiJobBenchmarkPage() {
  return <AiJobBenchmarkDashboard />;
}
