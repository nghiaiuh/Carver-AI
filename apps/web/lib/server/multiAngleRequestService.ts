import { createHash } from "node:crypto";
import type {
  CameraShotDirective,
  CameraShotGenerationContext,
  CanvasGraphNodeSnapshot,
  CanvasSnapshotDocument,
} from "@carver/shared";
import { normalizeCameraShotDirective } from "@carver/shared";

type CanonicalMultiAngleRequest = {
  source: CameraShotGenerationContext["source"];
  cameraShotSetContext: CameraShotGenerationContext;
};

type CanonicalMultiAngleRequestResult =
  | { ok: true; value: CanonicalMultiAngleRequest }
  | { ok: false; error: string };

function extractAssetIdFromGatewayUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "https://carver.local");
    return parsed.pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/content$/i)?.[1];
  } catch {
    return undefined;
  }
}

function stableAssetId(params: { assetId?: string; urls?: Array<string | undefined> }) {
  for (const url of params.urls ?? []) {
    const assetId = extractAssetIdFromGatewayUrl(url);
    if (assetId) {
      return assetId;
    }
  }

  return typeof params.assetId === "string" && params.assetId.trim()
    ? params.assetId.trim()
    : undefined;
}

function sortInboundEdges(snapshot: CanvasSnapshotDocument, targetId: string) {
  return snapshot.graph.edges
    .filter((edge) => edge.targetId === targetId)
    .sort((left, right) => {
      const leftCreatedAt = left.createdAt ? Date.parse(left.createdAt) : Number.POSITIVE_INFINITY;
      const rightCreatedAt = right.createdAt ? Date.parse(right.createdAt) : Number.POSITIVE_INFINITY;
      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }

      return left.id.localeCompare(right.id);
    });
}

function resolveSelectedGeneratorOutput(
  node: CanvasGraphNodeSnapshot,
  nodes: CanvasGraphNodeSnapshot[],
) {
  const generator = node.kind === "image-generator"
    ? node
    : node.kind === "image-output-gallery"
      ? nodes.find(
          (candidate) =>
            candidate.id === node.imageOutputGallery?.generatorNodeId &&
            candidate.kind === "image-generator",
        )
      : undefined;
  if (!generator?.imageGenerator) {
    return undefined;
  }

  const selectedOutputAssetId = node.kind === "image-output-gallery"
    ? node.imageOutputGallery?.selectedOutputAssetId
    : generator.imageGenerator.selectedOutputAssetId;

  return generator.imageGenerator.outputs.find((output) => output.assetId === selectedOutputAssetId) ??
    generator.imageGenerator.outputs[0];
}

function resolveCanonicalSourceAssetId(node: CanvasGraphNodeSnapshot, nodes: CanvasGraphNodeSnapshot[]) {
  const generatedOutput = resolveSelectedGeneratorOutput(node, nodes);
  if (generatedOutput) {
    return stableAssetId({
      assetId: generatedOutput.assetId,
      urls: [generatedOutput.imageUrl],
    });
  }

  return stableAssetId({
    assetId: node.sourceImage?.assetId,
    urls: [node.imageUrl, node.sourceImage?.url],
  });
}

function resolveCanonicalSourceAspectRatio(node: CanvasGraphNodeSnapshot, nodes: CanvasGraphNodeSnapshot[]) {
  const generatedOutput = resolveSelectedGeneratorOutput(node, nodes);
  const width = generatedOutput?.width ?? node.sourceImage?.width;
  const height = generatedOutput?.height ?? node.sourceImage?.height;
  return typeof width === "number" && Number.isFinite(width) && width > 0 &&
    typeof height === "number" && Number.isFinite(height) && height > 0
    ? width / height
    : 1;
}

function toCanonicalShot(
  node: CanvasGraphNodeSnapshot,
  cameraId: string,
  order: number,
  params: { sourceAssetId: string; sourceAspectRatio: number },
): CameraShotDirective | null {
  const camera = node.cameraShotSet?.cameras.find((candidate) => candidate.id === cameraId);
  if (!camera || !node.cameraShotSet) {
    return null;
  }

  const shot: CameraShotDirective = node.cameraShotSet.mode === "plan"
    ? {
        shotSetNodeId: node.id,
        shotId: camera.id,
        shotName: camera.name,
        order,
        mode: "plan",
        plan: { ...camera.plan },
      }
    : {
        shotSetNodeId: node.id,
        shotId: camera.id,
        shotName: camera.name,
        order,
        mode: "orbit",
        orbit: { ...camera.orbit },
      };

  // Do not trust a browser or persisted CameraSpec. The snapshot's editable
  // transform is the compatibility boundary and is rebuilt deterministically.
  return normalizeCameraShotDirective({
    shot,
    aspectRatio: params.sourceAspectRatio,
    inputAssetIds: [params.sourceAssetId],
  });
}

/**
 * Rebuilds the multi-angle source and camera directives from the validated
 * snapshot. The browser context is used only to assert the intended shot set;
 * it never supplies the execution source, title, prompt, or camera transform.
 */
