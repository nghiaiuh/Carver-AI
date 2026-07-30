"use client";

import React, { useState, useRef, useEffect } from "react";
import { Layers, Lock, Unlock, Plus, Check } from "lucide-react";

type FloatingPageControlsProps = {
  currentPageName?: string;
  isLocked?: boolean;
  onToggleLock?: () => void;
};

export default function FloatingPageControls({
  currentPageName = "Page 1",
  isLocked = false,
  onToggleLock,
}: FloatingPageControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pages, setPages] = useState(["Page 1", "Concept Variations 2"]);
  const [activePage, setActivePage] = useState(currentPageName);
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
    <div className="relative z-[90] flex items-center gap-2" ref={menuRef}>
      <div className="flex items-center gap-1 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/90 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
        {/* Page Switcher Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
        >
          <Layers className="h-4 w-4 text-[var(--canvas-theme-selection)]" />
          <span>{activePage}</span>
        </button>

        <div className="h-4 w-[1px] bg-[var(--canvas-theme-border)]" />

        {/* Lock Canvas Button */}
        <button
          type="button"
          onClick={onToggleLock}
          className={`flex h-7 w-7 items-center justify-center rounded-xl transition ${
            isLocked ? "bg-[var(--canvas-theme-warning-soft)] text-[var(--canvas-theme-warning)]" : "text-[var(--canvas-theme-icon)] hover:bg-[var(--canvas-theme-hover)]"
          }`}
          title={isLocked ? "Unlock Canvas" : "Lock Canvas against changes"}
        >
          {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Pages Dropdown Popover */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--canvas-theme-text-muted)]">Workflow Pages</div>
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setActivePage(p);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
            >
              <span>{p}</span>
              {activePage === p && <Check className="h-3.5 w-3.5 text-[var(--canvas-theme-selection)]" />}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--canvas-theme-border)]" />
          <button
            type="button"
            onClick={() => {
              const newName = `Page ${pages.length + 1}`;
              setPages([...pages, newName]);
              setActivePage(newName);
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--canvas-theme-selection)] transition hover:bg-[var(--canvas-theme-selection-soft)]"
          >
            <Plus className="h-4 w-4" />
            <span>Add New Page</span>
          </button>
        </div>
      )}
    </div>
  );
}
