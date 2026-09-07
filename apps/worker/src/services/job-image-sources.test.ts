import assert from "node:assert/strict";
import test from "node:test";
import type { ModelConditioning } from "@carver/shared";
import { buildProviderImageManifest } from "./job-image-sources";

const source = { buffer: Buffer.from("source-bytes"), mimeType: "image/png", assetId: "asset-source" };
const styleReference = {
  buffer: Buffer.from("style-bytes"),
  mimeType: "image/png",
  assetId: "asset-style",
  contextId: "style-node",
  sourceNodeId: "style-node",
  role: "style_reference",
};
const materialReference = {
  buffer: Buffer.from("material-bytes"),
  mimeType: "image/png",
  assetId: "asset-material",
  contextId: "materials:stone",
  sourceNodeId: "materials",
  role: "material_reference",
};
const protectedMask = { buffer: Buffer.from("mask-bytes"), mimeType: "image/png", assetId: "asset-mask" };

const conditioning = {
  authoritativeSource: { image: { assetId: "asset-source" } },
  sceneEvidence: { protectedRegionMask: { assetId: "asset-mask" } },
  referenceImages: [
    { contextId: "materials:stone", image: { assetId: "asset-material" }, required: true },
    { contextId: "style-node", image: { assetId: "asset-style" }, required: true },
  ],
} as unknown as ModelConditioning;

test("provider image manifest preserves conditioning order, semantic roles, and exact resolved bytes", () => {
  const manifest = buildProviderImageManifest({
    conditioning,
    targetImage: source,
    // Deliberately reverse resolution order: conditioning, not fetch timing,
    // is the provider manifest source of truth.
    referenceImages: [styleReference, materialReference],
    maskImage: protectedMask,
  });

  assert.deepEqual(manifest.map((image) => image.role), [
    "authoritative_source",
    "reference",
    "reference",
    "protected_region",
  ]);
  assert.deepEqual(manifest.map((image) => image.assetId), [
    "asset-source",
    "asset-material",
    "asset-style",
    "asset-mask",
  ]);
  assert.deepEqual(manifest.map((image) => image.buffer), [
    source.buffer,
    materialReference.buffer,
    styleReference.buffer,
    protectedMask.buffer,
  ]);
});

test("provider image manifest fails rather than dropping a required conditioned reference", () => {
  assert.throws(
    () => buildProviderImageManifest({
      conditioning,
      targetImage: source,
      referenceImages: [styleReference],
      maskImage: protectedMask,
    }),
    /materials:stone/,
  );
});

test("provider image manifest fails closed when conditioned source or mask asset IDs do not match", () => {
  assert.throws(
    () => buildProviderImageManifest({
      conditioning,
      targetImage: { buffer: source.buffer, mimeType: source.mimeType },
      referenceImages: [styleReference, materialReference],
      maskImage: protectedMask,
    }),
    /authoritative source/,
  );
  assert.throws(
    () => buildProviderImageManifest({
      conditioning,
      targetImage: source,
      referenceImages: [styleReference, materialReference],
      maskImage: { ...protectedMask, assetId: "asset-other-mask" },
    }),
    /protected-region mask/,
  );
});
