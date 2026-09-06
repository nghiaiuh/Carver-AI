import assert from "node:assert/strict";
import test from "node:test";
import type { CameraShotGenerationContext, CanvasSnapshotDocument } from "@carver/shared";
import {
  buildCanonicalMultiAngleRequestHash,
  rebuildCanonicalMultiAngleRequest,
} from "./multiAngleRequestService";

const SOURCE_ASSET_ID = "11111111-1111-4111-8111-111111111111";

function makeSnapshot(token: string): CanvasSnapshotDocument {
  return {
    snapshotVersion: 1,
    projectId: "project-1",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    objects: [],
    regions: [],
    locks: [],
    selection: { objectIds: [], regionIds: [], activeAssetIds: [] },
    graph: {
      activeGenerationTargetId: "generator-1",
      nodes: [
        {
          id: "source-image",
          kind: "image",
          title: "Existing garden",
          role: "output",
          imageUrl: `/api/assets/${SOURCE_ASSET_ID}/content?token=${token}`,
          prompt: "Original site concept",
          x: 0,
          y: 0,
          width: 640,
          height: 480,
          sourceImage: {
            url: `/api/assets/${SOURCE_ASSET_ID}/content?token=${token}`,
            width: 640,
            height: 480,
            quality: "original",
          },
        },
        {
          id: "camera-set",
          kind: "camera-shot-set",
          title: "Multi-Angles",
          role: "text",
          imageUrl: "",
          x: 700,
          y: 0,
          width: 860,
          height: 680,
          cameraShotSet: {
            mode: "orbit",
            cameras: [{
              id: "front",
              name: "Front view",
              isVisible: true,
              plan: {
                u: 0.5,
                v: 0.2,
                targetU: 0.5,
                targetV: 0.5,
                height: 2.8,
                lens: 28,
                pitch: 0,
                viewDirection: "look-at-target",
              },
              orbit: { rotate: 15, tilt: 5, distance: 7.5, lens: 35 },
            }],
          },
        },
        {
          id: "generator-1",
          kind: "image-generator",
          title: "Image Generator",
          role: "generator",
          imageUrl: "",
          x: 1700,
          y: 0,
          width: 540,
          height: 500,
          imageGenerator: {
            prompt: "Keep the pond and path layout.",
            model: "auto",
            aspectRatio: "1:1",
            outputCount: 1,
            status: "idle",
            outputAssetIds: [],
            outputs: [],
          },
        },
      ],
      edges: [
        {
          id: "source-to-camera",
          sourceId: "source-image",
          targetId: "camera-set",
          kind: "image",
          sourcePortId: "source-right-image",
          targetPortId: "camera-shot-set-input-image",
          label: "",
        },
        {
          id: "camera-to-generator",
          sourceId: "camera-set",
          targetId: "generator-1",
          kind: "text",
          sourcePortId: "camera-shot-set-output-text",
          targetPortId: "image-generator-input-text",
          label: "",
        },
      ],
    },
    markers: [],
    addedObjects: [],
    sketchLines: [],
    sketchGroups: [],
    penStrokes: [],
    penSettings: { color: "#000000", opacity: 1, strokeWidth: 2, drawingMode: "freehand" },
  } as unknown as CanvasSnapshotDocument;
}

function makeRequestedContext(token: string): CameraShotGenerationContext {
  return {
    shotSetNodeId: "camera-set",
    source: {
      nodeId: "source-image",
      title: "Untrusted browser title",
      imageUrl: `/api/assets/${SOURCE_ASSET_ID}/content?token=${token}`,
      assetId: SOURCE_ASSET_ID,
      role: "direct_edit_target",
      prompt: "Untrusted browser prompt",
    },
    shots: [{
      shotSetNodeId: "camera-set",
      shotId: "front",
      shotName: "Untrusted browser name",
      order: 0,
      mode: "orbit",
      orbit: { rotate: -80, tilt: 45, distance: 99, lens: 120 },
    }],
  };
}

test("rebuilds the multi-angle source and camera from the snapshot", () => {
  const result = rebuildCanonicalMultiAngleRequest({
    snapshot: makeSnapshot("old-token"),
    requestedContext: makeRequestedContext("old-token"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value.source, {
    nodeId: "source-image",
    title: "Existing garden",
    imageUrl: "",
    assetId: SOURCE_ASSET_ID,
    role: "direct_edit_target",
    prompt: "Original site concept",
  });
  assert.deepEqual(result.value.cameraShotSetContext.shots[0]?.orbit, {
    rotate: 15,
    tilt: 5,
    distance: 7.5,
    lens: 35,
  });
});

test("multi-angle request hash is unchanged when gateway URLs refresh", () => {
  const first = rebuildCanonicalMultiAngleRequest({
    snapshot: makeSnapshot("old-token"),
    requestedContext: makeRequestedContext("old-token"),
  });
  const refreshed = rebuildCanonicalMultiAngleRequest({
    snapshot: makeSnapshot("new-token"),
    requestedContext: makeRequestedContext("new-token"),
  });

  assert.equal(first.ok, true);
  assert.equal(refreshed.ok, true);
  if (!first.ok || !refreshed.ok) return;

  assert.equal(
    buildCanonicalMultiAngleRequestHash({ snapshot: makeSnapshot("old-token"), request: first.value }),
    buildCanonicalMultiAngleRequestHash({ snapshot: makeSnapshot("new-token"), request: refreshed.value }),
  );
});

test("rejects a browser context that points at a different source asset", () => {
  const context = makeRequestedContext("old-token");
  context.source.assetId = "22222222-2222-4222-8222-222222222222";

  const result = rebuildCanonicalMultiAngleRequest({
    snapshot: makeSnapshot("old-token"),
    requestedContext: context,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Multi-angle source asset does not match the canvas snapshot.",
  });
});
