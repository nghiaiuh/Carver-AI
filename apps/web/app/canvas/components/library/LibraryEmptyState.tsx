"use client";

import { FolderOpenDot } from "lucide-react";

export default function LibraryEmptyState() {
  return (
    <div className="grid min-h-[240px] place-items-center rounded-[24px] border border-dashed border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)] p-6 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text-muted)]">
          <FolderOpenDot className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--canvas-theme-text)]">No assets yet</p>
        <p className="mt-1 text-xs leading-5 text-[var(--canvas-theme-text-muted)]">
          Add images from AI chat or upload manually.
        </p>
      </div>
    </div>
  );
}
