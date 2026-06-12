import assert from "node:assert/strict";
import test from "node:test";

import { enhancePrompt } from "./enhancePrompt";

test("adds bamboo along the fence without AI fallback", async () => {
  const result = await enhancePrompt({
    prompt: "them truc quan tu doc hang rao",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "add_object");
  assert.equal(result.usedAiFallback, false);
  assert.ok(result.detectedObjects.includes("slender bamboo"));
  assert.ok(result.detectedTargetAreas.includes("along the fence"));
  assert.match(result.enhancedPrompt, /slender bamboo/i);
  assert.match(result.ruleScaffold, /ORIGINAL USER REQUEST/i);
});

test("replaces the central house with a traditional Vietnamese wooden house", async () => {
  const result = await enhancePrompt({
    prompt: "thay nha chinh o giua thanh nha truyen thong viet nam bang nha go",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "architecture_replace");
  assert.ok(result.detectedObjects.includes("main house"));
  assert.ok(result.enhancedPrompt.includes("Preserve exactly:"));
  assert.ok(result.ruleScaffold.includes("RULE-BASED GUIDANCE"));
});

test("changes courtyard material to gray square grid paving tiles", async () => {
  const result = await enhancePrompt({
    prompt: "doi san thanh gach xam ke caro",
    mode: "material_change",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "change_material");
  assert.ok(result.detectedObjects.includes("courtyard"));
  assert.ok(result.detectedObjects.includes("gray square grid paving tiles"));
});

test("enhances realism with preserve and avoid rules", async () => {
  const result = await enhancePrompt({
    prompt: "enhance realism only",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "enhance_realism");
  assert.match(result.ruleScaffold, /enhance_realism/i);
  assert.ok(result.preserveRules.includes("original layout"));
  assert.ok(result.negativeRules.includes("moving existing objects"));
});

test("removes plant cluster from right edge", async () => {
  const result = await enhancePrompt({
    prompt: "remove plant cluster from right edge",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "remove_object");
  assert.ok(result.detectedTargetAreas.includes("right edge"));
});

test("improves koi pond edge with natural limestone", async () => {
  const result = await enhancePrompt({
    prompt: "improve koi pond edge with natural limestone",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "koi_pond");
  assert.ok(result.detectedObjects.includes("koi pond"));
  assert.ok(result.ruleScaffold.includes("natural stones"));
});

test("redesigns rockery waterfall without moving it", async () => {
  const result = await enhancePrompt({
    prompt: "redesign hon non bo but keep it in the same position",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "rockery_waterfall");
  assert.ok(result.ruleScaffold.includes("exact same location and footprint"));
});

test("scores vague short prompt low and marks it for AI fallback", async () => {
  const result = await enhancePrompt({
    prompt: "lam dep hon",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "enhance_realism");
  assert.ok(result.score < 45);
});

test("keeps very short tree prompt on the rule path when AI fallback is disabled", async () => {
  const result = await enhancePrompt({
    prompt: "them cay",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "add_object");
  assert.equal(result.usedAiFallback, false);
});

test("supports english prompt around the koi pond", async () => {
  const result = await enhancePrompt({
    prompt: "add tropical plants around the koi pond",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "add_object");
  assert.ok(result.detectedTargetAreas.includes("around the pond") || result.detectedTargetAreas.includes("around the koi pond"));
});

test("detects areca palms with red fruit", async () => {
  const result = await enhancePrompt({
    prompt: "them cay cau do",
    useAiFallback: false,
  });

  assert.ok(result.detectedObjects.includes("areca palm with red fruit"));
});

test("detects bonsai near the right lawn area", async () => {
  const result = await enhancePrompt({
    prompt: "add bonsai near the right lawn area",
    useAiFallback: false,
  });

  assert.ok(result.detectedObjects.includes("bonsai tree"));
  assert.ok(result.detectedTargetAreas.includes("right side"));
});

test("replaces a bonsai with a ficus bonsai tree", async () => {
  const result = await enhancePrompt({
    prompt: "replace a bonsai with a ficus bonsai tree",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "replace_object");
  assert.ok(result.ruleScaffold.includes("ficus bonsai tree"));
});

test("improves lighting around the garden path", async () => {
  const result = await enhancePrompt({
    prompt: "improve lighting around the garden path",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "lighting_design");
  assert.match(result.ruleScaffold, /garden lighting/i);
});

test("preserves layout while changing only paving material", async () => {
  const result = await enhancePrompt({
    prompt: "giu nguyen bo cuc va doi san thanh gach xam ke caro",
    mode: "layout_preservation",
    useAiFallback: false,
  });

  assert.equal(result.detectedIntent, "change_material");
  assert.ok(result.preserveRules.includes("exact object positions"));
});
