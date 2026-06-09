/*
 * Flow: Renders a Next.js App Router page.
 * 1. Compose page-level layout and content.
 * 2. Pull reusable UI/data modules as needed.
 * 3. Return the route UI for users.
 */

import CanvasWorkspace from "./components/CanvasWorkspace";

export default function CanvasPage() {
  return <CanvasWorkspace />;
}
