"use client";

import type { LibraryAsset, LibraryFolder } from "../types/library";
import LibrarySidebar from "./LibrarySidebar";

type EditorLeftSidebarProps = {
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

export default function EditorLeftSidebar(props: EditorLeftSidebarProps) {
  return <LibrarySidebar {...props} />;
}
