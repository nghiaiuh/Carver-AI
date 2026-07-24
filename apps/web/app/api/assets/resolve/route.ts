import { NextResponse } from "next/server";
import { resolveOwnedAssetUrls } from "../../../../lib/server/assetService";
import { requireRequestContext } from "../../_lib/authz";
import { apiFailure, apiSuccess, readJsonObject } from "../../_lib/http";

function assetIdsValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string"))].slice(0, 200);
}

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const assetIds = assetIdsValue(body.assetIds);
  if (assetIds.length === 0) {
    return apiFailure("BAD_REQUEST", "assetIds are required", 400, context.requestId);
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
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_RESOLVE_FAILED",
        error: "Unable to resolve assets",
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
}
