"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import type { LibraryFolder } from "../types/library";

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
    <div className="border-b border-white/10 px-4 pb-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          {folders.map((folder) => {
            const active = folder.id === activeFolderId;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                className={[
                  "shrink-0 border-b px-1 py-2 text-sm font-semibold transition",
                  active ? "border-sky-300 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900",
                ].join(" ")}
                title={folder.title}
              >
                <span className="block max-w-24 truncate">{folder.title}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCreateFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-800 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Folder
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onRenameFolder}
          disabled={!activeFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-800 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Rename
        </button>
        <button
          type="button"
          onClick={onDeleteFolder}
          disabled={!activeFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete
        </button>
      </div>
    </div>
  );
}
