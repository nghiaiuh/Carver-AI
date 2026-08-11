import assert from "node:assert/strict";
import test from "node:test";
import { resolveConnectedImageAssetId } from "./imageGeneratorGraphContext";

test("recovers the current asset ID from a refreshed gateway URL", () => {
  const currentAssetId = "11111111-1111-4111-8111-111111111111";
  const staleAssetId = "22222222-2222-4222-8222-222222222222";

  assert.equal(
    resolveConnectedImageAssetId({
      imageUrl: `/api/assets/${currentAssetId}/content?variant=original&exp=123&token=signed`,
      assetId: staleAssetId,
    }),
    currentAssetId,
  );
});

test("falls back to persisted source metadata for non-gateway URLs", () => {
  const assetId = "33333333-3333-4333-8333-333333333333";

  assert.equal(
    resolveConnectedImageAssetId({
      imageUrl: "https://images.example.test/garden.webp",
      assetId,
    }),
    assetId,
  );
});
