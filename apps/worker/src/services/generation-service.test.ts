import assert from "node:assert/strict";
import test from "node:test";
import { getExactCenterCropDimensions } from "./generation-service";

test("generated image crops are centered and preserve exact requested ratio", () => {
  const wide = getExactCenterCropDimensions({ width: 1536, height: 1024, ratio: "21:9" });
  assert.equal(wide.width / 21, wide.height / 9);
  assert.equal(wide.left, Math.floor((1536 - wide.width) / 2));
  assert.equal(wide.top, Math.floor((1024 - wide.height) / 2));

  const standardWide = getExactCenterCropDimensions({ width: 1536, height: 1024, ratio: "16:9" });
  assert.equal(standardWide.width / 16, standardWide.height / 9);

  const portrait = getExactCenterCropDimensions({ width: 1024, height: 1536, ratio: "9:16" });
  assert.equal(portrait.width / 9, portrait.height / 16);
  assert.equal(portrait.left, Math.floor((1024 - portrait.width) / 2));
});
