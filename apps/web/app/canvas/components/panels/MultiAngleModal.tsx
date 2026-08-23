/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasCameraShotPreset, CanvasMultiAnglesMode } from "../../types/canvas";
import { CAMERA_SHOT_PRESETS } from "../../utils/cameraShotHelpers";

const DEFAULT_SELECTED_SHOT_IDS: CanvasCameraShotPreset[] = ["eye-level"];

type MultiAngleModalProps = {
  open: boolean;
  onClose: () => void;
  onGenerate: (
    selectedShotIds: CanvasCameraShotPreset[],
    mode: CanvasMultiAnglesMode,
  ) => void;
  initialMode?: CanvasMultiAnglesMode;
  initialShotIds?: CanvasCameraShotPreset[];
  title?: string;
  description?: string;
  actionLabel?: string;
};

export default function MultiAngleModal({
  open,
  onClose,
  onGenerate,
  initialMode = "orbit",
  initialShotIds = DEFAULT_SELECTED_SHOT_IDS,
  title = "Create Multi-Angle Set",
  description = "Create a reusable camera plan, then connect it to an Image Generator or Assistant.",
  actionLabel = "Add Camera Shot Set",
}: MultiAngleModalProps) {
  const [selectedShotIds, setSelectedShotIds] = useState<CanvasCameraShotPreset[]>(initialShotIds);
  const [mode, setMode] = useState<CanvasMultiAnglesMode>(initialMode);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setSelectedShotIds(initialShotIds.length > 0 ? initialShotIds : DEFAULT_SELECTED_SHOT_IDS);
    setMode(initialMode);
  }, [initialMode, initialShotIds, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/18 p-6 backdrop-blur-sm"
      data-canvas-interactive="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="multi-angle-modal w-full max-w-2xl rounded-[28px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-6 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[var(--canvas-theme-text)]">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--canvas-theme-text-muted)]">{description}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-icon-muted)] hover:text-[var(--canvas-theme-icon)]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {([
            { value: "orbit", label: "Orbit 360", description: "Place cameras around the scene." },
            { value: "plan", label: "Plan Surface", description: "Place cameras from the site plan." },
          ] as const).map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${selected ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]" : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]"}`}
              >
                <p className="text-sm font-black text-[var(--canvas-theme-text)]">{option.label}</p>
                <p className="mt-1 text-xs font-medium text-[var(--canvas-theme-text-muted)]">{option.description}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {CAMERA_SHOT_PRESETS.map((shot) => {
            const selected = selectedShotIds.includes(shot.id);
            return (
              <button
                key={shot.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedShotIds((current) =>
                  selected
                    ? (current.length > 1 ? current.filter((id) => id !== shot.id) : current)
                    : [...current, shot.id],
                )}
                className={`rounded-3xl border p-4 text-left transition ${selected ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]" : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]"}`}
              >
                <Camera className="h-5 w-5 text-[var(--canvas-theme-selection)]" aria-hidden="true" />
                <p className="mt-8 text-sm font-black text-[var(--canvas-theme-text)]">{shot.label}</p>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={selectedShotIds.length === 0}
          onClick={() => onGenerate(selectedShotIds, mode)}
          className="mt-5 w-full rounded-2xl bg-[var(--canvas-theme-active)] px-4 py-3 text-sm font-black text-[var(--canvas-theme-active-text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {actionLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
