import { NextResponse } from "next/server";
import {
  buildAssetContentUrl,
  type AssetDeliveryVariant,
} from "../../../../lib/server/assetDelivery";
import { requireRequestContext } from "../../_lib/authz";
import { apiFailure, apiSuccess, readJsonObject } from "../../_lib/http";

const VARIANTS: AssetDeliveryVariant[] = ["thumb", "preview", "original"];

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
    const [{ data: assets, error: assetsError }, { data: libraryAssets, error: libraryAssetsError }] =
      await Promise.all([
        context.supabase
          .from("assets")
          .select("id")
          .eq("owner_id", context.user.id)
          .in("id", assetIds),
        context.supabase
          .from("library_assets")
          .select("id")
          .eq("owner_id", context.user.id)
          .in("id", assetIds),
      ]);

    if (assetsError || libraryAssetsError) {
      return apiFailure("ASSET_RESOLVE_FAILED", "Unable to resolve assets", 500, context.requestId);
    }

    const ownedIds = new Set([
      ...(assets ?? []).map((asset) => asset.id),
      ...(libraryAssets ?? []).map((asset) => asset.id),
    ]);

    const resolved = Object.fromEntries(
      [...ownedIds].map((assetId) => {
        const urls = Object.fromEntries(
          VARIANTS.map((variant) => {
            const signed = buildAssetContentUrl(request.url, { assetId, variant });
            return [`${variant}Url`, signed.url];
          }),
        );
        const expiresAt = buildAssetContentUrl(request.url, { assetId, variant: "original" }).expiresAt;

        return [
          assetId,
          {
            assetId,
            expiresAt,
            thumbUrl: urls.thumbUrl,
            previewUrl: urls.previewUrl,
            originalUrl: urls.originalUrl,
          },
        ];
      }),
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
