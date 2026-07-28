import {
  apiFailure,
  apiSuccess,
  badRequestResponse,
  readJsonObject,
} from "../../../../_lib/http";
import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { requireProjectOwner, requireRequestContext } from "../../../../_lib/authz";
import {
  deletePersistedProjectImageAssets,
  persistTemporaryProjectImageAsset,
  persistTemporaryProjectImageAssetFile,
} from "../../../../../../lib/server/projectInputAssets";
import { resolveOwnedAssetUrls } from "../../../../../../lib/server/assetService";
import { enforceRateLimit } from "../../../../_lib/rateLimit";

const MAX_SNAPSHOT_IMAGE_COUNT = 2;
const MAX_SNAPSHOT_IMAGE_REQUEST_BYTES = 24 * 1024 * 1024;
const MAX_SNAPSHOT_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const logger = createSafeLogger("web.snapshot-assets");

type SnapshotUploadFile = {
  size: number;
  type: string;
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type SnapshotAssetRequestItem = {
  nodeId: string;
  title: string;
} & (
  | {
    dataUrl: string;
    file?: never;
  }
  | {
    file: SnapshotUploadFile;
    dataUrl?: never;
  }
);

function isSnapshotUploadFile(value: unknown): value is SnapshotUploadFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    arrayBuffer?: unknown;
    size?: unknown;
    type?: unknown;
    name?: unknown;
  };
  return (
    typeof candidate.arrayBuffer === "function" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.name === "string"
  );
}

function readSnapshotAssetItems(body: Record<string, unknown>): SnapshotAssetRequestItem[] {
  const value = body.images;
  if (!Array.isArray(value)) {
    return [] as SnapshotAssetRequestItem[];
  }

  return value.slice(0, MAX_SNAPSHOT_IMAGE_COUNT).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const nodeId = typeof candidate.nodeId === "string" ? candidate.nodeId.trim() : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const dataUrl = typeof candidate.dataUrl === "string" ? candidate.dataUrl.trim() : "";

    if (
      !nodeId ||
      nodeId.length > 240 ||
      !title ||
      title.length > 240 ||
      !dataUrl.startsWith("data:") ||
      dataUrl.length > MAX_SNAPSHOT_IMAGE_DATA_URL_LENGTH
    ) {
      return [];
    }

    return [{
      nodeId,
      title,
      dataUrl,
    } satisfies SnapshotAssetRequestItem];
  });
}

async function readSnapshotAssetFormItems(request: Request): Promise<SnapshotAssetRequestItem[]> {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return [] as SnapshotAssetRequestItem[];
  }

  const file = formData.get("file");
  const nodeId = typeof formData.get("nodeId") === "string"
    ? String(formData.get("nodeId")).trim()
    : "";
  const title = typeof formData.get("title") === "string"
    ? String(formData.get("title")).trim()
    : "";

  if (
    !isSnapshotUploadFile(file) ||
    file.size <= 0 ||
    file.size > 8 * 1024 * 1024 ||
    !nodeId ||
    nodeId.length > 240 ||
    !title ||
    title.length > 240
  ) {
    return [];
  }

  return [{
    nodeId,
    title,
    file,
  } satisfies SnapshotAssetRequestItem];
}

function isFileSnapshotAssetItem(
  image: SnapshotAssetRequestItem,
): image is SnapshotAssetRequestItem & { file: SnapshotUploadFile } {
  return "file" in image && isSnapshotUploadFile((image as { file?: unknown }).file);
}

