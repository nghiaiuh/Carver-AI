import {
  apiFailure,
  apiSuccess,
  badRequestResponse,
  readJsonObject,
  serverErrorResponse,
} from "../../../../_lib/http";
import { createSafeLogger } from "@carver/shared";
import { requireProjectOwner, requireRequestContext } from "../../../../_lib/authz";
import {
  deletePersistedProjectImageAssets,
  persistTemporaryProjectImageAsset,
} from "../../../../../../lib/server/projectInputAssets";
import { resolveOwnedAssetUrls } from "../../../../../../lib/server/assetService";
import { enforceRateLimit } from "../../../../_lib/rateLimit";

const MAX_SNAPSHOT_IMAGE_COUNT = 2;
const MAX_SNAPSHOT_IMAGE_REQUEST_BYTES = 24 * 1024 * 1024;
const MAX_SNAPSHOT_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const logger = createSafeLogger("web.snapshot-assets");

type SnapshotAssetRequestItem = {
  nodeId: string;
  title: string;
  dataUrl: string;
};

function readSnapshotAssetItems(body: Record<string, unknown>) {
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

  const body = await readJsonObject(request);
  if (Array.isArray(body.images) && body.images.length > MAX_SNAPSHOT_IMAGE_COUNT) {
    return apiFailure("UPLOAD_TOO_MANY_FILES", "Too many images in one upload.", 400, context.requestId);
  }
  const images = readSnapshotAssetItems(body);
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
    for (const [index, image] of images.entries()) {
      const persisted = await persistTemporaryProjectImageAsset({
        supabase: context.supabase,
        projectId: projectResult.project.id,
        ownerId: context.user.id,
        requestId: `${requestId}-${index}`,
        label: image.title,
        dataUrl: image.dataUrl,
        kind: "upload",
        metadata: {
          temporary: false,
          snapshotSource: "canvas-node",
          nodeId: image.nodeId,
        },
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
      images: persistedImages.map(({ storagePath: _storagePath, ...image }) => {
        const urls = resolvedUrls.get(image.assetId);
        if (!urls) {
          throw new Error("Unable to resolve persisted image asset.");
        }
        return {
          ...image,
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
    await deletePersistedProjectImageAssets({
      supabase: context.supabase,
      projectId: projectResult.project.id,
      ownerId: context.user.id,
      assets: persistedImages,
    }).catch(() => undefined);
    return serverErrorResponse(requestId);
  }
}
