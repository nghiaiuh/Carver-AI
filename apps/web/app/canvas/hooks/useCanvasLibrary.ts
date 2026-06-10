"use client";

import { useMemo, useState } from "react";
import type { LibraryAsset, LibraryFolder } from "../types/library";

const seedAssetCatalog = {
  treeA: "/assets/garden_3d_render.png",
  treeB: "/assets/mark_generation.png",
  stoneA: "/assets/canvas_texture.png",
  penjingA: "/assets/garden_3d_render.png",
  penjingB: "/assets/mark_generation.png",
} as const;

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createAsset(partial: Omit<LibraryAsset, "id" | "createdAt">): LibraryAsset {
  return {
    id: createId("asset"),
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function createFolderRecord(title: string, createdBy: "ai" | "user", assets: LibraryAsset[] = []): LibraryFolder {
  const now = new Date().toISOString();
  return {
    id: createId("folder"),
    title,
    slug: slugify(title),
    createdBy,
    createdAt: now,
    updatedAt: now,
    assets,
  };
}

function createSeedLibraryFolders(): LibraryFolder[] {
  return [
    createFolderRecord("Tree", "user", [
      createAsset({
        src: seedAssetCatalog.treeA,
        thumbnailSrc: seedAssetCatalog.treeA,
        title: "Villa canopy tree",
        prompt: "Large tropical tree with sculpted crown for villa entrance",
        source: "manual",
        metadata: { speciesName: "Tropical Tree", categoryHint: "Tree", originalWidth: 1522, originalHeight: 1146 },
      }),
      createAsset({
        src: seedAssetCatalog.treeB,
        thumbnailSrc: seedAssetCatalog.treeB,
        title: "Palm cluster",
        prompt: "Palm cluster for warm courtyard composition",
        source: "manual",
        metadata: { speciesName: "Palm", categoryHint: "Tree", originalWidth: 1522, originalHeight: 1146 },
      }),
    ]),
    createFolderRecord("Stone", "user", [
      createAsset({
        src: seedAssetCatalog.stoneA,
        thumbnailSrc: seedAssetCatalog.stoneA,
        title: "Moss stone texture",
        prompt: "Weathered stone slab with subtle moss cover",
        source: "manual",
        metadata: { categoryHint: "Stone", originalWidth: 1200, originalHeight: 900 },
      }),
      createAsset({
        src: seedAssetCatalog.treeB,
        thumbnailSrc: seedAssetCatalog.treeB,
        title: "Pond edge boulder",
        prompt: "Rounded stone for koi pond edge transition",
        source: "manual",
        metadata: { categoryHint: "Stone", originalWidth: 1522, originalHeight: 1146 },
      }),
    ]),
    createFolderRecord("Penjing", "user", [
      createAsset({
        src: seedAssetCatalog.penjingA,
        thumbnailSrc: seedAssetCatalog.penjingA,
        title: "Penjing focal composition",
        prompt: "Compact penjing focal tree for landing zone",
        source: "manual",
        metadata: { speciesName: "Penjing", categoryHint: "Penjing", originalWidth: 1522, originalHeight: 1146 },
      }),
      createAsset({
        src: seedAssetCatalog.penjingB,
        thumbnailSrc: seedAssetCatalog.penjingB,
        title: "Courtyard bonsai cluster",
        prompt: "Curated bonsai grouping for stone court",
        source: "manual",
        metadata: { speciesName: "Bonsai", categoryHint: "Penjing", originalWidth: 1522, originalHeight: 1146 },
      }),
    ]),
  ];
}

function inferFolderTitleFromPrompt(prompt?: string) {
  const normalized = (prompt ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Keep this intentionally simple so we can replace it with AI taxonomy later.
  if (/(cay nhiet doi|nhiet doi|tropical tree|tropical plant)/.test(normalized)) return "Cây nhiệt đới";
  if (/(tree|palm|bonsai|penjing)/.test(normalized)) {
    if (/(bonsai|penjing)/.test(normalized)) return "Penjing";
    return "Tree";
  }
  if (/(stone|rock|da|co thach)/.test(normalized)) return "Stone";
  if (/(penjing|bonsai)/.test(normalized)) return "Penjing";
  return "Uncategorized";
}

export function getOrCreateFolderForAiResult({
  folders,
  suggestedFolderTitle,
  prompt,
}: {
  folders: LibraryFolder[];
  suggestedFolderTitle?: string;
  prompt?: string;
}): LibraryFolder {
  const title = (suggestedFolderTitle?.trim() || inferFolderTitleFromPrompt(prompt)).trim();
  const existing = folders.find((folder) => folder.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing;
  return createFolderRecord(title, "ai");
}

export function useCanvasLibrary() {
  const [initialState] = useState(() => {
    const seededFolders = createSeedLibraryFolders();
    return {
      folders: seededFolders,
      activeFolderId: seededFolders[0]?.id ?? "",
    };
  });
  const [folders, setFolders] = useState<LibraryFolder[]>(initialState.folders);
  const [activeFolderId, setActiveFolderId] = useState<string>(initialState.activeFolderId);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? folders[0] ?? null,
    [activeFolderId, folders],
  );

  const allAssets = useMemo(() => folders.flatMap((folder) => folder.assets), [folders]);

  const createFolder = (title: string, createdBy: "ai" | "user" = "user") => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;
    const nextFolder = createFolderRecord(trimmedTitle, createdBy);
    setFolders((current) => [...current, nextFolder]);
    setActiveFolderId(nextFolder.id);
    return nextFolder;
  };

  const renameFolder = (folderId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, title: trimmedTitle, slug: slugify(trimmedTitle), updatedAt: new Date().toISOString() }
          : folder,
      ),
    );
  };

  const deleteFolder = (folderId: string) => {
    setFolders((current) => {
      const nextFolders = current.filter((folder) => folder.id !== folderId);
      if (activeFolderId === folderId && nextFolders[0]) {
        setActiveFolderId(nextFolders[0].id);
      }
      return nextFolders;
    });
  };

  const addAssetToFolder = (folderId: string, asset: LibraryAsset) => {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, updatedAt: new Date().toISOString(), assets: [asset, ...folder.assets] }
          : folder,
      ),
    );
  };

  const removeAssetFromFolder = (folderId: string, assetId: string) => {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, updatedAt: new Date().toISOString(), assets: folder.assets.filter((asset) => asset.id !== assetId) }
          : folder,
      ),
    );
  };

  const addAiResultToLibrary = (params: {
    imageUrl: string;
    prompt?: string;
    suggestedFolderTitle?: string;
    title?: string;
    metadata?: LibraryAsset["metadata"];
  }) => {
    const asset = createAsset({
      src: params.imageUrl,
      thumbnailSrc: params.imageUrl,
      title: params.title ?? params.metadata?.speciesName ?? params.suggestedFolderTitle ?? "AI result",
      prompt: params.prompt,
      source: "ai-chat",
      metadata: params.metadata,
    });

    setFolders((current) => {
      const resolvedFolder = getOrCreateFolderForAiResult({
        folders: current,
        suggestedFolderTitle: params.suggestedFolderTitle,
        prompt: params.prompt,
      });

      const exists = current.some((folder) => folder.id === resolvedFolder.id);
      const nextFolders = exists
        ? current.map((folder) =>
            folder.id === resolvedFolder.id
              ? { ...folder, updatedAt: new Date().toISOString(), assets: [asset, ...folder.assets] }
              : folder,
          )
        : [...current, { ...resolvedFolder, assets: [asset, ...resolvedFolder.assets] }];

      setActiveFolderId(resolvedFolder.id);
      return nextFolders;
    });

    return asset;
  };

  return {
    folders,
    activeFolder,
    activeFolderId,
    allAssets,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    addAssetToFolder,
    removeAssetFromFolder,
    addAiResultToLibrary,
  };
}