function classifySnapshotAssetError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "SNAPSHOT_ASSET_UPLOAD_FAILED", status: 500 };
  }

  const maybeError = error as {
    code?: string;
    name?: string;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const message = maybeError.message ?? "";
  if (
    message.includes("too large") ||
    message.includes("dimensions are invalid") ||
    message.includes("content does not match") ||
    message.includes("base64 PNG, JPEG, or WebP") ||
    message.includes("type is not supported")
  ) {
    return {
      code: message.includes("too large") ? "UPLOAD_TOO_LARGE" : "UNSUPPORTED_FILE_TYPE",
      status: message.includes("too large") ? 413 : 400,
    };
  }

  if (
    maybeError.code === "P0001" ||
    message.includes("ASSET_OWNERSHIP_INVALID") ||
    message.includes("ASSET_STORAGE_PATH_INVALID") ||
    message.includes("ASSET_IMMUTABLE_FIELD")
  ) {
    return { code: "ASSET_METADATA_POLICY_FAILED", status: 500 };
  }

  if (
    maybeError.code === "42P01" ||
    maybeError.code === "42703" ||
    message.includes("schema cache") ||
    message.includes("column") ||
    message.includes("relation")
  ) {
    return { code: "ASSET_SCHEMA_ERROR", status: 500 };
  }

  if (message.includes("Missing required environment variable:")) {
    return { code: "ASSET_STORAGE_CONFIG_MISSING", status: 500 };
  }

  if (message.includes("Missing ASSET_GATEWAY_SIGNING_SECRET")) {
    return { code: "ASSET_GATEWAY_CONFIG_MISSING", status: 500 };
  }

  if (
    maybeError.$metadata?.httpStatusCode === 403 ||
    maybeError.name === "AccessDenied" ||
    maybeError.Code === "AccessDenied" ||
    message.includes("AccessDenied")
  ) {
    return { code: "ASSET_STORAGE_ACCESS_FAILED", status: 500 };
  }

  return { code: "SNAPSHOT_ASSET_UPLOAD_FAILED", status: 500 };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const requestId = context.requestId;
  const { projectId } = await params;
  if (!projectId) {
    return badRequestResponse("projectId is required", requestId);
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "snapshot-asset-upload",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SNAPSHOT_IMAGE_REQUEST_BYTES) {
    return apiFailure("UPLOAD_TOO_LARGE", "Upload is too large.", 413, context.requestId);
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
  const body = isMultipart ? null : await readJsonObject(request);
  if (!isMultipart && Array.isArray(body?.images) && body.images.length > MAX_SNAPSHOT_IMAGE_COUNT) {
    return apiFailure("UPLOAD_TOO_MANY_FILES", "Too many images in one upload.", 400, context.requestId);
  }
  const images = isMultipart
    ? await readSnapshotAssetFormItems(request)
    : readSnapshotAssetItems(body ?? {});
  if (images.length === 0) {
    return badRequestResponse("images are required", requestId);
  }

  const persistedImages: Array<{
    nodeId: string;
    assetId: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }> = [];

  try {
    const adminSupabase = getSupabaseAdmin();
    for (const [index, image] of images.entries()) {
      const commonParams = {
        supabase: adminSupabase,
        projectId: projectResult.project.id,
        ownerId: context.user.id,
        requestId: `${requestId}-${index}`,
        label: image.title,
        kind: "upload" as const,
        metadata: {
          temporary: false,
          snapshotSource: "canvas-node",
          nodeId: image.nodeId,
        },
      };
      const persisted = isFileSnapshotAssetItem(image)
        ? await persistTemporaryProjectImageAssetFile({
          ...commonParams,
          file: image.file,
        })
        : await persistTemporaryProjectImageAsset({
          ...commonParams,
          dataUrl: image.dataUrl,
        });
      persistedImages.push({
        nodeId: image.nodeId,
        assetId: persisted.assetId,
        storagePath: persisted.storagePath,
        mimeType: persisted.mimeType,
        sizeBytes: persisted.sizeBytes,
      });
    }
    const resolvedUrls = await resolveOwnedAssetUrls({
      requestUrl: request.url,
      supabase: context.supabase,
      userId: context.user.id,
      projectId: projectResult.project.id,
      assetIds: persistedImages.map((image) => image.assetId),
    });

    return apiSuccess({
      images: persistedImages.map((image) => {
        const urls = resolvedUrls.get(image.assetId);
        if (!urls) {
          throw new Error("Unable to resolve persisted image asset.");
        }
        return {
          nodeId: image.nodeId,
          assetId: image.assetId,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          imageUrl: urls.originalUrl,
          expiresAt: urls.expiresAt,
        };
      }),
    });
  } catch (error) {
    logger.error("snapshot image persistence failed", {
      requestId,
      userId: context.user.id,
      projectId: projectResult.project.id,
      imageCount: images.length,
      error,
    });
    if (persistedImages.length > 0) {
      try {
        await deletePersistedProjectImageAssets({
          supabase: getSupabaseAdmin(),
          projectId: projectResult.project.id,
          ownerId: context.user.id,
          assets: persistedImages,
        });
      } catch {
        // Best-effort cleanup. The orphan cleanup pass can safely remove leftovers later.
      }
    }
    const classified = classifySnapshotAssetError(error);
    return apiFailure(
      classified.code,
      classified.status === 413
        ? "Upload is too large."
        : classified.status === 400
          ? "Image file is invalid."
          : "Unable to upload image.",
      classified.status,
      requestId,
    );
  }
}
