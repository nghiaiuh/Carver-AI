"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import type { LibraryFolder } from "../../types/library";

type LibraryFolderTabsProps = {
  folders: LibraryFolder[];
  activeFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: () => void;
  onDeleteFolder: () => void;
};

export default function LibraryFolderTabs({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: LibraryFolderTabsProps) {
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onCreateFolder}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        New folder
      </button>

      <div className="space-y-2">
        {folders.map((folder) => {
          const active = folder.id === activeFolderId;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelectFolder(folder.id)}
              className={[
                "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition",
                active
                  ? "border-[var(--canvas-theme-active)] bg-[var(--canvas-theme-active)]/10"
                  : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] hover:bg-[var(--canvas-theme-hover)]",
              ].join(" ")}
              title={folder.title}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--canvas-theme-text)]">{folder.title}</p>
              </div>
              <span className="rounded-full bg-[var(--canvas-theme-surface-soft)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--canvas-theme-text-muted)]">
                {folder.createdBy === "ai" ? "AI" : "User"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--canvas-theme-border)] pt-3">
        <button
          type="button"
          onClick={onRenameFolder}
          disabled={!activeFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Rename
        </button>
        <button
          type="button"
          onClick={onDeleteFolder}
          disabled={!activeFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 text-xs font-semibold text-[#B42318] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </button>
      </div>
    </div>
  );
}
