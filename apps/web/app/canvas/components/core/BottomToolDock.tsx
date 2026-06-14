/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Grid3X3,
  Circle,
  Eraser,
  ImagePlus,
  Library,
  Map,
  MapPin,
  MousePointer2,
  Palette,
  Pencil,
  Square,
  Type,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import type { EditorTool, LeftSidebarPanelId } from "./CanvasWorkspace";
import type { PenSettings } from "./CanvasWorkspace";
import PenSettingsPopover from "../canvas/PenSettingsPopover";
import { clamp, formatRgbLabel, hueToHex, hsvToHex, normalizeHexColor, rgbToHsv } from "../widgets/colorPickerUtils";

type BottomToolDockProps = {
  activeTool: EditorTool;
  gridVisible: boolean;
  zoom: number;
  activeLeftSidebarPanel: LeftSidebarPanelId | null;
  miniMapOpen: boolean;
  onTool: (tool: EditorTool) => void;
  onToggleGrid: () => void;
  onToggleLeftSidebarPanel: (panel: LeftSidebarPanelId) => void;
  onToggleMiniMap: () => void;
  onAddObject: () => void;
  onGenerate: () => void;
  onToast: (message: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canvasThemeColor: string;
  onCanvasThemeChange: (color: string) => void;
  penSettings: PenSettings;
  onPenSettingsChange: (settings: PenSettings) => void;
};

const tools = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "mark-position", label: "Mark", icon: MapPin },
  { id: "add-source", label: "Source", icon: ImagePlus },
  { id: "grid", label: "Grid", icon: Grid3X3 },
  { id: "draw-region", label: "Shape", icon: Square },
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "text-note", label: "Text", icon: Type },
  { id: "add-object", label: "Object", icon: Box },
  { id: "generate", label: "Generate", icon: WandSparkles },
] as const;

