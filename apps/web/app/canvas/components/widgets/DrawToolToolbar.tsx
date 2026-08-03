"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  Minus,
  Square,
  Triangle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditorTool, PenGeometryShape, PenSettings } from "../../types/canvas";
import { EraserIcon, PencilIcon } from "./DrawInstrumentIcons";

type DrawToolToolbarProps = {
  activeTool: EditorTool;
  penSettings: PenSettings;
  onTool: (tool: EditorTool) => void;
  onPenSettingsChange: (update: Partial<PenSettings>) => void;
};

type Flyout = "shapes" | "colors" | "width" | null;
type InstrumentKind = "pencil" | "eraser";

const COLORS = ["#111111", "#FFFFFF", "#F04444", "#FF7417", "#F4B900", "#25C66A", "#3B82F6", "#8757E8", "#E84393", "#8B95A7"];
const SHAPES: Array<{ id: PenGeometryShape; label: string; icon: typeof Square }> = [
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "square", label: "Square", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "triangle", label: "Triangle", icon: Triangle },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "line", label: "Straight line", icon: Minus },
];

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function GeometryIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="block h-6 w-6 shrink-0 transition-transform duration-200 scale-110 group-hover:scale-125"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 3L22.928 15H9.072Z"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="6.5"
        cy="25"
        r="5.75"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="18.5"
        y="19.25"
        width="11.5"
        height="11.5"
        rx="0.75"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToolbarActionButton({
  label,
  expanded = false,
  active = false,
  hoverless = false,
  className,
  onClick,
  children,
}: {
  label: string;
  expanded?: boolean;
  active?: boolean;
  hoverless?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={active || undefined}
      title={label}
      onClick={onClick}
      className={classes(
        "group flex h-8 min-w-0 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5",
        "text-[var(--canvas-theme-icon)] transition-all duration-150",
        "focus-visible:outline-none",
        active && "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-text)]",
        !active && !hoverless && "hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function LiftToolButton({
  kind,
  raised,
  selected,
  graphiteColor,
  onHoverChange,
  onClick,
}: {
  kind: InstrumentKind;
  raised: boolean;
  selected: boolean;
  graphiteColor: string;
  onHoverChange: (kind: InstrumentKind | null) => void;
  onClick: () => void;
}) {
  const label = kind === "pencil" ? "Pencil" : "Eraser";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      onMouseEnter={() => onHoverChange(kind)}
      onMouseLeave={() => onHoverChange(null)}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-t-lg px-1.5 transition-all duration-200 focus-visible:outline-none"
        style={{
          clipPath: "inset(-140px 0 0 0)",
        }}
      >
      <span
        className={classes(
          "pointer-events-none absolute inset-x-0 bottom-[-20px] flex h-[82px] items-end justify-center",
          "transition-transform duration-200 ease-out will-change-transform",
          raised ? "-translate-y-2" : "translate-y-1 brightness-75",
        )}
      >
        {kind === "pencil" ? (
          <PencilIcon className="block h-auto w-5 shrink-0" graphiteColor={graphiteColor} />
        ) : (
          <EraserIcon className="block h-auto w-5 shrink-0" />
        )}
      </span>
    </button>
  );
}

export default function DrawToolToolbar({ activeTool, penSettings, onTool, onPenSettingsChange }: DrawToolToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [hoveredInstrument, setHoveredInstrument] = useState<InstrumentKind | null>(null);
  const pencilActive = activeTool === "pen" && penSettings.drawingMode === "freehand";
  const eraserActive = activeTool === "eraser";
  const geometryActive = activeTool === "pen" && penSettings.drawingMode === "geometry";
  const previewStrokeWidth = Math.min(3.4, Math.max(1.3, penSettings.strokeWidth / 5.5));

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFlyout(null);
    };

    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  const toggle = (next: Exclude<Flyout, null>) => setFlyout((current) => (current === next ? null : next));

  const selectShape = (shape: PenGeometryShape) => {
    onPenSettingsChange({ drawingMode: "geometry", geometryShape: shape });
    onTool("pen");
    setFlyout(null);
  };

  const selectInstrument = (kind: InstrumentKind) => {
    setFlyout(null);
    if (kind === "pencil") {
      onPenSettingsChange({ drawingMode: "freehand" });
      onTool("pen");
      return;
    }
    onTool("eraser");
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute bottom-6 left-1/2 z-[230] -translate-x-1/2"
      data-canvas-ui="true"
    >
      <div className="relative flex h-10 items-center gap-2 rounded-full border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/90 px-4 shadow-[0_8px_24px_var(--canvas-theme-shadow)] backdrop-blur-xl">
        <div className="relative h-full shrink-0 overflow-visible">
          <div className="relative flex h-full items-end gap-0">
            {(["pencil", "eraser"] as const).map((kind) => {
              const selected = kind === "pencil" ? pencilActive : eraserActive;
              const raised = selected || hoveredInstrument === kind;
              return (
                <LiftToolButton
                  key={kind}
                  kind={kind}
                  selected={selected}
                  raised={raised}
                  graphiteColor={penSettings.color}
                  onHoverChange={setHoveredInstrument}
                  onClick={() => selectInstrument(kind)}
                />
              );
            })}
          </div>
        </div>

        <div className="relative shrink-0">
          <ToolbarActionButton
            label="Geometry"
            expanded={flyout === "shapes"}
            active={geometryActive || flyout === "shapes"}
            hoverless={!geometryActive && flyout !== "shapes"}
            onClick={() => toggle("shapes")}
          >
            <GeometryIcon />
          </ToolbarActionButton>
          {flyout === "shapes" ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 flex gap-1 rounded-[22px] border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/95 p-1.5 shadow-[0_16px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl">
              {SHAPES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={geometryActive && penSettings.geometryShape === id}
                  onClick={() => selectShape(id)}
                  className={classes(
                    "grid h-5 w-8 place-items-center rounded-xl transition-all focus-visible:outline-none",
                    geometryActive && penSettings.geometryShape === id
                      ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
                      : "text-[var(--canvas-theme-icon)] hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative shrink-0">
          <ToolbarActionButton
            label="Stroke color"
            expanded={flyout === "colors"}
            active={flyout === "colors"}
            onClick={() => toggle("colors")}
          >
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-white/10"
              style={{ backgroundColor: penSettings.color }}
            />
            <motion.span
              animate={{ rotate: flyout === "colors" ? 180 : 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex shrink-0"
            >
              <ChevronDown className="h-3 w-3 shrink-0" />
            </motion.span>
          </ToolbarActionButton>
          {flyout === "colors" ? (
            <div className="absolute bottom-[calc(100%+12px)] left-1/2 flex -translate-x-20 gap-1.5 rounded-full border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/95 px-2.5 py-1.5 shadow-[0_16px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use ${color}`}
                  aria-pressed={penSettings.color.toLowerCase() === color.toLowerCase()}
                  onClick={() => {
                    onPenSettingsChange({ color });
                    setFlyout(null);
                  }}
                  className={classes(
                    "h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 focus-visible:outline-none",
                    penSettings.color.toLowerCase() === color.toLowerCase()
                      ? "border-white ring-2 ring-white/20"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative shrink-0">
          <ToolbarActionButton
            label="Stroke width"
            expanded={flyout === "width"}
            active={flyout === "width"}
            onClick={() => toggle("width")}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5 shrink-0">
              <path
                d="M 4 18 C 5 16, 6 14, 8 13 C 10 12, 11 14, 13 15 C 15 16, 16 14, 18 12 C 19 11, 20 9, 21 7"
                stroke={penSettings.color}
                fill="none"
                strokeWidth={previewStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <motion.span
              animate={{ rotate: flyout === "width" ? 180 : 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex shrink-0"
            >
              <ChevronDown className="h-3 w-3 shrink-0" />
            </motion.span>
          </ToolbarActionButton>
          {flyout === "width" ? (
            <div className="absolute bottom-[calc(100%+12px)] right-0 flex w-[180px] translate-x-4 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3 shadow-[0_16px_40px_var(--canvas-theme-shadow)] backdrop-blur-xl">
              <input
                aria-label="Stroke width"
                type="range"
                min="2"
                max="42"
                value={penSettings.strokeWidth}
                onChange={(event) => onPenSettingsChange({ strokeWidth: Number(event.target.value) })}
                className="h-1 w-full cursor-pointer accent-[var(--canvas-theme-selection)]"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
