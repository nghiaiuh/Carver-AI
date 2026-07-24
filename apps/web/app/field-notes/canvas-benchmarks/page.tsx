import type { Metadata } from "next";
import { requireInternalAdminPage } from "../../../lib/server/internalAccess";
import CanvasBenchmarkDashboard from "./CanvasBenchmarkDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canvas Autosave Benchmarks",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CanvasBenchmarkPage() {
  await requireInternalAdminPage();
  return <CanvasBenchmarkDashboard />;
}
