"use client";

import type React from "react";
import type {
  CanvasConnectionKind,
  CanvasEdge,
  CanvasNode,
  ImageHandlePosition,
} from "../../types/canvas";
import {
  getCanvasNodeVisualScale,
  getNodeSemanticPorts,
  getPortsBySide,
  resolveTargetPortIdForEdge,
} from "../../utils/canvasNodePorts";
import {
  CANVAS_PORT_HANDLE_OUTSET,
  getCornerAnchoredPortOffsetY,
} from "../../utils/canvasPortLayout";
import { getEdgeConnectionKind } from "./canvasConnectionGeometry";
import CanvasConnectionPortHandle from "./CanvasConnectionPortHandle";

type CanvasSemanticPortHandlesProps = {
  node: CanvasNode;
  edges: CanvasEdge[];
  selected: boolean;
  isConnectionTarget: boolean;
  onStartConnection: (
    nodeId: string,
    side: ImageHandlePosition,
    kind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
    sourcePortId?: string,
  ) => void;
};

/** Shared semantic port rendering for every registry-backed canvas card. */
export default function CanvasSemanticPortHandles({
  node,
  edges,
  selected,
  isConnectionTarget,
  onStartConnection,
}: CanvasSemanticPortHandlesProps) {
  const displayHeight = node.height * getCanvasNodeVisualScale(node);

  return getNodeSemanticPorts(node).flatMap((port) => {
    const count = edges.filter((edge) =>
      port.direction === "input"
        ? edge.targetId === node.id && resolveTargetPortIdForEdge({
            node,
            targetPortId: edge.targetPortId,
            kind: getEdgeConnectionKind(edge),
          }) === port.id
        : edge.sourceId === node.id && edge.sourcePortId === port.id,
    ).length;
    if (!selected && count === 0) return [];

    const sameSidePorts = getPortsBySide(node, port.side);
    const portIndex = sameSidePorts.findIndex((candidate) => candidate.id === port.id);
    const top = getCornerAnchoredPortOffsetY({
      height: displayHeight,
      index: Math.max(portIndex, 0),
      total: sameSidePorts.length,
      side: port.side,
    });

    return (
      <div
        key={port.id}
        className="absolute z-[150]"
        style={{
          width: "32px",
          height: "32px",
          top,
          left: port.side === "left" ? `${-CANVAS_PORT_HANDLE_OUTSET}px` : "auto",
          right: port.side === "right" ? `${-CANVAS_PORT_HANDLE_OUTSET}px` : "auto",
          transform: "translateY(-50%)",
        }}
      >
        <CanvasConnectionPortHandle
          ariaLabel={port.label}
          title={port.label}
          count={count}
          kind={port.kind}
          selected={selected}
          active={selected || isConnectionTarget}
          interactive={port.direction === "output"}
          onPointerDown={(event) =>
            onStartConnection(node.id, port.side, port.kind, event, port.id)
          }
        />
      </div>
    );
  });
}
