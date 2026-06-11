/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useState } from "react";

type GroupNameTagModalProps = {
  open: boolean;
  lineCount: number;
  onClose: () => void;
  onCreate: (nameTag: string) => void;
};

export default function GroupNameTagModal({ open, lineCount, onClose, onCreate }: GroupNameTagModalProps) {
  const [nameTag, setNameTag] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/20 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-2xl shadow-black/20">
        <p className="text-sm font-black text-[#111827]">Group + Name Tag</p>
        <p className="mt-2 text-xs leading-5 text-[#667085]">
          Group {lineCount} sketch line{lineCount === 1 ? "" : "s"} and name it so Carver knows what object this drawing represents.
        </p>
        <input
          value={nameTag}
          onChange={(event) => setNameTag(event.target.value)}
          placeholder="e.g. cay tung, da co thach, hon non bo"
          className="mt-4 h-12 w-full rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] px-4 text-sm font-bold text-[#111827] outline-none transition focus:border-[#3B82F6] focus:bg-white"
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm font-black text-[#667085] hover:bg-[#F7F8FA]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const trimmed = nameTag.trim();
              if (!trimmed) return;
              onCreate(trimmed);
              setNameTag("");
            }}
            className="rounded-2xl bg-[#111827] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/15 disabled:opacity-40"
            disabled={!nameTag.trim()}
          >
            Create group
          </button>
        </div>
      </div>
    </div>
  );
}

