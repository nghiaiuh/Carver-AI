/*
 * Flow: Provides a typed module for the Carver AI app.
 * 1. Define local data, helpers, or UI.
 * 2. Export the public function/component/types.
 * 3. Support the surrounding feature with focused logic.
 */

import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