export function rebuildCanonicalMultiAngleRequest(params: {
  snapshot: CanvasSnapshotDocument;
  requestedContext: CameraShotGenerationContext;
}): CanonicalMultiAngleRequestResult {
  const shotSetNode = params.snapshot.graph.nodes.find(
    (node) => node.id === params.requestedContext.shotSetNodeId && node.kind === "camera-shot-set",
  );
  if (!shotSetNode?.cameraShotSet) {
    return { ok: false, error: "Multi-angle camera set is not present in the canvas snapshot." };
  }

  const sourceEdges = sortInboundEdges(params.snapshot, shotSetNode.id);
  if (sourceEdges.length !== 1 || sourceEdges[0]?.sourceGroupId) {
    return { ok: false, error: "Multi-angle generation requires exactly one direct source image connection." };
  }

  const sourceEdge = sourceEdges[0];
  const sourceNode = params.snapshot.graph.nodes.find((node) => node.id === sourceEdge.sourceId);
  if (!sourceNode) {
    return { ok: false, error: "Multi-angle source image is not present in the canvas snapshot." };
  }

  if (params.requestedContext.source.nodeId !== sourceNode.id) {
    return { ok: false, error: "Multi-angle source image does not match the canvas connection." };
  }

  const assetId = resolveCanonicalSourceAssetId(sourceNode, params.snapshot.graph.nodes);
  if (!assetId) {
    return { ok: false, error: "Multi-angle source image must be backed by a persisted asset." };
  }

  if (params.requestedContext.source.assetId && params.requestedContext.source.assetId !== assetId) {
    return { ok: false, error: "Multi-angle source asset does not match the canvas snapshot." };
  }

  const sourceAspectRatio = resolveCanonicalSourceAspectRatio(sourceNode, params.snapshot.graph.nodes);

  const visibleCameras = shotSetNode.cameraShotSet.cameras.filter((camera) => camera.isVisible);
  if (params.requestedContext.shots.length !== visibleCameras.length) {
    return { ok: false, error: "Multi-angle camera context does not include every visible camera." };
  }

  const shots: CameraShotDirective[] = [];
  for (const [order, camera] of visibleCameras.entries()) {
    const requestedShot = params.requestedContext.shots[order];
    if (
      !requestedShot ||
      requestedShot.shotSetNodeId !== shotSetNode.id ||
      requestedShot.shotId !== camera.id ||
      requestedShot.order !== order ||
      requestedShot.mode !== shotSetNode.cameraShotSet.mode
    ) {
      return { ok: false, error: "Multi-angle camera order does not match the canvas filmstrip." };
    }

    let shot: CameraShotDirective | null;
    try {
      shot = toCanonicalShot(shotSetNode, camera.id, order, {
        sourceAssetId: assetId,
        sourceAspectRatio,
      });
    } catch {
      return { ok: false, error: "Multi-angle camera shot could not be normalized from the canvas snapshot." };
    }
    if (!shot) {
      return { ok: false, error: "Multi-angle camera shot is not available in the canvas snapshot." };
    }
    shots.push(shot);
  }

  const source = {
    nodeId: sourceNode.id,
    title: sourceNode.title,
    imageUrl: "",
    assetId,
    role: "direct_edit_target",
    prompt: sourceNode.prompt ?? null,
  };

  return {
    ok: true,
    value: {
      source,
      cameraShotSetContext: {
        shotSetNodeId: shotSetNode.id,
        source,
        shots,
      },
    },
  };
}

function canonicalizeNodeForRequestIdentity(node: CanvasGraphNodeSnapshot) {
  const nodeAssetId = stableAssetId({
    assetId: node.sourceImage?.assetId,
    urls: [node.imageUrl, node.sourceImage?.url],
  });

  return {
    ...node,
    imageUrl: "",
    sourceImage: node.sourceImage
      ? {
          ...node.sourceImage,
          assetId: nodeAssetId ?? node.sourceImage.assetId,
          url: "",
        }
      : undefined,
    imageGenerator: node.imageGenerator
      ? {
          ...node.imageGenerator,
          outputs: node.imageGenerator.outputs.map((output) => ({
            ...output,
            assetId: stableAssetId({ assetId: output.assetId, urls: [output.imageUrl] }) ?? output.assetId,
            imageUrl: "",
          })),
        }
      : undefined,
    contextGroup: node.contextGroup
      ? {
          ...node.contextGroup,
          items: node.contextGroup.items.map((item) => ({
            ...item,
            assetId: stableAssetId({ assetId: item.assetId, urls: [item.imageUrl] }) ?? item.assetId,
            imageUrl: "",
          })),
        }
      : undefined,
    presetGroup: node.presetGroup
      ? {
          ...node.presetGroup,
          children: node.presetGroup.children.map((child) => {
            const assetId = stableAssetId({
              assetId: child.assetId ?? child.sourceImage?.assetId,
              urls: [child.imageSrc, child.sourceImage?.url],
            });
            return {
              ...child,
              assetId: assetId ?? child.assetId,
              imageSrc: "",
              sourceImage: child.sourceImage
                ? {
                    ...child.sourceImage,
                    assetId: assetId ?? child.sourceImage.assetId,
                    url: "",
                  }
                : undefined,
            };
          }),
        }
      : undefined,
  };
}

/**
 * Hashes only persisted asset identities and semantic snapshot state. Runtime
 * gateway URLs carry expiring tokens and therefore must never affect replay.
 */
export function buildCanonicalMultiAngleRequestHash(params: {
  snapshot: CanvasSnapshotDocument;
  request: CanonicalMultiAngleRequest;
}) {
  const identity = {
    source: {
      nodeId: params.request.source.nodeId,
      assetId: params.request.source.assetId,
    },
    cameraShotSet: params.request.cameraShotSetContext,
    snapshot: {
      ...params.snapshot,
      graph: {
        ...params.snapshot.graph,
        nodes: params.snapshot.graph.nodes.map(canonicalizeNodeForRequestIdentity),
      },
    },
  };

  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}
