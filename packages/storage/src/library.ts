import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@carver/db/server";
import type { Database } from "@carver/db";
import { createR2ObjectKey, deleteR2Objects, uploadR2Object } from "./r2";

export type LibraryFolderRow = Database["public"]["Tables"]["library_folders"]["Row"];
export type LibraryAssetRow = Database["public"]["Tables"]["library_assets"]["Row"];

export type LibraryAssetRecord = {
  id: string;
  folderId: string;
  src: string;
  originalSrc: string;
  thumbnailSrc: string;
  previewSrc: string;
  title: string;
  prompt?: string;
  source: "ai-chat" | "upload" | "manual";
  createdAt: string;
  tags: string[];
  category?: string;
  metadata: Record<string, unknown>;
};

export type LibraryFolderRecord = {
  id: string;
  title: string;
  slug: string;
  createdBy: "ai" | "user";
  createdAt: string;
  updatedAt: string;
  assets: LibraryAssetRecord[];
};

export type LibraryUploadInputFile = {
  name: string;
  type: string;
  bytes: Buffer;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const slugify = (value: string) =>
  normalizeText(value).replace(/\s+/g, "-").replace(/(^-|-$)/g, "") || "library";

export const humanizeSlug = (value: string) =>
  value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Library";

export const buildLibraryAssetRecord = (asset: LibraryAssetRow): LibraryAssetRecord => ({
  id: asset.id,
  folderId: asset.folder_id,
  src: asset.original_url,
  originalSrc: asset.original_url,
  thumbnailSrc: asset.thumb_url,
  previewSrc: asset.preview_url,
  title: asset.title,
  prompt: asset.prompt ?? undefined,
  source: asset.source_type,
  createdAt: asset.created_at,
  tags: asset.tags ?? [],
  category: asset.category ?? undefined,
  metadata: {
    ...(asset.metadata as Record<string, unknown> | null | undefined),
    originalWidth: asset.width ?? undefined,
    originalHeight: asset.height ?? undefined,
    imageUrls: {
      thumb: asset.thumb_url,
      preview: asset.preview_url,
      original: asset.original_url,
    },
  },
});

export const buildLibraryFolderRecord = (
  folder: LibraryFolderRow,
  assets: LibraryAssetRow[] = [],
): LibraryFolderRecord => ({
  id: folder.id,
  title: folder.title,
  slug: folder.slug,
  createdBy: folder.created_by === "ai" ? "ai" : "user",
  createdAt: folder.created_at,
  updatedAt: folder.updated_at,
  assets: assets.map((asset) => buildLibraryAssetRecord(asset)),
});

export const createLibraryFolder = async (params: {
  ownerId: string;
  title: string;
  createdBy?: "ai" | "user";
}) => {
  const supabase = getSupabaseAdmin();
  const title = params.title.trim();
  if (!title) {
    throw new Error("Folder title is required.");
  }

  const baseSlug = slugify(title);
  const { data: existingFolders, error: existingFoldersError } = await supabase
    .from("library_folders")
    .select("slug")
    .eq("owner_id", params.ownerId)
    .ilike("slug", `${baseSlug}%`);

  if (existingFoldersError) {
    throw new Error(existingFoldersError.message);
  }

  const usedSlugs = new Set((existingFolders ?? []).map((folder) => folder.slug));
  let slug = baseSlug;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  const { data, error } = await supabase
    .from("library_folders")
    .insert({
      owner_id: params.ownerId,
      title,
      slug,
      created_by: params.createdBy ?? "user",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create folder.");
  }

  return data as LibraryFolderRow;
};

export const renameLibraryFolder = async (params: {
  ownerId: string;
  folderId: string;
  title: string;
}) => {
  const supabase = getSupabaseAdmin();
  const title = params.title.trim();
  if (!title) {
    throw new Error("Folder title is required.");
  }

  const { data: folder, error: folderError } = await supabase
    .from("library_folders")
    .select("id, owner_id")
    .eq("id", params.folderId)
    .single();

  if (folderError || !folder || folder.owner_id !== params.ownerId) {
    throw new Error("Folder not found.");
  }

  const baseSlug = slugify(title);
  const { data: siblings, error: siblingsError } = await supabase
    .from("library_folders")
    .select("slug")
    .eq("owner_id", params.ownerId)
    .neq("id", params.folderId)
    .ilike("slug", `${baseSlug}%`);

  if (siblingsError) {
    throw new Error(siblingsError.message);
  }

  const usedSlugs = new Set((siblings ?? []).map((item) => item.slug));
  let slug = baseSlug;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  const { data, error } = await supabase
    .from("library_folders")
    .update({ title, slug })
    .eq("id", params.folderId)
    .eq("owner_id", params.ownerId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to rename folder.");
  }

  return data as LibraryFolderRow;
};

export const deleteLibraryFolder = async (params: {
  ownerId: string;
  folderId: string;
}) => {
  const supabase = getSupabaseAdmin();

  const { data: folderAssets, error: assetsError } = await supabase
    .from("library_assets")
    .select("thumb_storage_path, preview_storage_path, original_storage_path")
    .eq("owner_id", params.ownerId)
    .eq("folder_id", params.folderId);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const keys = (folderAssets ?? []).flatMap((asset) => [
    asset.thumb_storage_path,
    asset.preview_storage_path,
    asset.original_storage_path,
  ]);
  await deleteR2Objects(keys);

  const { error } = await supabase
    .from("library_folders")
    .delete()
    .eq("id", params.folderId)
    .eq("owner_id", params.ownerId);

  if (error) {
    throw new Error(error.message);
  }
};

const selectTargetFormat = (hasAlpha: boolean) => (hasAlpha ? "png" : "jpeg");

const encodeImage = async (
  input: Buffer,
  format: "png" | "jpeg",
  resize?: { width: number; height: number },
) => {
  let pipeline = sharp(input, { failOn: "none" }).rotate();

  if (resize) {
    pipeline = pipeline.resize({
      width: resize.width,
      height: resize.height,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (format === "png") {
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }

  return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
};

const getFileExtension = (format: "png" | "jpeg") => (format === "png" ? "png" : "jpg");
const MAX_IMAGE_DIMENSION = 8000;

export const listLibrary = async (ownerId: string) => {
  const supabase = getSupabaseAdmin();

  const [{ data: folders, error: foldersError }, { data: assets, error: assetsError }] =
    await Promise.all([
      supabase
        .from("library_folders")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      supabase
        .from("library_assets")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false }),
    ]);

  if (foldersError) {
    throw new Error(foldersError.message);
  }

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  return {
    folders: (folders ?? []).map((folder) =>
      buildLibraryFolderRecord(folder, (assets ?? []).filter((asset) => asset.folder_id === folder.id)),
    ),
  };
};

export const uploadLibraryAssets = async (params: {
  ownerId: string;
  folderId: string;
  files: LibraryUploadInputFile[];
  title?: string;
  prompt?: string;
  category?: string;
  tags?: string[];
  sourceType?: "ai-chat" | "upload" | "manual";
}): Promise<LibraryAssetRow[]> => {
  const supabase = getSupabaseAdmin();

  const { data: folder, error: folderError } = await supabase
    .from("library_folders")
    .select("id, owner_id, title, slug")
    .eq("id", params.folderId)
    .single();

  if (folderError || !folder || folder.owner_id !== params.ownerId) {
    throw new Error("Folder not found.");
  }

  const nextAssets: LibraryAssetRow[] = [];

  for (const file of params.files) {
    const sourceImage = sharp(file.bytes, { failOn: "none" }).rotate();
    const metadata = await sourceImage.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions.");
    }

    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      throw new Error("Image dimensions are too large.");
    }

    const targetFormat = selectTargetFormat(Boolean(metadata.hasAlpha));
    const extension = getFileExtension(targetFormat);
    const assetId = randomUUID();
    const baseParts = [params.ownerId, folder.slug, assetId];

    const originalBuffer = await encodeImage(file.bytes, targetFormat);
    const thumbBuffer = await encodeImage(file.bytes, targetFormat, { width: 360, height: 360 });
    const previewBuffer = await encodeImage(file.bytes, targetFormat, { width: 1600, height: 1600 });

    const safeFileName = file.name.replace(/\.[^.]+$/, "") || "image";
    const originalStoragePath = createR2ObjectKey([...baseParts, "original"], `${safeFileName}.${extension}`);
    const thumbStoragePath = createR2ObjectKey([...baseParts, "thumb"], `${safeFileName}.${extension}`);
    const previewStoragePath = createR2ObjectKey([...baseParts, "preview"], `${safeFileName}.${extension}`);

    const contentType = targetFormat === "png" ? "image/png" : "image/jpeg";
    const [originalUrl, thumbUrl, previewUrl] = await Promise.all([
      uploadR2Object({
        key: originalStoragePath,
        body: originalBuffer,
        contentType,
      }),
      uploadR2Object({
        key: thumbStoragePath,
        body: thumbBuffer,
        contentType,
      }),
      uploadR2Object({
        key: previewStoragePath,
        body: previewBuffer,
        contentType,
      }),
    ]);

    const title =
      params.title?.trim() ||
      file.name.replace(/\.[^.]+$/, "").trim() ||
      "Library image";

    const { data, error } = await supabase
      .from("library_assets")
      .insert({
        id: assetId,
        owner_id: params.ownerId,
        folder_id: folder.id,
        title,
        prompt: params.prompt?.trim() || null,
        category: params.category?.trim() || folder.title,
        tags: params.tags ?? [],
        source_type: params.sourceType ?? "upload",
        mime_type: contentType,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        size_bytes: originalBuffer.length,
        thumb_storage_path: thumbStoragePath,
        preview_storage_path: previewStoragePath,
        original_storage_path: originalStoragePath,
        thumb_url: thumbUrl,
        preview_url: previewUrl,
        original_url: originalUrl,
        metadata: {
          sourceFileName: file.name,
          targetFormat,
          folderSlug: folder.slug,
          folderTitle: folder.title,
          originalWidth: metadata.width ?? null,
          originalHeight: metadata.height ?? null,
          imageUrls: {
            thumb: thumbUrl,
            preview: previewUrl,
            original: originalUrl,
          },
        },
      })
      .select()
      .single();

    if (error || !data) {
      await deleteR2Objects([thumbStoragePath, previewStoragePath, originalStoragePath]);
      throw new Error(error?.message || "Unable to save library asset.");
    }

    nextAssets.push(data as LibraryAssetRow);
  }

  return nextAssets;
};

export const deleteLibraryAsset = async (params: {
  ownerId: string;
  assetId: string;
}) => {
  const supabase = getSupabaseAdmin();

  const { data: asset, error } = await supabase
    .from("library_assets")
    .select("owner_id, thumb_storage_path, preview_storage_path, original_storage_path")
    .eq("id", params.assetId)
    .single();

  if (error || !asset || asset.owner_id !== params.ownerId) {
    throw new Error("Asset not found.");
  }

  await deleteR2Objects([
    asset.thumb_storage_path,
    asset.preview_storage_path,
    asset.original_storage_path,
  ]);

  const { error: deleteError } = await supabase
    .from("library_assets")
    .delete()
    .eq("id", params.assetId)
    .eq("owner_id", params.ownerId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
};
