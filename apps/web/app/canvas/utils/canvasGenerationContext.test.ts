import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasContextGroupNode, CanvasNode } from "../types/canvas";
import { getContextGroupInputPorts } from "./canvasNodePorts";
import { buildCanvasSnapshotWithGraph, resolveConnectedImageReferences } from "./canvasGenerationContext";
import { hydrateCanvasStateFromSnapshot } from "./canvasSnapshotHydration";

const assetId = "22222222-2222-4222-8222-222222222222";

const siteImage: CanvasNode = {
  id: "site-image",
  kind: "image",
  x: 20,
  y: 40,
  width: 640,
  height: 420,
  imageUrl: `/api/assets/${assetId}/content?exp=123&token=signed`,
  sourceImage: {
    assetId,
    url: `/api/assets/${assetId}/content?exp=123&token=signed`,
    width: 1600,
    height: 1050,
    quality: "original",
  },
  title: "Site Photo",
  prompt: null,
  role: "layout",
  inputPorts: [],
};

const siteSet: CanvasContextGroupNode = {
  id: "site-set",
  kind: "context-group",
  x: 720,
  y: 40,
  width: 340,
  height: 260,
  imageUrl: "",
  title: "Site Set",
  prompt: null,
  role: "reference",
  inputPorts: getContextGroupInputPorts(),
  contextGroup: {
    kind: "site-set",
    items: [{
      id: "context-item-site-image",
      nodeId: "site-image",
      assetId,
      imageUrl: "",
      title: "Site Photo",
      role: "layout_reference",
    }],
  },
};

test("a context group expands into the individual image reference at generation time", () => {
  const references = resolveConnectedImageReferences(
    "target",
    [siteImage, siteSet, {
      ...siteImage,
      id: "target",
      title: "Generator Target",
    }],
    [{
      id: "site-set-to-target",
      sourceId: "site-set",
      targetId: "target",
      targetPortId: "image-generator-input-image",
      sourcePortId: "context-group-output-image",
      kind: "image",
      label: "Site context",
      role: "layout_reference",
    }],
  );

  assert.equal(references.length, 1);
  assert.equal(references[0]?.assetId, assetId);
  assert.equal(references[0]?.role, "layout_reference");
});

test("a lightweight group uses the connection role instead of its display label", () => {
  const secondAssetId = "44444444-4444-4444-8444-444444444444";
  const references = resolveConnectedImageReferences(
    "generator",
    [
      { ...siteImage, id: "site-a", groupId: "existing-site", groupLabel: "Any user label" },
      {
        ...siteImage,
        id: "site-b",
        title: "Rear garden",
        groupId: "existing-site",
        groupLabel: "Any user label",
        sourceImage: { ...siteImage.sourceImage!, assetId: secondAssetId },
      },
      { ...siteImage, id: "generator", title: "Image Generator" },
    ],
    [{
      id: "existing-site-to-generator",
      sourceId: "site-a",
      sourceGroupId: "existing-site",
      targetId: "generator",
      targetPortId: "image-generator-input-image",
      sourcePortId: "group-output-image",
      kind: "image",
      label: "Sketch / Layout",
      role: "structure_reference",
    }],
  );

  assert.equal(references.length, 2);
  assert.deepEqual(references.map((reference) => reference.role), ["structure_reference", "structure_reference"]);
});

test("scene graph lite materializes stable references and preservation evidence", () => {
  const snapshot = buildCanvasSnapshotWithGraph({
    nodes: [siteImage, siteSet],
    edges: [],
    activeGenerationTargetId: "site-image",
    addedObjects: [{
      id: "pond",
      x: 44,
      y: 61,
      w: 22,
      h: 13,
      rotation: 0,
      label: "Koi pond",
    }],
    markers: [{ id: "waterfall-mark", x: 71, y: 36, label: "Rockery waterfall" }],
    sketchGroups: [{
      id: "path-sketch",
      nameTag: "Stepping stone path",
      objectType: "hardscape",
      lineIds: [],
      bounds: { x: 10, y: 20, w: 30, h: 8 },
      selectedAssetIds: [],
    }],
  });

  assert.equal(snapshot.references.length, 1);
  assert.equal(snapshot.references[0]?.assetId, assetId);
  assert.equal(snapshot.references[0]?.role, "layout_reference");
  assert.equal(snapshot.objects[0]?.label, "Koi pond");
  assert.equal(snapshot.regions.length, 2);
  assert.ok(snapshot.locks.some((lock) => lock.type === "layout" && lock.strength === "hard"));
  assert.ok(snapshot.locks.some((lock) => lock.targetId === "pond" && lock.type === "position"));
  assert.ok(snapshot.locks.some((lock) => lock.targetId === "path-sketch" && lock.type === "shape"));
  assert.equal(snapshot.graph.nodes.find((node) => node.id === "site-image")?.imageUrl, "");
});

test("a lightweight group and its role edge survive the snapshot round trip", () => {
  const snapshot = buildCanvasSnapshotWithGraph({
    nodes: [
      { ...siteImage, id: "grouped-site-a", groupId: "site-views", groupLabel: "Site views", groupColor: "sage" },
      { ...siteImage, id: "grouped-site-b", title: "Rear site view", groupId: "site-views", groupLabel: "Site views", groupColor: "sage" },
    ],
    edges: [{
      id: "site-views-edge",
      sourceId: "grouped-site-a",
      sourceGroupId: "site-views",
      targetId: "grouped-site-b",
      sourcePortId: "group-output-image",
      targetPortId: "image-generator-input-image",
      kind: "image",
      label: "Site / Base",
      role: "layout_reference",
    }],
    activeGenerationTargetId: null,
    addedObjects: [],
    markers: [],
    sketchGroups: [],
  });
  const hydrated = hydrateCanvasStateFromSnapshot(snapshot);

  assert.equal(hydrated.nodes[0]?.groupLabel, "Site views");
  assert.equal(hydrated.nodes[0]?.groupColor, "sage");
  assert.equal(hydrated.edges[0]?.sourceGroupId, "site-views");
});