export default function BottomToolDock({
  activeTool,
  gridVisible,
  zoom,
  activeLeftSidebarPanel,
  miniMapOpen,
  onTool,
  onToggleGrid,
  onToggleLeftSidebarPanel,
  onToggleMiniMap,
  onAddObject,
  onGenerate,
  onToast,
  onResetZoom,
  canvasThemeColor,
  onCanvasThemeChange,
  penSettings,
  onPenSettingsChange,
}: BottomToolDockProps) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [penPopoverOpen, setPenPopoverOpen] = useState(false);
  const themePickerRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);
  const themeFieldPointerId = useRef<number | null>(null);
  const themeHuePointerId = useRef<number | null>(null);
  const themeSwatches = useMemo(() => ["#F5F5F5", "#000000", "#FFFFFF", "#14532D", "#1E1B4B", "#DDD0F5"], []);
  const normalizedThemeColor = normalizeHexColor(canvasThemeColor, "#F5F5F5");
  const themeHsv = useMemo(() => rgbToHsv({
    r: parseInt(normalizedThemeColor.slice(1, 3), 16),
    g: parseInt(normalizedThemeColor.slice(3, 5), 16),
    b: parseInt(normalizedThemeColor.slice(5, 7), 16),
  }), [normalizedThemeColor]);
  const themeRgbLabel = useMemo(() => formatRgbLabel(normalizedThemeColor), [normalizedThemeColor]);

  useEffect(() => {
    if (!themePickerOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (themePickerRef.current?.contains(target) || themeTriggerRef.current?.contains(target)) {
        return;
      }

      setThemePickerOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setThemePickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [themePickerOpen]);

  const updateThemeColorFromField = (clientX: number, clientY: number, rect: DOMRect) => {
    const saturation = clamp((clientX - rect.left) / rect.width, 0, 1);
    const value = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    onCanvasThemeChange(hsvToHex({ h: themeHsv.h, s: saturation, v: value }));
  };

  const updateThemeHue = (clientX: number, rect: DOMRect) => {
    const hue = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
    onCanvasThemeChange(hsvToHex({ h: hue, s: themeHsv.s, v: themeHsv.v }));
  };

  return (
    <>
      {themePickerOpen ? (
        <div
          ref={themePickerRef}
          className="absolute bottom-16 left-3 z-[60] w-80 overflow-hidden rounded-3xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur"
          data-canvas-ui="true"
        >
          <div className="flex h-14 items-center justify-between border-b border-[var(--canvas-theme-border)] px-5">
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">Theme</h2>
            <button
              type="button"
              title="Close theme picker"
              onClick={(event) => {
                event.stopPropagation();
                setThemePickerOpen(false);
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--canvas-theme-icon)] hover:bg-[var(--canvas-theme-hover)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div
              className="relative block h-[165px] overflow-hidden rounded-lg"
              style={{
                background:
                  `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueToHex(themeHsv.h)}`,
              }}
              role="slider"
              tabIndex={0}
              aria-label="Pick canvas theme color"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(themeHsv.s * 100)}
              onPointerDown={(event) => {
                event.stopPropagation();
                themeFieldPointerId.current = event.pointerId;
                updateThemeColorFromField(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (themeFieldPointerId.current !== event.pointerId) return;
                updateThemeColorFromField(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
              }}
              onPointerUp={(event) => {
                if (themeFieldPointerId.current !== event.pointerId) return;
                themeFieldPointerId.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                if (themeFieldPointerId.current !== event.pointerId) return;
                themeFieldPointerId.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <span
                className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.18)]"
                style={{
                  left: `${themeHsv.s * 100}%`,
                  top: `${(1 - themeHsv.v) * 100}%`,
                }}
              />
            </div>

            <div
              className="relative block h-4 rounded-full bg-[linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]"
              role="slider"
              tabIndex={0}
              aria-label="Adjust theme hue"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(themeHsv.h)}
              onPointerDown={(event) => {
                event.stopPropagation();
                themeHuePointerId.current = event.pointerId;
                updateThemeHue(event.clientX, event.currentTarget.getBoundingClientRect());
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (themeHuePointerId.current !== event.pointerId) return;
                updateThemeHue(event.clientX, event.currentTarget.getBoundingClientRect());
              }}
              onPointerUp={(event) => {
                if (themeHuePointerId.current !== event.pointerId) return;
                themeHuePointerId.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                if (themeHuePointerId.current !== event.pointerId) return;
                themeHuePointerId.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.16)]"
                style={{
                  left: `${(themeHsv.h / 360) * 100}%`,
                  backgroundColor: hueToHex(themeHsv.h),
                }}
              />
            </div>

            <div className="flex items-center gap-4">
              {themeSwatches.map((color) => {
                const selected = normalizedThemeColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    title={`Set theme ${color}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCanvasThemeChange(color);
                    }}
                    className={[
                      "h-9 w-9 rounded-full border transition",
                      selected ? "border-[#1F7AFF] ring-2 ring-[#1F7AFF]/20" : "border-[#E5E5E5] hover:scale-105",
                    ].join(" ")}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>

            <div className="flex h-9 items-center gap-2 rounded-lg bg-[var(--canvas-theme-surface-soft)] px-3 text-sm text-[var(--canvas-theme-text-muted)]">
              <span className="text-[var(--canvas-theme-text-muted)]">#</span>
              <input
                value={normalizedThemeColor.replace("#", "")}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
                  if (value.length === 6) {
                    onCanvasThemeChange(`#${value}`);
                  }
                }}
                className="w-full bg-transparent font-mono uppercase outline-none"
                aria-label="Theme hex color"
              />
              <span className="whitespace-nowrap text-xs">{themeRgbLabel}</span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTool === "pen" && penPopoverOpen ? (
        <PenSettingsPopover
          settings={penSettings}
          onChange={onPenSettingsChange}
          onClose={() => setPenPopoverOpen(false)}
        />
      ) : null}

      <div className="absolute bottom-5 left-6 z-50 flex items-center gap-2 rounded-xl bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-icon-muted)]" data-canvas-ui="true">
        <div className="flex h-8 items-center gap-2 px-2">
          <DockIcon
            buttonRef={themeTriggerRef}
            label="Theme"
            icon={Palette}
            active={themePickerOpen}
            onClick={() => setThemePickerOpen((value) => !value)}
          />
          <DockIcon
            label="Library"
            icon={Library}
            active={activeLeftSidebarPanel === "library"}
            onClick={() => onToggleLeftSidebarPanel("library")}
          />
          <DockIcon
            label="Mini map"
            icon={Map}
            active={miniMapOpen}
            onClick={onToggleMiniMap}
          />
        </div>
        <span className="h-5 w-px bg-[var(--canvas-theme-border-strong)]" aria-hidden="true" />
        <button
          type="button"
          title="Reset zoom"
          onClick={(event) => {
            event.stopPropagation();
            onResetZoom();
          }}
          className="rounded-full px-2 text-xs font-medium tabular-nums text-[var(--canvas-theme-text-muted)] hover:bg-[var(--canvas-theme-hover)]"
        >
          {zoomLabel}
        </button>
      </div>

      <div className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-1 shadow-[0_2px_10px_var(--canvas-theme-shadow)] backdrop-blur" data-canvas-ui="true">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          const selected = activeTool === tool.id || (tool.id === "grid" && gridVisible);
          const needsDivider = index === 5 || index === 6;
          return (
            <div key={tool.id} className="flex items-center">
              {needsDivider ? <span className="mx-1 h-5 w-px bg-[var(--canvas-theme-border)]" aria-hidden="true" /> : null}
              <button
                type="button"
                title={tool.label}
                onClick={(event) => {
                  event.stopPropagation();
                  if (tool.id === "grid") onToggleGrid();
                  else if (tool.id === "add-object") onAddObject();
                  else if (tool.id === "add-source") onToast("Source thumbnail added");
                  else if (tool.id === "generate") onGenerate();
                  else onTool(tool.id);
                }}
                className={[
                  "grid h-8 w-8 place-items-center rounded-lg transition",
                  selected ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]" : "text-[var(--canvas-theme-icon)] hover:bg-[var(--canvas-theme-hover)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {activeTool === "pen" ? (
        <div className="absolute bottom-[68px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-[20px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 shadow-[0_10px_28px_var(--canvas-theme-shadow)] backdrop-blur" data-canvas-ui="true">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPenPopoverOpen((value) => !value);
            }}
            className="flex items-center gap-2 rounded-2xl bg-[var(--canvas-theme-surface-soft)] px-2 py-1.5 text-sm font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
            title="Open pen settings"
          >
            <span
              className="h-6 w-6 rounded-full border border-white shadow-[0_0_0_1px_rgba(17,24,39,0.12)]"
              style={{ backgroundColor: penSettings.color, opacity: penSettings.opacity }}
            />
            <Circle className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" />
          </button>
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--canvas-theme-surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--canvas-theme-text)]">
            <span
              className="inline-block rounded-full bg-[var(--canvas-theme-text)]"
              style={{
                width: `${Math.max(penSettings.strokeWidth * 1.6, 18)}px`,
                height: `${Math.max(Math.min(penSettings.strokeWidth, 12), 2)}px`,
              }}
            />
            <span>{penSettings.strokeWidth}</span>
            <span className="text-[var(--canvas-theme-text-muted)]">Px</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DockIcon({
  buttonRef,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={label}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={[
        "grid h-7 w-7 place-items-center rounded-lg text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-icon)]",
        active ? "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-icon)]" : "",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
