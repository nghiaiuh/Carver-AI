"use client";

import { ChevronUp, FolderSearch, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { LibraryAsset, LibraryFolder } from "../types/library";
import LibraryAssetGrid from "./LibraryAssetGrid";
import LibraryFolderTabs from "./LibraryFolderTabs";

type LibrarySidebarProps = {
  folders: LibraryFolder[];
  activeFolderId: string;
  selectedAssetId: string | null;
  onSelectFolder: (folderId: string) => void;
  onSelectAsset: (assetId: string) => void;
  onCreateFolder: (title: string, createdBy?: "ai" | "user") => LibraryFolder | null;
  onRenameFolder: (folderId: string, title: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteAsset: (folderId: string, assetId: string) => void;
  onAddAssetToCanvas: (asset: LibraryAsset) => void;
  onUploadAssets: (folderId: string, files: FileList | File[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

export default function LibrarySidebar({
  folders,
  activeFolderId,
  selectedAssetId,
  onSelectFolder,
  onSelectAsset,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteAsset,
  onAddAssetToCanvas,
  onUploadAssets,
  onClose,
  onToast,
}: LibrarySidebarProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? folders[0] ?? null,
    [activeFolderId, folders],
  );

  const requestCreateFolder = () => {
    const title = window.prompt("New folder name", "");
    if (!title?.trim()) return;
    const folder = onCreateFolder(title, "user");
    if (folder) onToast(`Folder "${folder.title}" created`);
  };

  const requestRenameFolder = () => {
    if (!activeFolder) return;
    const title = window.prompt("Rename folder", activeFolder.title);
    if (!title?.trim() || title.trim() === activeFolder.title) return;
    onRenameFolder(activeFolder.id, title);
    onToast(`Folder renamed to "${title.trim()}"`);
  };

  const requestDeleteFolder = () => {
    if (!activeFolder) return;
    if (!window.confirm(`Delete folder "${activeFolder.title}" and all its assets?`)) return;
    onDeleteFolder(activeFolder.id);
    onToast(`Folder "${activeFolder.title}" deleted`);
  };

  const requestDeleteAsset = (asset: LibraryAsset) => {
    if (!activeFolder) return;
    if (!window.confirm(`Delete "${asset.title ?? "this asset"}" from library?`)) return;
    onDeleteAsset(activeFolder.id, asset.id);
    onToast(`Removed "${asset.title ?? "asset"}"`);
  };

  const requestPreviewAsset = (asset: LibraryAsset) => {
    window.open(asset.src, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="flex h-full w-[324px] shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files && activeFolder) {
            onUploadAssets(activeFolder.id, event.target.files);
          }
          event.target.value = "";
        }}
      />

      <div className="flex h-14 items-center justify-between px-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">Library</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          title="Close library"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-[var(--canvas-theme-border)] px-4 pb-4 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--canvas-theme-text)]">History</h3>
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
            title={historyOpen ? "Collapse history" : "Expand history"}
          >
            <ChevronUp className={["h-3.5 w-3.5 transition-transform", historyOpen ? "" : "rotate-180"].join(" ")} aria-hidden="true" />
          </button>
        </div>
        <div className={["overflow-hidden transition-[max-height,opacity,padding] duration-200", historyOpen ? "max-h-40 pt-3 opacity-100" : "max-h-0 pt-0 opacity-0"].join(" ")}>
          <div className="grid min-h-[108px] place-items-center rounded-2xl border border-dashed border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)] text-center">
            <div>
              <FolderSearch className="mx-auto h-8 w-8 text-[var(--canvas-theme-text-muted)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[var(--canvas-theme-text-muted)]">No history yet</p>
            </div>
          </div>
        </div>
      </div>

      <LibraryFolderTabs
        folders={folders}
        activeFolderId={activeFolderId}
        onSelectFolder={onSelectFolder}
        onCreateFolder={requestCreateFolder}
        onRenameFolder={requestRenameFolder}
        onDeleteFolder={requestDeleteFolder}
      />

      <div className="flex items-center justify-between border-b border-[var(--canvas-theme-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--canvas-theme-text)]">{activeFolder?.title ?? "Library"}</p>
          <p className="text-xs text-[var(--canvas-theme-text-muted)]">{activeFolder?.assets.length ?? 0} assets</p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeFolder}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2.5 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Add image
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <LibraryAssetGrid
          assets={activeFolder?.assets ?? []}
          selectedAssetId={selectedAssetId}
          onSelectAsset={onSelectAsset}
          onAddToCanvas={onAddAssetToCanvas}
          onDeleteAsset={requestDeleteAsset}
          onPreviewAsset={requestPreviewAsset}
        />
      </div>
    </aside>
  );
}
