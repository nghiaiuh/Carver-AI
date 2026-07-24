import type { Metadata } from "next";
import { requireInternalAdminPage } from "../../../lib/server/internalAccess";
import AiJobBenchmarkDashboard from "./AiJobBenchmarkDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Job Reliability Benchmarks",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AiJobBenchmarkPage() {
  await requireInternalAdminPage();
  return <AiJobBenchmarkDashboard />;
}
