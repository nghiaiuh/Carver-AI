import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "@carver/db/server";
import {
  createLibraryFolder,
  humanizeSlug,
  listLibrary,
  type LibraryFolderRow,
} from "./library";
import {
  createR2ObjectKey,
  deleteR2Objects,
  getR2ObjectBuffer,
  getR2PublicUrl,
  listR2Objects,
  uploadR2Object,
  type R2ObjectSummary,
} from "./r2";

type ParsedLibraryObjectKey = {
  ownerId: string;
  folderSlug: string;
  assetId: string;
  variant: "thumb" | "preview" | "original";
  objectKey: string;
  fileName: string;
};

type SyncGroup =
  | {
      mode: "managed";
      ownerId: string;
      folderSlug: string;
      assetId: string;
      original: R2ObjectSummary & { key: string };
      thumb: R2ObjectSummary & { key: string };
      preview: R2ObjectSummary & { key: string };
    }
  | {
      mode: "single";
      ownerId: string;
      folderSlug: string;
      folderTitle: string;
      assetId: string;
      sourceKey: string;
      sourceFileName: string;
      sourceObject: R2ObjectSummary & { key: string };
    };

type SyncResult = {
  scannedObjects: number;
  matchedObjects: number;
  matchedGroups: number;
  createdFolders: number;
  createdAssets: number;
  skippedExisting: number;
  skippedIncomplete: number;
  failedAssets: number;
  errors: Array<{ key?: string; message: string }>;
};

const KNOWN_VARIANTS = new Set(["thumb", "preview", "original"] as const);
const SUPPORTED_STANDALONE_IMAGE_KEY = /\.(png|jpe?g|webp|gif)$/i;

const parseObjectKey = (key: string): ParsedLibraryObjectKey | null => {
  const parts = key.split("/").filter(Boolean);
  if (parts.length < 5) return null;

  const [ownerId, folderSlug, assetId, variant, ...rest] = parts;
  if (!ownerId || !folderSlug || !assetId || !KNOWN_VARIANTS.has(variant as ParsedLibraryObjectKey["variant"])) {
    return null;
  }

  return {
    ownerId,
    folderSlug,
    assetId,
    variant: variant as ParsedLibraryObjectKey["variant"],
    objectKey: key,
    fileName: rest.join("/") || key,
  };
};

const normalizeSyncPrefix = (prefix: string) => {
  const cleaned = prefix.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `${cleaned}/` : "";
};

const isStandaloneImageKey = (key: string) => SUPPORTED_STANDALONE_IMAGE_KEY.test(key);

const extractSourceName = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const match = baseName.match(/^\d+-[a-f0-9]{8}-(.+)$/i);
  const raw = (match?.[1] ?? baseName).trim();
  return raw || "image";
};

const humanizeSourceName = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Library Image";

const inferMimeType = (key: string) => {
  const extension = key.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
};

const inferTargetFormat = (params: { mimeType: string; hasAlpha: boolean }) => {
  if (params.mimeType === "image/webp") return "webp";
  if (params.mimeType === "image/png") return "png";
  if (params.hasAlpha) return "png";
  return "jpeg";
};

const getFileExtension = (format: "png" | "jpeg" | "webp") => {
  if (format === "png") return "png";
  if (format === "webp") return "webp";
  return "jpg";
};

const encodeImage = async (
  input: Buffer,
  format: "png" | "jpeg" | "webp",
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

  if (format === "webp") {
    return pipeline.webp({ quality: 90 }).toBuffer();
  }

  return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
};

const getFolderBaseTitle = (prefix: string) => {
  const trimmed = prefix.replace(/\/+$/g, "");
  const lastSegment = trimmed.split("/").filter(Boolean).pop() || "Library";
  return humanizeSlug(lastSegment);
};

