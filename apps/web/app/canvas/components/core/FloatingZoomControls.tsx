"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Map, Layers, ChevronDown, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type FloatingZoomControlsProps = {
  zoomPercentage?: number;
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
  onZoomIn,
  onZoomOut,
  onZoomSelect,
  onFitAll,
  onResetView,
  onToggleMinimap,
  onGiveFeedback,
}: FloatingZoomControlsProps) {
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

  const zoomLevels = [25, 50, 75, 100, 150, 200];

  return (
    <div className="relative z-[90] flex items-center gap-2" ref={menuRef}>
      {/* Feedback Button Capsule */}
      <button
        type="button"
        onClick={onGiveFeedback}
        className="flex items-center gap-2 rounded-2xl border border-[#E5E3DC] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#1A1918] shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md transition hover:bg-white active:scale-95"
      >
        <MessageSquare className="h-3.5 w-3.5 text-[#827E75]" />
        <span>Give feedback</span>
      </button>

      {/* Main Zoom & View Cluster */}
      <div className="flex items-center gap-1 rounded-2xl border border-[#E5E3DC] bg-white/90 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
        {/* Layer View Button */}
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
          title="Layer views"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>

        {/* Minimap Button */}
        <button
          type="button"
          onClick={onToggleMinimap}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
          title="Toggle Canvas Overview Map"
        >
          <Map className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-[1px] bg-[#E5E3DC]" />

        {/* Zoom Percentage Dropdown */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F2F0E9]"
        >
          <span>{Math.round(zoomPercentage)}%</span>
          <ChevronDown className="h-3.5 w-3.5 text-[#827E75]" />
        </button>
      </div>

      {/* Zoom Dropdown Popover */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl border border-[#E5E3DC] bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between p-1">
            <button
              type="button"
              onClick={() => {
                onZoomOut?.();
                setIsOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F8F7F3] text-[#1A1918] hover:bg-[#F2F0E9]"
              title="Zoom out (-)"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-[#1A1918]">{Math.round(zoomPercentage)}%</span>
            <button
              type="button"
              onClick={() => {
                onZoomIn?.();
                setIsOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F8F7F3] text-[#1A1918] hover:bg-[#F2F0E9]"
              title="Zoom in (+)"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          <div className="my-1 border-t border-[#F2F0E9]" />
          {zoomLevels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => {
                onZoomSelect?.(lvl);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
            >
              <span>{lvl}%</span>
            </button>
          ))}
          <div className="my-1 border-t border-[#F2F0E9]" />
          <button
            type="button"
            onClick={() => {
              onFitAll?.();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Maximize2 className="h-3.5 w-3.5 text-[#827E75]" />
            <span>Fit All Nodes</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onResetView?.();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <span>Reset View (100%)</span>
          </button>
        </div>
      )}
    </div>
  );
}
