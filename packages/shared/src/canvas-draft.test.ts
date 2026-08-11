import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCanvasDraftOperations,
  buildCanvasDraftOperations,
  createEmptyCanvasSnapshotDocument,
  getCanvasOperationConflict,
  toCanvasOperationV2,
} from "./index";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const LIBRARY_ASSET_ID = "22222222-2222-4222-8222-222222222222";
const PASTED_ASSET_ID = "33333333-3333-4333-8333-333333333333";

function buildDocument() {
  const document = createEmptyCanvasSnapshotDocument();
  document.graph = {
    activeGenerationTargetId: "pasted-image",
    nodes: [
      {
        id: "pasted-image",
        kind: "image",
        title: "Pasted image",
        role: "layout",
        imageUrl: "",
        sourceImage: { assetId: PASTED_ASSET_ID, quality: "original" },
        x: 20,
        y: 40,
        width: 240,
        height: 160,
      },
      {
        id: "preset-group",
        kind: "presetGroup",
        title: "Plant references",
        role: "reference",
        imageUrl: "",
        x: 360,
        y: 40,
        width: 220,
        height: 160,
        presetGroup: {
          category: "plants",
          activeChildId: "full-bloom",
          children: [
            {
              id: "full-bloom",
              slot: "plant-1",
              label: "Full Bloom",
              imageSrc: "",
              order: 0,
              assetId: LIBRARY_ASSET_ID,
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "preset-to-pasted",
        sourceId: "preset-group",
        sourcePresetChildId: "full-bloom",
        targetId: "pasted-image",
        targetPortId: "port-img-0",
        label: "Plant reference",
        role: "plant_reference",
      },
    ],
  };
  return document;
}

test("draft operations replay pasted assets, library presets, and their edge", () => {
  const emptyDocument = createEmptyCanvasSnapshotDocument();
  const nextDocument = buildDocument();
  const { operations } = buildCanvasDraftOperations({
    previousDocument: emptyDocument,
    nextDocument,
    projectId: PROJECT_ID,
    tabId: "tab-1",
    baseRevision: 0,
    sequenceStart: 0,
  });

  const restored = applyCanvasDraftOperations(emptyDocument, operations);

  assert.deepEqual(restored.graph, nextDocument.graph);
});

test("draft operations remove edges when their source image is deleted", () => {
  const original = buildDocument();
  const nextDocument = createEmptyCanvasSnapshotDocument();
  nextDocument.graph = {
    nodes: original.graph.nodes.filter((node) => node.id !== "pasted-image"),
    edges: [],
    activeGenerationTargetId: null,
  };
  const { operations } = buildCanvasDraftOperations({
    previousDocument: original,
    nextDocument,
    projectId: PROJECT_ID,
    tabId: "tab-1",
    baseRevision: 1,
    sequenceStart: 10,
  });

  const restored = applyCanvasDraftOperations(original, operations);

  assert.deepEqual(restored.graph, nextDocument.graph);
});

test("draft operations replay viewport zoom changes", () => {
  const original = buildDocument();
  original.camera.zoom = 1;

  const nextDocument = buildDocument();
  nextDocument.camera.zoom = 1.75;

  const { operations } = buildCanvasDraftOperations({
    previousDocument: original,
    nextDocument,
    projectId: PROJECT_ID,
    tabId: "tab-1",
    baseRevision: 2,
    sequenceStart: 20,
  });

  const restored = applyCanvasDraftOperations(original, operations);

  assert.equal(restored.camera.zoom, 1.75);
  assert.deepEqual(restored.camera, nextDocument.camera);
});

test("draft operation conflicts only when two batches touch the same entity", () => {
  const original = buildDocument();
  const local = buildDocument();
  const remote = buildDocument();
  local.graph.nodes[0] = { ...local.graph.nodes[0], x: 120 };
  remote.graph.nodes[1] = { ...remote.graph.nodes[1], x: 540 };

  const localOperations = buildCanvasDraftOperations({
    previousDocument: original,
    nextDocument: local,
    projectId: PROJECT_ID,
    tabId: "tab-local",
    baseRevision: 3,
    sequenceStart: 0,
  }).operations.map((operation, index) => toCanvasOperationV2(operation, {
    clientId: "tab-local",
    clientSequence: index + 1,
  }));
  const remoteOperations = buildCanvasDraftOperations({
    previousDocument: original,
    nextDocument: remote,
    projectId: PROJECT_ID,
    tabId: "tab-remote",
    baseRevision: 3,
    sequenceStart: 0,
  }).operations.map((operation, index) => toCanvasOperationV2(operation, {
    clientId: "tab-remote",
    clientSequence: index + 1,
  }));

  assert.equal(getCanvasOperationConflict(localOperations, remoteOperations).hasConflict, false);

  const sameNode = buildDocument();
  sameNode.graph.nodes[0] = { ...sameNode.graph.nodes[0], y: 200 };
  const sameNodeOperations = buildCanvasDraftOperations({
    previousDocument: original,
    nextDocument: sameNode,
    projectId: PROJECT_ID,
    tabId: "tab-remote",
    baseRevision: 3,
    sequenceStart: 0,
  }).operations.map((operation, index) => toCanvasOperationV2(operation, {
    clientId: "tab-remote",
    clientSequence: index + 1,
  }));

  const conflict = getCanvasOperationConflict(localOperations, sameNodeOperations);
  assert.equal(conflict.hasConflict, true);
  assert.deepEqual(conflict.entityKeys, ["node:pasted-image"]);
});
