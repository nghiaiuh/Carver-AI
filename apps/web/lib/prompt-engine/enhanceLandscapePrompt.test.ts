/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { enhanceLandscapePrompt } from "./enhanceLandscapePrompt";
import { enhancePromptDraft } from "./enhancePromptDraft";

test("builds an editable enhanced draft before final compile", () => {
  const result = enhancePromptDraft({
    rawPrompt: "thêm cây quanh hồ koi cho đẹp",
  });

  assert.equal(result.taskType, "planting_design");
  assert.equal(result.editScope, "area_edit");
  assert.equal(result.riskLevel, "medium");
  assert.match(result.enhancedDraft, /planting/i);
  assert.match(result.enhancedDraft, /camera angle/i);
});

test("detects planting around koi pond as medium-risk area edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "thêm cây quanh hồ koi cho đẹp",
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
    rawPrompt: "thay mẫu nhà bên trái bằng mẫu nhà ảnh 2, giữ đúng vị trí",
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
    rawPrompt: "đổi sân thành gạch xám kẻ caro",
  });

  assert.equal(result.taskType, "courtyard_paving");
  assert.equal(result.editScope, "area_edit");
  assert.equal(result.riskLevel, "medium");
});

test("detects rockery waterfall replacement as high-risk object edit", () => {
  const result = enhanceLandscapePrompt({
    rawPrompt: "chỉ thay hòn non bộ thành 5 đỉnh 3 thác nước",
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
    rawPrompt: "tăng chất lượng ảnh, ánh sáng đẹp hơn, không đổi vật thể",
  });

  assert.equal(result.taskType, "change_lighting");
  assert.equal(result.editScope, "global_style_edit");
  assert.equal(result.riskLevel, "low");
  assert.ok(result.negativeConstraints.includes("Do not move existing objects."));
  assert.ok(result.negativeConstraints.includes("Do not modify unrelated areas."));
});
