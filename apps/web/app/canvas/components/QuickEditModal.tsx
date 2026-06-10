/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { X } from "lucide-react";

type QuickEditModalProps = {
  open: boolean;
  promptText: string;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
};

const chips = ["Keep layout", "Add koi pond", "Add waterfall", "Low maintenance", "Make it luxury", "Generate 3 angles"];

export default function QuickEditModal({ open, promptText, onPromptChange, onClose, onApply }: QuickEditModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop fixed inset-0 z-[100] grid place-items-center bg-black/18 p-6 backdrop-blur-sm">
      <div className="quick-edit-modal w-full max-w-xl rounded-[28px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-6 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[var(--canvas-theme-text)]">Quick Edit</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--canvas-theme-text-muted)]">Tell Carver what to change in the selected image.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-icon-muted)] hover:text-[var(--canvas-theme-icon)]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <textarea
          value={promptText}
          onChange={(event) => onPromptChange(event.target.value)}
          className="mt-5 min-h-36 w-full resize-none rounded-3xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] p-4 text-sm font-semibold text-[var(--canvas-theme-text)] outline-none placeholder:text-[var(--canvas-theme-text-muted)] focus:border-[#6D5DFB] focus:ring-4 focus:ring-[#6D5DFB]/10"
          placeholder="Add a small koi pond here, keep the house unchanged, use tropical plants..."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button key={chip} onClick={() => onPromptChange(promptText ? `${promptText} ${chip}.` : `${chip}.`)} className="rounded-full bg-[var(--canvas-theme-surface-muted)] px-3 py-1.5 text-xs font-black text-[var(--canvas-theme-text-muted)] hover:bg-[var(--canvas-theme-hover)] hover:text-[#6D5DFB]">
              {chip}
            </button>
          ))}
        </div>
        <button onClick={onApply} className="mt-5 w-full rounded-2xl bg-[var(--canvas-theme-active)] px-4 py-3 text-sm font-black text-[var(--canvas-theme-active-text)]">
          Apply Edit
        </button>
      </div>
    </div>
  );
}
