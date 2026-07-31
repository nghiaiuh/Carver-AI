"use client";

import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  Minus,
  Pencil,
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

function GeometryIcon({ active }: { active: boolean }) {
  const stroke = active ? "var(--canvas-theme-selection)" : "currentColor";

  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      aria-hidden="true"
      className="block h-6 w-7 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 2.5L19.5 11H8.5L14 2.5Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="6.5" cy="17.5" r="4" stroke={stroke} strokeWidth="1.8" />
      <rect x="16.5" y="13.5" width="8" height="8" stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}

function ToolbarActionButton({
  label,
  expanded = false,
  active = false,
  onClick,
  children,
}: {
  label: string;
  expanded?: boolean;
  active?: boolean;
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
        "flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl px-2",
        "text-[var(--canvas-theme-icon)] transition-colors duration-150",
        "focus-visible:outline-none",
        active && "bg-[var(--canvas-theme-hover)] text-[var(--canvas-theme-selection)]",
        !active && "hover:bg-[var(--canvas-theme-hover)]",
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
      className="relative h-full w-10 shrink-0 overflow-visible rounded-xl focus-visible:outline-none"
        style={{
          clipPath: "inset(-140px 0 0 0)",
        }}
      >
      <span
        className={classes(
          "pointer-events-none absolute inset-x-0 bottom-[-20px] flex h-[78px] items-end justify-center",
          "transition-transform duration-200 ease-out will-change-transform",
          raised ? "-translate-y-5" : "translate-y-0",
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
      <div className="relative flex h-[45px] items-center rounded-[24px] border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-2.5 shadow-[0_8px_24px_var(--canvas-theme-shadow)] backdrop-blur-xl">
        <div className="relative h-full shrink-0 overflow-visible">
          <div className="relative flex h-full items-end gap-1 border-r border-[var(--canvas-theme-border)] pr-2">
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
            onClick={() => toggle("shapes")}
          >
            <GeometryIcon active={geometryActive || flyout === "shapes"} />
          </ToolbarActionButton>
          {flyout === "shapes" ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 flex gap-1 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-2 shadow-[0_12px_32px_var(--canvas-theme-shadow)] backdrop-blur-xl">
              {SHAPES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={geometryActive && penSettings.geometryShape === id}
                  onClick={() => selectShape(id)}
                  className={classes(
                    "grid h-9 w-9 place-items-center rounded-xl transition-colors focus-visible:outline-none",
                    geometryActive && penSettings.geometryShape === id
                      ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
                      : "text-[var(--canvas-theme-icon)] hover:bg-[var(--canvas-theme-hover)]",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
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
              className="h-5 w-5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: penSettings.color }}
            />
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </ToolbarActionButton>
          {flyout === "colors" ? (
            <div className="absolute bottom-[calc(100%+12px)] left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 shadow-[0_12px_32px_var(--canvas-theme-shadow)] backdrop-blur-xl">
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
                    "h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 focus-visible:outline-none",
                    penSettings.color.toLowerCase() === color.toLowerCase()
                      ? "border-[var(--canvas-theme-text)] ring-2 ring-[var(--canvas-theme-border-strong)]"
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
            <Pencil className="h-5 w-5 shrink-0" style={{ color: penSettings.color }} strokeWidth={2} />
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </ToolbarActionButton>
          {flyout === "width" ? (
            <div className="absolute bottom-[calc(100%+12px)] right-0 w-52 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3 shadow-[0_12px_32px_var(--canvas-theme-shadow)] backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--canvas-theme-text-soft)]">
                <span>Stroke width</span>
                <span>{penSettings.strokeWidth}px</span>
              </div>
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
