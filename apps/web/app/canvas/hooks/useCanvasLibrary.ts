"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOptionalBrowserSupabaseClient } from "@carver/db/client";
import type { LibraryAsset, LibraryFolder } from "../types/library";

const LIBRARY_ACTIVE_FOLDER_KEY = "carver-ai:canvas-library-active-folder";

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

function inferFolderTitleFromPrompt(prompt?: string) {
  const normalized = (prompt ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/(cay nhiet doi|nhiet doi|tropical tree|tropical plant)/.test(normalized)) return "Cây nhiệt đới";
  if (/(tree|palm|bonsai|penjing)/.test(normalized)) {
    if (/(bonsai|penjing)/.test(normalized)) return "Penjing";
    return "Tree";
  }
  if (/(stone|rock|da|co thach)/.test(normalized)) return "Stone";
  if (/(penjing|bonsai)/.test(normalized)) return "Penjing";
  return "Uncategorized";
}

function loadStoredActiveFolderId() {
  if (typeof window === "undefined") return "";

  return window.localStorage.getItem(LIBRARY_ACTIVE_FOLDER_KEY) ?? "";
}

function persistActiveFolderId(activeFolderId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIBRARY_ACTIVE_FOLDER_KEY, activeFolderId);
}

function imageUrlToBlob(imageUrl: string) {
  return fetch(imageUrl).then((response) => {
    if (!response.ok) {
      throw new Error("Unable to read image data.");
    }

    return response.blob();
  });
}

type BrowserSupabaseClient = NonNullable<ReturnType<typeof getOptionalBrowserSupabaseClient>>;

function requireLibraryClient(client: BrowserSupabaseClient | null) {
  if (!client) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return client;
}

async function getAccessToken(supabase: BrowserSupabaseClient) {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message || "Unable to read the current session.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in to use the preset library.");
  }

  return accessToken;
}

async function authedFetch(
  supabase: BrowserSupabaseClient,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const accessToken = await getAccessToken(supabase);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}

