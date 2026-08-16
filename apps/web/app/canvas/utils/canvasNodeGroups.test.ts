import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasEdge, CanvasNode } from "../types/canvas";
import {
  arrangeCanvasNodeGroup,
  getCanvasEdgeSourceNodes,
  getCanvasNodeGroups,
} from "./canvasNodeGroups";
import {
  getGroupPortButtonLayout,
  getGroupSemanticPort,
  getGroupSemanticPortPoint,
  GROUP_OUTPUT_IMAGE_PORT_ID,
  isGroupPortCompatibleWithConnection,
} from "./canvasGroupPorts";

const groupedNodes: CanvasNode[] = [
  {
    id: "site-a",
    kind: "image",
    x: 20,
    y: 40,
    width: 320,
    height: 200,
    imageUrl: "",
    title: "Site photo A",
    prompt: null,
    role: "layout",
    inputPorts: [],
    groupId: "site-views",
    groupLabel: "Existing site views",
  },
  {
    id: "site-b",
    kind: "image",
    x: 390,
    y: 80,
    width: 280,
    height: 180,
    imageUrl: "",
    title: "Site photo B",
    prompt: null,
    role: "layout",
    inputPorts: [],
    groupId: "site-views",
    groupLabel: "Existing site views",
  },
];

test("a lightweight group has stable bounds and a typed image output port", () => {
  const [group] = getCanvasNodeGroups(groupedNodes);

  assert.equal(group?.label, "Existing site views");
  assert.deepEqual(group?.nodeIds, ["site-a", "site-b"]);
  assert.deepEqual(getGroupSemanticPort(GROUP_OUTPUT_IMAGE_PORT_ID), {
    id: GROUP_OUTPUT_IMAGE_PORT_ID,
    direction: "output",
    kind: "image",
    side: "right",
    order: 0,
    label: "Grouped image output",
    acceptedKinds: ["image"],
    maxConnections: "many",
  });
  assert.deepEqual(getGroupSemanticPortPoint(group!, GROUP_OUTPUT_IMAGE_PORT_ID), { x: 742, y: 35 });
  assert.deepEqual(getGroupPortButtonLayout(group!, GROUP_OUTPUT_IMAGE_PORT_ID), {
    left: 772,
    top: 45,
    size: 32,
  });
  assert.equal(isGroupPortCompatibleWithConnection(GROUP_OUTPUT_IMAGE_PORT_ID, "image"), true);
  assert.equal(isGroupPortCompatibleWithConnection(GROUP_OUTPUT_IMAGE_PORT_ID, "text"), false);
  assert.equal(isGroupPortCompatibleWithConnection("unknown-port", "image"), false);
});

test("a group edge expands all member images without a synthetic group node", () => {
  const edge: CanvasEdge = {
    id: "site-views-to-generator",
    sourceId: "site-a",
    sourceGroupId: "site-views",
    targetId: "generator",
    targetPortId: "image-generator-input-image",
    kind: "image",
    label: "Site / Base",
    role: "layout_reference",
  };

  assert.deepEqual(
    getCanvasEdgeSourceNodes(groupedNodes, edge).map((node) => node.id),
    ["site-a", "site-b"],
  );
});

test("arrange operations update member coordinates without changing their group identity", () => {
  const arranged = arrangeCanvasNodeGroup(groupedNodes, "site-views", "stack");

  assert.equal(arranged[0]?.groupId, "site-views");
  assert.equal(arranged[0]?.x, arranged[1]?.x);
  assert.ok((arranged[1]?.y ?? 0) > (arranged[0]?.y ?? 0));
});
