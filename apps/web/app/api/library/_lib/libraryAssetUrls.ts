import type { LibraryAssetRecord, LibraryFolderRecord } from "@carver/storage";
import { buildAssetContentUrl } from "../../../../lib/server/assetDelivery";

export function withGatewayLibraryAssetUrls(
  requestUrl: string,
  asset: LibraryAssetRecord,
): LibraryAssetRecord {
  const thumb = buildAssetContentUrl(requestUrl, { assetId: asset.id, variant: "thumb" });
  const preview = buildAssetContentUrl(requestUrl, { assetId: asset.id, variant: "preview" });
  const original = buildAssetContentUrl(requestUrl, { assetId: asset.id, variant: "original" });

  return {
    ...asset,
    src: original.url,
    originalSrc: original.url,
    thumbnailSrc: thumb.url,
    previewSrc: preview.url,
    metadata: {
      ...asset.metadata,
      imageUrls: {
        thumb: thumb.url,
        preview: preview.url,
        original: original.url,
        expiresAt: original.expiresAt,
      },
    },
  };
}

export function withGatewayLibraryFolderUrls(
  requestUrl: string,
  folder: LibraryFolderRecord,
): LibraryFolderRecord {
  return {
    ...folder,
    assets: folder.assets.map((asset) => withGatewayLibraryAssetUrls(requestUrl, asset)),
  };
}