async function refreshLibrary(supabase: BrowserSupabaseClient) {
  const response = await authedFetch(supabase, "/api/library");
  const payload = (await response.json().catch(() => ({}))) as {
    folders?: LibraryFolder[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load the library.");
  }

  return Array.isArray(payload.folders) ? payload.folders : [];
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
  return {
    id: createId("folder"),
    title,
    slug: slugify(title),
    createdBy: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assets: [],
  };
}

export function useCanvasLibrary() {
  const supabase = getOptionalBrowserSupabaseClient();
  const hydrationStateRef = useRef<"idle" | "loaded" | "synced">("idle");
  const didEnsureDefaultFolderRef = useRef(false);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>(() => loadStoredActiveFolderId());

  useEffect(() => {
    hydrationStateRef.current = "loaded";
  }, []);

  useEffect(() => {
    if (hydrationStateRef.current === "idle") return;
    persistActiveFolderId(activeFolderId);
    hydrationStateRef.current = "synced";
  }, [activeFolderId]);

  useEffect(() => {
    let cancelled = false;

    const loadLibrary = async () => {
      try {
        const nextFolders = await refreshLibrary(requireLibraryClient(supabase));
        if (cancelled) return;

        setFolders(nextFolders);
        setActiveFolderId((current) => current || nextFolders[0]?.id || "");
      } catch {
        if (!cancelled) {
          setFolders([]);
        }
      }
    };

    void loadLibrary();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? folders[0] ?? null,
    [activeFolderId, folders],
  );

  const allAssets = useMemo(() => folders.flatMap((folder) => folder.assets), [folders]);

  const createFolder = useCallback(async (title: string, createdBy: "ai" | "user" = "user") => {
    const client = requireLibraryClient(supabase);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    const response = await authedFetch(client, "/api/library/folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: trimmedTitle, createdBy }),
    });
    const payload = (await response.json().catch(() => ({}))) as { folder?: LibraryFolder; error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to create folder.");
    }

    const nextFolders = await refreshLibrary(client);
    setFolders(nextFolders);
    setActiveFolderId(payload.folder?.id || nextFolders[nextFolders.length - 1]?.id || "");

    return payload.folder ?? nextFolders[nextFolders.length - 1] ?? null;
  }, [supabase]);

  useEffect(() => {
    if (folders.length > 0) return;
    if (didEnsureDefaultFolderRef.current) return;
    if (hydrationStateRef.current !== "synced") return;
    if (!supabase) return;

    didEnsureDefaultFolderRef.current = true;

    void (async () => {
      try {
        await createFolder("Preset Library", "user");
      } catch {
        didEnsureDefaultFolderRef.current = false;
      }
    })();
  }, [folders, createFolder, supabase]);

  const renameFolder = async (folderId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const client = requireLibraryClient(supabase);

    const response = await authedFetch(client, `/api/library/folders/${folderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: trimmedTitle }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to rename folder.");
    }

    setFolders(await refreshLibrary(client));
  };

  const deleteFolder = async (folderId: string) => {
    const client = requireLibraryClient(supabase);
    const response = await authedFetch(client, `/api/library/folders/${folderId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to delete folder.");
    }

    const nextFolders = await refreshLibrary(client);
    setFolders(nextFolders);
    setActiveFolderId((current) => {
      if (current !== folderId) return current;
      return nextFolders[0]?.id ?? "";
    });
  };

  const uploadAssetsToFolder = async (
    folderId: string,
    files: FileList | File[],
    options?: {
      title?: string;
      prompt?: string;
      category?: string;
      tags?: string[];
      sourceType?: "ai-chat" | "upload" | "manual";
    },
  ) => {
    const fileList = Array.from(files).filter((file): file is File => file instanceof File && file.type.startsWith("image/"));
    if (fileList.length === 0) return [];
    const client = requireLibraryClient(supabase);

    const formData = new FormData();
    fileList.forEach((file) => formData.append("files", file));
    if (options?.title) formData.append("title", options.title);
    if (options?.prompt) formData.append("prompt", options.prompt);
    if (options?.category) formData.append("category", options.category);
    if (options?.sourceType) formData.append("sourceType", options.sourceType);
    if (options?.tags?.length) formData.append("tags", JSON.stringify(options.tags));

    const response = await authedFetch(client, `/api/library/folders/${folderId}/assets`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      assets?: LibraryAsset[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to upload images.");
    }

    const nextFolders = await refreshLibrary(client);
    setFolders(nextFolders);

    return payload.assets ?? [];
  };

  const removeAssetFromFolder = async (folderId: string, assetId: string) => {
    const client = requireLibraryClient(supabase);
    const response = await authedFetch(client, `/api/library/assets/${assetId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to delete library asset.");
    }

    setFolders(await refreshLibrary(client));
    setActiveFolderId((current) => current || folderId);
  };

  const addAiResultToLibrary = async (params: {
    imageUrl: string;
    prompt?: string;
    suggestedFolderTitle?: string;
    title?: string;
    metadata?: LibraryAsset["metadata"];
  }) => {
    const imageBlob = await imageUrlToBlob(params.imageUrl);
    const resolvedFolder = getOrCreateFolderForAiResult({
      folders,
      suggestedFolderTitle: params.suggestedFolderTitle,
      prompt: params.prompt,
    });

    const existingFolder = folders.find((folder) => folder.id === resolvedFolder.id);
    const folderId =
      existingFolder?.id ||
      (await createFolder(resolvedFolder.title, "ai"))?.id ||
      resolvedFolder.id;

    const fileName = `${params.title ?? params.metadata?.speciesName ?? "ai-result"}.png`;
    const uploaded = await uploadAssetsToFolder(folderId, [new File([imageBlob], fileName, { type: imageBlob.type || "image/png" })], {
      title: params.title ?? params.metadata?.speciesName ?? params.suggestedFolderTitle ?? "AI result",
      prompt: params.prompt,
      category: params.suggestedFolderTitle ?? resolvedFolder.title,
      sourceType: "ai-chat",
    });

    setActiveFolderId(folderId);

    return uploaded[0] ?? null;
  };

  const syncLibraryFromBucket = async () => {
    const client = requireLibraryClient(supabase);
    const response = await authedFetch(client, "/api/library/sync", {
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      summary?: {
        createdAssets?: number;
        createdFolders?: number;
      };
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to sync the library.");
    }

    setFolders(await refreshLibrary(client));
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
    addAssetToFolder: async (folderId: string, asset: LibraryAsset) => {
      const folder = folders.find((item) => item.id === folderId);
      if (!folder) {
        throw new Error("Folder not found.");
      }

      const previewUrl = asset.previewSrc ?? asset.thumbnailSrc ?? asset.src;
      const originalUrl = asset.originalSrc ?? asset.src;
      const nextAsset: LibraryAsset = {
        ...asset,
        previewSrc: previewUrl,
        originalSrc: originalUrl,
        thumbnailSrc: asset.thumbnailSrc ?? previewUrl,
        metadata: {
          ...(asset.metadata ?? {}),
          folderId,
          folderTitle: folder.title,
          folderSlug: folder.slug,
        },
      };

      setFolders((current) =>
        current.map((item) =>
          item.id === folderId
            ? {
                ...item,
                assets: [nextAsset, ...item.assets],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );

      return nextAsset;
    },
    removeAssetFromFolder,
    uploadAssetsToFolder,
    addAiResultToLibrary,
    syncLibraryFromBucket,
  };
}
