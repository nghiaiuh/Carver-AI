"use client";

import type { LibraryAsset } from "../types/library";
import LibraryAssetCard from "./LibraryAssetCard";
import LibraryEmptyState from "./LibraryEmptyState";

type LibraryAssetGridProps = {
  assets: LibraryAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onAddToCanvas: (asset: LibraryAsset) => void;
  onDeleteAsset: (asset: LibraryAsset) => void;
  onPreviewAsset: (asset: LibraryAsset) => void;
};

export default function LibraryAssetGrid({
  assets,
  selectedAssetId,
  onSelectAsset,
  onAddToCanvas,
  onDeleteAsset,
  onPreviewAsset,
}: LibraryAssetGridProps) {
  if (assets.length === 0) return <LibraryEmptyState />;

  return (
    <div className="grid grid-cols-2 gap-3">
      {assets.map((asset) => (
        <LibraryAssetCard
          key={asset.id}
          asset={asset}
          selected={selectedAssetId === asset.id}
          onSelect={() => onSelectAsset(asset.id)}
          onAddToCanvas={() => onAddToCanvas(asset)}
          onDelete={() => onDeleteAsset(asset)}
          onPreview={() => onPreviewAsset(asset)}
        />
      ))}
    </div>
  );
}
