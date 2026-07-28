import type { Database } from "@carver/db";
import type { LibraryAssetRecord, LibraryFolderRecord } from "@carver/storage/library-metadata";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveOwnedAssetUrls,
  type AssetDeliveryUrls,
} from "../../../../lib/server/assetService";

function applyGatewayUrls(asset: LibraryAssetRecord, urls: AssetDeliveryUrls | undefined): LibraryAssetRecord {
  if (!urls) {
    return {
      ...asset,
      src: "",
      originalSrc: "",
      thumbnailSrc: "",
      previewSrc: "",
    };
  }

  return {
    ...asset,
    src: urls.originalUrl,
    originalSrc: urls.originalUrl,
    thumbnailSrc: urls.thumbUrl,
    previewSrc: urls.previewUrl,
    metadata: {
      ...asset.metadata,
      imageUrls: {
        thumb: urls.thumbUrl,
        preview: urls.previewUrl,
        original: urls.originalUrl,
        expiresAt: urls.expiresAt,
      },
    },
  };
}

export async function withGatewayLibraryAssetUrls(params: {
  requestUrl: string;
  asset: LibraryAssetRecord;
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<LibraryAssetRecord> {
  const urls = await resolveOwnedAssetUrls({
    requestUrl: params.requestUrl,
    supabase: params.supabase,
    userId: params.userId,
    assetIds: [params.asset.id],
  });
  return applyGatewayUrls(params.asset, urls.get(params.asset.id));
}

export async function withGatewayLibraryFolderUrls(params: {
  requestUrl: string;
  folder: LibraryFolderRecord;
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<LibraryFolderRecord> {
  const urls = await resolveOwnedAssetUrls({
    requestUrl: params.requestUrl,
    supabase: params.supabase,
    userId: params.userId,
    assetIds: params.folder.assets.map((asset) => asset.id),
  });

  return {
    ...params.folder,
    assets: params.folder.assets.map((asset) => applyGatewayUrls(asset, urls.get(asset.id))),
  };
}
