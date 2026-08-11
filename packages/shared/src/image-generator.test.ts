import assert from "node:assert/strict";
import test from "node:test";
import {
  getImageGeneratorCardSize,
  getImageGeneratorProviderSize,
  getImageGeneratorRatioLockedSize,
  resolveImageGeneratorAspectRatio,
} from "./image-generator";

test("image generator ratios resolve Auto from input dimensions with a square fallback", () => {
  assert.equal(resolveImageGeneratorAspectRatio({ requested: "auto", inputWidth: 1600, inputHeight: 900 }), "16:9");
  assert.equal(resolveImageGeneratorAspectRatio({ requested: "auto", inputWidth: 0, inputHeight: 0 }), "1:1");
  assert.equal(getImageGeneratorProviderSize("21:9"), "1536x1024");
  assert.equal(getImageGeneratorProviderSize("9:16"), "1024x1536");
});

test("ratio-locked card geometry keeps the short side bounded and the requested ratio exact", () => {
  const wide = getImageGeneratorCardSize({ ratio: "16:9", shortSide: 520 });
  assert.equal(wide.width / wide.height, 16 / 9);
  assert.ok(wide.width <= 850);
  assert.ok(wide.height >= 360);

  const resized = getImageGeneratorRatioLockedSize({
    ratio: "9:16",
    startWidth: 360,
    startHeight: 640,
    deltaX: 80,
    deltaY: 0,
  });
  assert.equal(resized.width / resized.height, 9 / 16);
  assert.ok(resized.width >= 360);
  assert.ok(resized.height <= 850);
});
