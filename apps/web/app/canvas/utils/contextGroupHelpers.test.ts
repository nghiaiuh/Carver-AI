import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasContextGroupNode, CanvasNode } from "../types/canvas";
import { getContextGroupInputPorts } from "./canvasNodePorts";
import { createContextGroupItems, resolveContextGroupItems } from "./contextGroupHelpers";

const assetId = "11111111-1111-4111-8111-111111111111";

function createImageNode(url: string): CanvasNode {
  return {
    id: "site-image",
    kind: "image",
    x: 120,
    y: 80,
    width: 640,
    height: 420,
    imageUrl: url,
    sourceImage: {
      assetId,
      url,
      width: 1600,
      height: 1050,
      quality: "original",
    },
    title: "Existing Site Photo",
    prompt: null,
    role: "layout",
    inputPorts: [],
  };
}

test("context groups persist stable asset IDs instead of gateway URLs", () => {
  const gatewayUrl = `/api/assets/${assetId}/content?exp=123&token=short-lived`;
  const items = createContextGroupItems([createImageNode(gatewayUrl)], "site-set");

  assert.equal(items.length, 1);
  assert.equal(items[0]?.assetId, assetId);
  assert.equal(items[0]?.imageUrl, "");
  assert.equal(items[0]?.role, "layout_reference");
});

test("context group resolves a freshly delivered URL from its linked image node", () => {
  const storedItem = createContextGroupItems(
    [createImageNode(`/api/assets/${assetId}/content?exp=123&token=old`)],
    "site-set",
  )[0]!;
  const group: CanvasContextGroupNode = {
    id: "site-set",
    kind: "context-group",
    x: 820,
    y: 80,
    width: 340,
    height: 260,
    imageUrl: "",
    title: "Site Set",
    prompt: null,
    role: "reference",
    inputPorts: getContextGroupInputPorts(),
    contextGroup: { kind: "site-set", items: [storedItem] },
  };
  const freshUrl = `/api/assets/${assetId}/content?exp=999&token=fresh`;

  const resolved = resolveContextGroupItems(group, [createImageNode(freshUrl), group]);

  assert.deepEqual(resolved, [
    {
      id: storedItem.id,
      sourceNodeId: "site-image",
      title: "Existing Site Photo",
      assetId,
      imageUrl: freshUrl,
      role: "layout_reference",
    },
  ]);
});
