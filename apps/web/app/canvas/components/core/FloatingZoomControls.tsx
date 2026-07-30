"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Map, Maximize2, MessageSquare, Palette, ZoomIn, ZoomOut } from "lucide-react";
import { CANVAS_THEME_OPTIONS, type CanvasTheme } from "./canvasThemeStyle";

type FloatingZoomControlsProps = {
  zoomPercentage?: number;
  theme: CanvasTheme;
  onThemeChange: (theme: CanvasTheme) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomSelect?: (zoom: number) => void;
  onFitAll?: () => void;
  onResetView?: () => void;
  onToggleMinimap?: () => void;
  onGiveFeedback?: () => void;
};

export default function FloatingZoomControls({
  zoomPercentage = 22,
  theme,
  onThemeChange,
  onZoomIn,
  onZoomOut,
  onZoomSelect,
  onFitAll,
  onResetView,
  onToggleMinimap,
  onGiveFeedback,
}: FloatingZoomControlsProps) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsZoomOpen(false);
        setIsThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const zoomLevels = [25, 50, 75, 100, 150, 200];

  return (
    <div className="relative z-[90] flex items-center gap-2" ref={menuRef}>
      <button
        type="button"
        onClick={onGiveFeedback}
        className="flex items-center gap-2 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text)] shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md transition hover:bg-[var(--canvas-theme-surface)] active:scale-95"
      >
        <MessageSquare className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" />
        <span>Give feedback</span>
      </button>

      <div className="flex items-center gap-1 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/90 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            setIsThemeOpen((open) => !open);
            setIsZoomOpen(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
          title="Change theme"
          aria-label="Change canvas theme"
          aria-expanded={isThemeOpen}
        >
          <Palette className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleMinimap}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
          title="Toggle Canvas Overview Map"
        >
          <Map className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-[1px] bg-[var(--canvas-theme-border)]" />

        <button
          type="button"
          onClick={() => {
            setIsZoomOpen((open) => !open);
            setIsThemeOpen(false);
          }}
          className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
        >
          <span>{Math.round(zoomPercentage)}%</span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" />
        </button>
      </div>

      {isThemeOpen ? (
        <div className="absolute bottom-full right-0 mb-2 w-44 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          <div className="px-2.5 py-1.5 text-xs font-medium text-[var(--canvas-theme-text-muted)]">Canvas theme</div>
          {CANVAS_THEME_OPTIONS.map((option) => {
            const selected = option.id === theme;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onThemeChange(option.id);
                  setIsThemeOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
              >
                <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: option.swatch }} />
                <span className="flex-1">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5 text-[var(--canvas-theme-selection)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {isZoomOpen ? (
        <div className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between p-1">
            <button type="button" onClick={() => { onZoomOut?.(); setIsZoomOpen(false); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]" title="Zoom out (-)"><ZoomOut className="h-4 w-4" /></button>
            <span className="text-xs font-bold text-[var(--canvas-theme-text)]">{Math.round(zoomPercentage)}%</span>
            <button type="button" onClick={() => { onZoomIn?.(); setIsZoomOpen(false); }} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]" title="Zoom in (+)"><ZoomIn className="h-4 w-4" /></button>
          </div>
          <div className="my-1 border-t border-[var(--canvas-theme-border)]" />
          {zoomLevels.map((level) => <button key={level} type="button" onClick={() => { onZoomSelect?.(level); setIsZoomOpen(false); }} className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"><span>{level}%</span></button>)}
          <div className="my-1 border-t border-[var(--canvas-theme-border)]" />
          <button type="button" onClick={() => { onFitAll?.(); setIsZoomOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"><Maximize2 className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" /><span>Fit All Nodes</span></button>
          <button type="button" onClick={() => { onResetView?.(); setIsZoomOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"><span>Reset View (100%)</span></button>
        </div>
      ) : null}
    </div>
  );
}
