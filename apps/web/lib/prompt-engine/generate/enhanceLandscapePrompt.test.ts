import assert from "node:assert/strict";
import test from "node:test";

import { enhanceLandscapePrompt } from "./enhanceLandscapePrompt";

test("detects planting around koi pond as medium-risk area edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "them cay quanh ho koi cho dep",
    promptMode: "auto",
  });

  assert.equal(result.taskType, "planting_design");
  assert.equal(result.editScope, "area_edit");
  assert.equal(result.riskLevel, "medium");
  assert.ok(result.preserveRules.includes("koi pond shape and position"));
  assert.ok(result.preserveRules.includes("original camera angle"));
  assert.ok(result.preserveRules.includes("bridge position"));
  assert.ok(result.preserveRules.includes("gazebo/pavilion position"));
  assert.ok(result.preserveRules.includes("original layout"));
});

test("detects house replacement with exact position as high risk", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "thay mau nha ben trai bang mau nha anh 2, giu dung vi tri",
    referenceImages: ["image-1", "image-2"],
    promptMode: "auto",
  });

  assert.equal(result.taskType, "house_replacement");
  assert.equal(result.editScope, "object_edit");
  assert.equal(result.riskLevel, "high");
  assert.equal(result.shouldShowReview, true);
});

test("detects gray grid courtyard paving as medium-risk area edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "doi san thanh gach xam ke caro",
  });

  assert.equal(result.taskType, "courtyard_paving");
  assert.equal(result.editScope, "area_edit");
  assert.equal(result.riskLevel, "medium");
});

test("detects rockery waterfall replacement as high-risk object edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "chi thay hon non bo thanh 5 dinh 3 thac nuoc",
  });

  assert.equal(result.taskType, "rockery_replacement");
  assert.equal(result.editScope, "object_edit");
  assert.equal(result.riskLevel, "high");
  assert.ok(result.preserveRules.includes("pond shape and water area"));
  assert.ok(result.preserveRules.includes("original camera angle"));
  assert.ok(result.preserveRules.includes("gazebo/pavilion position"));
  assert.ok(result.preserveRules.includes("bridge position"));
  assert.ok(result.preserveRules.includes("wall and fence positions"));
  assert.ok(result.preserveRules.includes("original layout"));
});

test("detects quality and lighting improvement as low-risk global style edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "tang chat luong anh, anh sang dep hon, khong doi vat the",
  });

  assert.equal(result.taskType, "change_lighting");
  assert.equal(result.editScope, "global_style_edit");
  assert.equal(result.riskLevel, "low");
  assert.ok(result.negativeConstraints.includes("Do not move existing objects."));
  assert.ok(result.negativeConstraints.includes("Do not modify unrelated areas."));
});