export async function syncLibraryFromBucket(params: {
  ownerId: string;
  sourcePrefix?: string;
}) {
  const supabase = getSupabaseAdmin();
  const sourcePrefix = normalizeSyncPrefix(params.sourcePrefix ?? "library preset/");
  const folderTitle = getFolderBaseTitle(sourcePrefix);

  const [{ data: existingFolders, error: foldersError }, { data: existingAssets, error: assetsError }, r2Objects] =
    await Promise.all([
      supabase
        .from("library_folders")
        .select("*")
        .eq("owner_id", params.ownerId)
        .order("created_at", { ascending: true }),
      supabase
        .from("library_assets")
        .select("*")
        .eq("owner_id", params.ownerId)
        .order("created_at", { ascending: false }),
      listR2Objects({ prefix: sourcePrefix }),
    ]);

  if (foldersError) {
    throw new Error(foldersError.message);
  }

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const folderBySlug = new Map<string, LibraryFolderRow>((existingFolders ?? []).map((folder) => [folder.slug, folder]));
  const existingStoragePaths = new Set(
    (existingAssets ?? []).flatMap((asset) => [
      asset.thumb_storage_path,
      asset.preview_storage_path,
      asset.original_storage_path,
    ]),
  );

  const groups = new Map<string, SyncGroup>();
  let matchedObjects = 0;

  for (const object of r2Objects) {
    const parsed = parseObjectKey(object.key);
    if (parsed && parsed.ownerId === params.ownerId) {
      matchedObjects += 1;
      const groupKey = `${parsed.folderSlug}/${parsed.assetId}`;
      const nextGroup = groups.get(groupKey) as Extract<SyncGroup, { mode: "managed" }> | undefined;

      if (nextGroup) {
        nextGroup[parsed.variant] = {
          key: parsed.objectKey,
          size: object.size,
          lastModified: object.lastModified,
          eTag: object.eTag,
        } as R2ObjectSummary & { key: string };
      } else {
        const createdGroup: Extract<SyncGroup, { mode: "managed" }> = {
          mode: "managed",
          ownerId: parsed.ownerId,
          folderSlug: parsed.folderSlug,
          assetId: parsed.assetId,
          original: {
            key: parsed.variant === "original" ? parsed.objectKey : "",
            size: object.size,
            lastModified: object.lastModified,
            eTag: object.eTag,
          },
          thumb: {
            key: parsed.variant === "thumb" ? parsed.objectKey : "",
            size: object.size,
            lastModified: object.lastModified,
            eTag: object.eTag,
          },
          preview: {
            key: parsed.variant === "preview" ? parsed.objectKey : "",
            size: object.size,
            lastModified: object.lastModified,
            eTag: object.eTag,
          },
        };

        groups.set(groupKey, createdGroup);
      }
      continue;
    }

    if (!isStandaloneImageKey(object.key)) {
      continue;
    }

    matchedObjects += 1;
    const assetId = randomUUID();
    const groupKey = `single:${object.key}`;
    groups.set(groupKey, {
      mode: "single",
      ownerId: params.ownerId,
      folderSlug: sourcePrefix.replace(/\/+$/g, "").split("/").filter(Boolean).pop() || "library-preset",
      folderTitle,
      assetId,
      sourceKey: object.key,
      sourceFileName: object.key.split("/").pop() || "image",
      sourceObject: {
        key: object.key,
        size: object.size,
        lastModified: object.lastModified,
        eTag: object.eTag,
      },
    });
  }

  const summary: SyncResult = {
    scannedObjects: r2Objects.length,
    matchedObjects,
    matchedGroups: groups.size,
    createdFolders: 0,
    createdAssets: 0,
    skippedExisting: 0,
    skippedIncomplete: 0,
    failedAssets: 0,
    errors: [],
  };

  const ensureFolder = async (folderSlug: string, title: string) => {
    const existing = folderBySlug.get(folderSlug);
    if (existing) return existing;

    const folder = await createLibraryFolder({
      ownerId: params.ownerId,
      title,
      createdBy: "user",
    });
    folderBySlug.set(folder.slug, folder);
    summary.createdFolders += 1;
    return folder;
  };

  for (const group of groups.values()) {
    try {
      if (group.mode === "managed") {
        const original = group.original.key ? group.original : null;
        const thumb = group.thumb.key ? group.thumb : null;
        const preview = group.preview.key ? group.preview : null;

        if (!original || !thumb || !preview) {
          summary.skippedIncomplete += 1;
          continue;
        }

        if (
          existingStoragePaths.has(original.key) ||
          existingStoragePaths.has(thumb.key) ||
          existingStoragePaths.has(preview.key)
        ) {
          summary.skippedExisting += 1;
          continue;
        }

        const folder = await ensureFolder(group.folderSlug, humanizeSlug(group.folderSlug));
        const originalBuffer = await getR2ObjectBuffer(original.key);
        const metadata = await sharp(originalBuffer, { failOn: "none" }).rotate().metadata();
        const sourceFileName = extractSourceName(group.original.key.split("/").pop() || "image");
        const title = humanizeSourceName(sourceFileName);
        const mimeType = inferMimeType(original.key);
        const targetFormat = inferTargetFormat({ mimeType, hasAlpha: Boolean(metadata.hasAlpha) });
        const originalUrl = getR2PublicUrl(original.key);
        const thumbUrl = getR2PublicUrl(thumb.key);
        const previewUrl = getR2PublicUrl(preview.key);

        const { data, error } = await supabase
          .from("library_assets")
          .insert({
            id: group.assetId,
            owner_id: params.ownerId,
            folder_id: folder.id,
            title,
            prompt: null,
            category: folder.title,
            tags: [],
            source_type: "manual",
            mime_type: mimeType,
            width: metadata.width ?? null,
            height: metadata.height ?? null,
            size_bytes: original.size,
            thumb_storage_path: thumb.key,
            preview_storage_path: preview.key,
            original_storage_path: original.key,
            thumb_url: thumbUrl,
            preview_url: previewUrl,
            original_url: originalUrl,
            metadata: {
              importedFrom: "cloudflare-r2",
              importedAt: new Date().toISOString(),
              folderSlug: group.folderSlug,
              folderTitle: folder.title,
              sourceFileName,
              sourceAssetId: group.assetId,
              sourceVariants: {
                thumb: thumb.key,
                preview: preview.key,
                original: original.key,
              },
              imageUrls: {
                thumb: thumbUrl,
                preview: previewUrl,
                original: originalUrl,
              },
              targetFormat,
            },
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(error?.message || "Unable to save synced library asset.");
        }

        existingStoragePaths.add(original.key);
        existingStoragePaths.add(thumb.key);
        existingStoragePaths.add(preview.key);
        summary.createdAssets += 1;
        continue;
      }

      const original = group.sourceObject;
      if (existingStoragePaths.has(original.key)) {
        summary.skippedExisting += 1;
        continue;
      }

      const folder = await ensureFolder(group.folderSlug, group.folderTitle);
      const originalBuffer = await getR2ObjectBuffer(original.key);
      const metadata = await sharp(originalBuffer, { failOn: "none" }).rotate().metadata();
      const mimeType = inferMimeType(original.key);
      const targetFormat = inferTargetFormat({ mimeType, hasAlpha: Boolean(metadata.hasAlpha) });
      const sourceFileName = extractSourceName(group.sourceFileName);
      const title = humanizeSourceName(sourceFileName);
      const safeFileName = sourceFileName.replace(/\.[^.]+$/, "") || "image";
      const outputFileName = `${safeFileName}.${getFileExtension(targetFormat)}`;
      const thumbStoragePath = createR2ObjectKey([params.ownerId, group.folderSlug, group.assetId, "thumb"], outputFileName);
      const previewStoragePath = createR2ObjectKey([params.ownerId, group.folderSlug, group.assetId, "preview"], outputFileName);

      const [thumbBuffer, previewBuffer] = await Promise.all([
        encodeImage(originalBuffer, targetFormat, { width: 360, height: 360 }),
        encodeImage(originalBuffer, targetFormat, { width: 1600, height: 1600 }),
      ]);

      const [thumbUrl, previewUrl] = await Promise.all([
        uploadR2Object({
          key: thumbStoragePath,
          body: thumbBuffer,
          contentType: mimeType === "image/webp" ? "image/webp" : targetFormat === "png" ? "image/png" : "image/jpeg",
        }),
        uploadR2Object({
          key: previewStoragePath,
          body: previewBuffer,
          contentType: mimeType === "image/webp" ? "image/webp" : targetFormat === "png" ? "image/png" : "image/jpeg",
        }),
      ]);

      const originalUrl = getR2PublicUrl(original.key);
      const { data, error } = await supabase
        .from("library_assets")
        .insert({
          id: group.assetId,
          owner_id: params.ownerId,
          folder_id: folder.id,
          title,
          prompt: null,
          category: folder.title,
          tags: [],
          source_type: "manual",
          mime_type: mimeType,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          size_bytes: original.size,
          thumb_storage_path: thumbStoragePath,
          preview_storage_path: previewStoragePath,
          original_storage_path: original.key,
          thumb_url: thumbUrl,
          preview_url: previewUrl,
          original_url: originalUrl,
          metadata: {
            importedFrom: "cloudflare-r2",
            importedAt: new Date().toISOString(),
            folderSlug: group.folderSlug,
            folderTitle: folder.title,
            sourceFileName,
            sourceAssetId: group.assetId,
            sourceOriginalKey: original.key,
            imageUrls: {
              thumb: thumbUrl,
              preview: previewUrl,
              original: originalUrl,
            },
            targetFormat,
          },
        })
        .select()
        .single();

      if (error || !data) {
        await deleteR2Objects([thumbStoragePath, previewStoragePath]);
        throw new Error(error?.message || "Unable to save synced library asset.");
      }

      existingStoragePaths.add(original.key);
      existingStoragePaths.add(thumbStoragePath);
      existingStoragePaths.add(previewStoragePath);
      summary.createdAssets += 1;
    } catch (error) {
      summary.failedAssets += 1;
      summary.errors.push({
        key: group.mode === "managed" ? group.original.key : group.sourceKey,
        message: error instanceof Error ? error.message : "Unable to sync asset.",
      });
    }
  }

  const library = await listLibrary(params.ownerId);
  return {
    summary,
    library,
  };
}
