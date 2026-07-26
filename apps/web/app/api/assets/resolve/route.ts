import { createSafeLogger } from "@carver/shared";
import { resolveOwnedAssetUrls } from "../../../../lib/server/assetService";
import { isUuidLike, requireRequestContext } from "../../_lib/authz";
import { apiFailure, apiSuccess, readJsonObject } from "../../_lib/http";
import { enforceRateLimit } from "../../_lib/rateLimit";

const logger = createSafeLogger("web.assets.resolve");
const MAX_ASSET_RESOLVE_COUNT = 200;
const MAX_ASSET_RESOLVE_REQUEST_BYTES = 64 * 1024;

function assetIdsValue(value: unknown) {
  if (!Array.isArray(value)) {
    return { assetIds: [], hasInvalidId: false };
  }

  const rawIds = value.filter((item): item is string => typeof item === "string");
  return {
    assetIds: [...new Set(rawIds)].slice(0, MAX_ASSET_RESOLVE_COUNT),
    hasInvalidId: rawIds.some((assetId) => !isUuidLike(assetId)),
    hasTooManyIds: rawIds.length > MAX_ASSET_RESOLVE_COUNT,
  };
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_RESOLVE_REQUEST_BYTES) {
    return apiFailure("PAYLOAD_TOO_LARGE", "Asset resolution request is too large", 413, context.requestId);
  }

  const body = await readJsonObject(request);
  const { assetIds, hasInvalidId, hasTooManyIds } = assetIdsValue(body.assetIds);
  if (assetIds.length === 0) {
    return apiFailure("BAD_REQUEST", "assetIds are required", 400, context.requestId);
  }
  if (hasInvalidId) {
    return apiFailure("BAD_REQUEST", "assetIds must contain valid IDs", 400, context.requestId);
  }
  if (hasTooManyIds) {
    return apiFailure("BAD_REQUEST", "Too many asset IDs", 400, context.requestId);
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "asset-resolve",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  try {
    const ownedUrls = await resolveOwnedAssetUrls({
      requestUrl: request.url,
      supabase: context.supabase,
      userId: context.user.id,
      assetIds,
    });
    const resolved = Object.fromEntries(
      [...ownedUrls.entries()].map(([assetId, urls]) => [
        assetId,
        {
          assetId,
          ...urls,
        },
      ]),
    );

    return apiSuccess({ assets: resolved });
  } catch (error) {
    logger.error("asset URL resolution failed", {
      requestId: context.requestId,
      userId: context.user.id,
      requestedAssetCount: assetIds.length,
      error,
    });
    return apiFailure("ASSET_RESOLVE_FAILED", "Unable to resolve assets", 500, context.requestId);
  }
}
