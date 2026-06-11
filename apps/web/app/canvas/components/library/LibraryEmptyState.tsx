"use client";

import { FolderOpenDot } from "lucide-react";

export default function LibraryEmptyState() {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-slate-500">
          <FolderOpenDot className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-100">No assets yet</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Add images from AI chat or upload manually</p>
      </div>
    </div>
  );
}
