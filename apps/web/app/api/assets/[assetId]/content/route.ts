import { NextResponse } from "next/server";
import { createSafeLogger } from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { getR2ObjectBuffer } from "@carver/storage";
import {
  normalizeAssetDeliveryVariant,
  verifyAssetDeliveryToken,
  type AssetDeliveryVariant,
} from "../../../../../lib/server/assetDelivery";
import { apiFailure, createRequestId } from "../../../_lib/http";
import { isUuidLike } from "../../../_lib/authz";

const logger = createSafeLogger("web.assets.content");

type ResolvedAssetObject = {
  storagePath: string;
  mimeType: string | null;
};

function corsHeaders(request: Request, contentType: string) {
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=300",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

async function resolveAssetObject(
  assetId: string,
  variant: AssetDeliveryVariant,
): Promise<ResolvedAssetObject | null> {
  const supabase = getSupabaseAdmin();

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id, storage_path, mime_type")
    .eq("id", assetId)
    .maybeSingle();

  if (assetError) {
    throw assetError;
  }

  if (asset) {
    return {
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
    };
  }

  const { data: libraryAsset, error: libraryAssetError } = await supabase
    .from("library_assets")
    .select("id, thumb_storage_path, preview_storage_path, original_storage_path, mime_type")
    .eq("id", assetId)
    .maybeSingle();

  if (libraryAssetError) {
    throw libraryAssetError;
  }

  if (!libraryAsset) {
    return null;
  }

  const storagePathByVariant = {
    thumb: libraryAsset.thumb_storage_path,
    preview: libraryAsset.preview_storage_path,
    original: libraryAsset.original_storage_path,
  };

  return {
    storagePath: storagePathByVariant[variant],
    mimeType: libraryAsset.mime_type,
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, "text/plain"),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const requestId = createRequestId(request);
  const { assetId } = await params;
  if (!assetId || !isUuidLike(assetId)) {
    return apiFailure("ASSET_NOT_FOUND", "Asset not found", 404, requestId);
  }

  const url = new URL(request.url);
  const variant = normalizeAssetDeliveryVariant(url.searchParams.get("variant"));
  const expiresAt = Number(url.searchParams.get("exp"));
  const token = url.searchParams.get("token") ?? "";

  if (!verifyAssetDeliveryToken({ assetId, variant, expiresAt, token })) {
    return apiFailure("ASSET_NOT_FOUND", "Asset not found", 404, requestId);
  }

  try {
    const asset = await resolveAssetObject(assetId, variant);
    if (!asset) {
      return apiFailure("ASSET_NOT_FOUND", "Asset not found", 404, requestId);
    }

    const body = await getR2ObjectBuffer(asset.storagePath);
    return new Response(Uint8Array.from(body), {
      status: 200,
      headers: corsHeaders(request, asset.mimeType ?? "application/octet-stream"),
    });
  } catch {
    logger.error("asset delivery failed", {
      requestId,
      assetId,
      variant,
    });
    return NextResponse.json(
      {
        success: false,
        code: "ASSET_DELIVERY_FAILED",
        error: "Unable to load asset",
        requestId,
      },
      { status: 500 },
    );
  }
}
