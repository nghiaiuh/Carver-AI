import test from "node:test";
import assert from "node:assert/strict";
import { PROMPT_INTERPRETATION_JSON_SCHEMA, validatePromptInterpreterResult } from "./schemas";

test("prompt interpretation schema requires every operation property for strict mode", () => {
  const schema = PROMPT_INTERPRETATION_JSON_SCHEMA.schema as {
    properties: {
      operations: {
        items: {
          properties: Record<string, unknown>;
          required: string[];
        };
      };
    };
  };

  const operationProperties = Object.keys(schema.properties.operations.items.properties).sort();
  const requiredProperties = [...schema.properties.operations.items.required].sort();

  assert.deepEqual(requiredProperties, operationProperties);
});

test("validatePromptInterpreterResult accepts nullable strict operation fields", () => {
  const result = validatePromptInterpreterResult({
    executionMode: "image_edit",
    targetHint: null,
    operations: [
      {
        type: "restyle",
        objectCategory: null,
        targetContextId: null,
        replacementCategory: null,
        referenceContextId: null,
        material: null,
        attribute: null,
        value: null,
        style: "japanese garden",
        spatialRelation: null,
        destination: null,
        dependsOn: [],
        executionGroup: null,
      },
    ],
    references: [],
    preserveRequests: [],
    avoidRequests: [],
    notes: [],
  });

  assert.ok(result);
  assert.equal(result?.operations[0]?.type, "restyle");
  assert.equal(result?.operations[0]?.style, "japanese garden");
  assert.equal(result?.operations[0]?.spatialRelation, undefined);
});
