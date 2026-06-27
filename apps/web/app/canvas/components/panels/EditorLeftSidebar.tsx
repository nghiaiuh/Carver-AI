"use client";

import type { LibraryAsset, LibraryFolder } from "../../types/library";
import type { CanvasPresetChild, LeftSidebarPanelId, PresetGroupCategory } from "../../types/canvas";
import type { CanvasLanguage } from "../../i18n";
import LibrarySidebar from "../library/LibrarySidebar";

type EditorLeftSidebarProps = {
  language: CanvasLanguage;
  panel: LeftSidebarPanelId;
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
  onUpsertPresetGroup: (params: {
    category: PresetGroupCategory;
    title: string;
    children: CanvasPresetChild[];
    sourceFolderId?: string;
    replaceAllChildren?: boolean;
  }) => void;
  onUploadAssets: (folderId: string, files: FileList | File[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
};

export default function EditorLeftSidebar(props: EditorLeftSidebarProps) {
  switch (props.panel) {
    case "adjust-render":
      return <SidebarPlaceholder title="Adjust render" description="This panel can host render sliders, tone controls, and output presets later." onClose={props.onClose} />;
    case "library":
    default:
      return (
        <LibrarySidebar
          language={props.language}
          folders={props.folders}
          activeFolderId={props.activeFolderId}
          selectedAssetId={props.selectedAssetId}
          onSelectFolder={props.onSelectFolder}
          onSelectAsset={props.onSelectAsset}
          onCreateFolder={props.onCreateFolder}
          onRenameFolder={props.onRenameFolder}
          onDeleteFolder={props.onDeleteFolder}
          onDeleteAsset={props.onDeleteAsset}
          onAddAssetToCanvas={props.onAddAssetToCanvas}
          onUpsertPresetGroup={props.onUpsertPresetGroup}
          onUploadAssets={props.onUploadAssets}
          onClose={props.onClose}
          onToast={props.onToast}
        />
      );
  }
}

function SidebarPlaceholder({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]">
      <div className="flex h-14 items-center justify-between border-b border-[var(--canvas-theme-border)] px-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">{title}</h2>
          <p className="text-xs text-[var(--canvas-theme-text-muted)]">Future sidebar panel.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          title={`Close ${title.toLowerCase()}`}
        >
          X
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <div className="rounded-3xl border border-dashed border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-4">
          <p className="text-sm font-semibold text-[var(--canvas-theme-text)]">{description}</p>
        </div>
      </div>
    </aside>
  );
}
