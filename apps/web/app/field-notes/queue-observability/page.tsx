import type { Metadata } from "next";
import { requireInternalAdminPage } from "../../../lib/server/internalAccess";
import QueueObservabilityDashboard from "./QueueObservabilityDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Queue Observability",
  robots: { index: false, follow: false },
};

export default async function QueueObservabilityPage() {
  await requireInternalAdminPage();
  return <QueueObservabilityDashboard />;
}
