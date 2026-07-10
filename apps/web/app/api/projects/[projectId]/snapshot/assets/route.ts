import { apiSuccess, badRequestResponse, createRequestId, readJsonObject, serverErrorResponse } from "../../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../../_lib/authz";
import { persistTemporaryProjectImageAsset } from "../../../../../../lib/server/projectInputAssets";
import { buildAssetContentUrl } from "../../../../../../lib/server/assetService";

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

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const nodeId = typeof candidate.nodeId === "string" ? candidate.nodeId.trim() : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const dataUrl = typeof candidate.dataUrl === "string" ? candidate.dataUrl.trim() : "";

    if (!nodeId || !title || !dataUrl.startsWith("data:")) {
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

  const requestId = createRequestId(request);
  const { projectId } = await params;
  if (!projectId) {
    return badRequestResponse("projectId is required", requestId);
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const body = await readJsonObject(request);
  const images = readSnapshotAssetItems(body);
  if (images.length === 0) {
    return badRequestResponse("images are required", requestId);
  }

  try {
    const persistedImages = await Promise.all(
      images.map(async (image, index) => {
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
        const signed = buildAssetContentUrl(request.url, {
          assetId: persisted.assetId,
          variant: "original",
        });

        return {
          nodeId: image.nodeId,
          assetId: persisted.assetId,
          imageUrl: signed.url,
          expiresAt: signed.expiresAt,
          mimeType: persisted.mimeType,
          sizeBytes: persisted.sizeBytes,
        };
      }),
    );

    return apiSuccess({
      images: persistedImages,
    });
  } catch {
    return serverErrorResponse(requestId);
  }
}
