import { NextResponse } from "next/server";
import { createSafeLogger } from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { getR2ObjectBuffer } from "@carver/storage";
import {
  normalizeAssetDeliveryVariant,
  verifyAssetDeliveryToken,
  type AssetDeliveryVariant,
} from "../../../../../lib/server/assetService";
import { apiFailure, createRequestId } from "../../../_lib/http";
import { isUuidLike } from "../../../_lib/authz";

const logger = createSafeLogger("web.assets.content");

type ResolvedAssetObject = {
  source: "project-asset" | "library-asset";
  storagePaths: string[];
  mimeType: string | null;
};

const dedupeStoragePaths = (paths: Array<string | null | undefined>) =>
  [...new Set(paths.map((path) => path?.trim()).filter((path): path is string => Boolean(path)))];

function isMissingR2ObjectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    name?: string;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };

  if (maybeError.$metadata?.httpStatusCode === 404) {
    return true;
  }

  return (
    maybeError.name === "NoSuchKey" ||
    maybeError.Code === "NoSuchKey" ||
    maybeError.message?.includes("NoSuchKey") === true
  );
}

function classifyR2AccessError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "ASSET_DELIVERY_FAILED";
  }

  const maybeError = error as {
    name?: string;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };

  if (maybeError.message?.includes("Missing ASSET_GATEWAY_SIGNING_SECRET")) {
    return "ASSET_GATEWAY_CONFIG_MISSING";
  }

  if (maybeError.message?.includes("Missing required environment variable:")) {
    return "ASSET_STORAGE_CONFIG_MISSING";
  }

  if (
    maybeError.$metadata?.httpStatusCode === 403 ||
    maybeError.name === "AccessDenied" ||
    maybeError.Code === "AccessDenied" ||
    maybeError.message?.includes("AccessDenied")
  ) {
    return "ASSET_STORAGE_ACCESS_FAILED";
  }

  return "ASSET_DELIVERY_FAILED";
}

function corsHeaders(request: Request, contentType: string) {
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=60",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set(
    (process.env.CARVER_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }

  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
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
      source: "project-asset",
      storagePaths: dedupeStoragePaths([asset.storage_path]),
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
    thumb: dedupeStoragePaths([
      libraryAsset.thumb_storage_path,
      libraryAsset.preview_storage_path,
      libraryAsset.original_storage_path,
    ]),
    preview: dedupeStoragePaths([
      libraryAsset.preview_storage_path,
      libraryAsset.original_storage_path,
      libraryAsset.thumb_storage_path,
    ]),
    original: dedupeStoragePaths([
      libraryAsset.original_storage_path,
      libraryAsset.preview_storage_path,
      libraryAsset.thumb_storage_path,
    ]),
  };

  return {
    source: "library-asset",
    storagePaths: storagePathByVariant[variant],
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

  let isDeliveryTokenValid = false;
  try {
    isDeliveryTokenValid = verifyAssetDeliveryToken({ assetId, variant, expiresAt, token });
  } catch (error) {
    const errorCode = classifyR2AccessError(error);
    logger.error("asset delivery token verification failed", {
      requestId,
      assetId,
      variant,
      error,
    });
    return apiFailure(
      errorCode,
      "Unable to load asset",
      500,
      requestId,
      { headers: corsHeaders(request, "application/json") },
    );
  }

  if (!isDeliveryTokenValid) {
    logger.warn("asset delivery token invalid", {
      requestId,
      assetId,
      variant,
    });
    return apiFailure("ASSET_NOT_FOUND", "Asset not found", 404, requestId);
  }

  try {
    const asset = await resolveAssetObject(assetId, variant);
    if (!asset) {
      logger.warn("asset metadata missing", {
        requestId,
        assetId,
        variant,
      });
      return apiFailure("ASSET_METADATA_NOT_FOUND", "Asset not found", 404, requestId);
    }

    let body: Buffer | null = null;
    for (const storagePath of asset.storagePaths) {
      try {
        body = await getR2ObjectBuffer(storagePath);
        break;
      } catch (error) {
        if (!isMissingR2ObjectError(error)) {
          throw error;
        }

        logger.warn("asset variant fallback", {
          requestId,
          assetId,
          source: asset.source,
          variant,
          attemptedPathCount: asset.storagePaths.length,
        });
      }
    }

    if (!body) {
      logger.warn("asset object missing", {
        requestId,
        assetId,
        source: asset.source,
        variant,
        attemptedPathCount: asset.storagePaths.length,
      });
      return apiFailure("ASSET_OBJECT_NOT_FOUND", "Asset not found", 404, requestId);
    }

    return new Response(Uint8Array.from(body), {
      status: 200,
      headers: corsHeaders(request, asset.mimeType ?? "application/octet-stream"),
    });
  } catch (error) {
    const errorCode = classifyR2AccessError(error);
    logger.error("asset delivery failed", {
      requestId,
      assetId,
      variant,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        code: errorCode,
        error: "Unable to load asset",
        requestId,
      },
      { status: 500 },
    );
  }
}
