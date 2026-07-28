"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronDown, Check, Download, Copy, Trash2 } from "lucide-react";
import Link from "next/link";

type FloatingProjectNavProps = {
  projectName: string;
  snapshotStatus: string;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  onSave?: () => void;
  onExport?: () => void;
};

export default function FloatingProjectNav({
  projectName,
  snapshotStatus,
  isSaving,
  hasUnsavedChanges,
  onSave,
  onExport,
}: FloatingProjectNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative z-[90]" ref={menuRef}>
      <div className="flex items-center gap-1.5 rounded-2xl border border-[#E5E3DC] bg-white/90 p-1.5 pl-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:border-[#D8D5CB] hover:bg-white">
        <Link
          href="/dashboard"
          className="flex h-7 w-7 items-center justify-center rounded-xl transition hover:bg-[#F2F0E9]"
          title="Back to projects"
        >
          <ChevronLeft className="h-4 w-4 text-[#4A4843]" />
        </Link>

        {/* Carver Leaf Icon */}
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#FFF5F0] text-[#EA7542]">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 3.87 2.19 7.23 5.41 8.94l2.45-3.67A5.98 5.98 0 0 1 8 12c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.95-.93 3.68-2.37 4.78l2.12 3.19C21.16 18.23 22 15.25 22 12c0-5.52-4.48-10-10-10zm-1 9V5h2v6h-2z" />
          </svg>
        </div>

        {/* Project Name & Status */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-1 text-left"
        >
          <span className="max-w-[180px] truncate text-sm font-semibold text-[#1A1918]">
            {projectName}
          </span>

          {/* Status dot */}
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isSaving
                ? "animate-pulse bg-amber-500"
                : hasUnsavedChanges
                ? "bg-amber-400"
                : "bg-emerald-500"
            }`}
            title={snapshotStatus}
          />

          <ChevronDown className="h-3.5 w-3.5 text-[#827E75]" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border border-[#E5E3DC] bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-2 text-xs font-medium text-[#827E75]">
            Project Settings
          </div>
          <button
            type="button"
            onClick={() => {
              onSave?.();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Check className="h-4 w-4 text-emerald-600" />
            <span>Save Version Now</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onExport?.();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Download className="h-4 w-4 text-[#827E75]" />
            <span>Export Workflow</span>
          </button>
          <div className="my-1 border-t border-[#F2F0E9]" />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Copy className="h-4 w-4 text-[#827E75]" />
            <span>Duplicate Project</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
            <span>Delete Project</span>
          </button>
        </div>
      )}
    </div>
  );
}
