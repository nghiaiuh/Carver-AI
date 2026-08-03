/*
 * CanvasEdges
 * Renders SVG bezier edges between canvas nodes, with port-aware anchoring.
 * Semantic ports take precedence when an edge stores a source/target port ID.
 * Legacy edges retain aggregate-handle geometry for snapshot compatibility.
 */

"use client";

import React from "react";
import type { CanvasNode, CanvasEdge } from "../../types/canvas";
import {
  buildBezierPath,
  getAggregateHandlePoint,
  getEdgeConnectionKind,
  getImageHandlePoint,
  getInputPortHandlePoint,
  getSemanticPortPoint,
} from "./canvasConnectionGeometry";
import {
  getPresetChildAnchor,
  getPresetChildRightAnchor,
  isPresetGroupNode,
} from "../../utils/presetGroupHelpers";

type CanvasEdgesProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEdgeId: string | null;
  cutMode?: boolean;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
  onEdgeCut?: (id: string) => void;
  // For interactive dragging — includes optional snappedPortId from hit-radius resolution
  draftEdge?: {
    sourceId: string;
    sourceHandle?: CanvasEdge["fromHandle"];
    sourcePortId?: string;
    connectionKind: "text" | "image";
    targetX: number;
    targetY: number;
    snappedPortId?: string | null;
    snappedNodeId?: string | null;
    /** When the drag started from a preset child thumbnail */
    sourcePresetChildId?: string;
  } | null;
};

export default function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  cutMode = false,
  onEdgeClick,
  onEdgeCut,
  draftEdge,
}: CanvasEdgesProps) {
  /** Get the output anchor, preferring the edge's stable semantic source port. */
  const getSourceAnchor = (
    nodeId: string,
    sourcePortId?: string,
    handle?: CanvasEdge["fromHandle"],
    connectionKind: "text" | "image" = "image",
  ) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const semanticPoint = getSemanticPortPoint(node, sourcePortId);
    if (semanticPoint) return semanticPoint;

    if (!isPresetGroupNode(node)) {
      // Image cards follow the assistant convention for legacy edges as well:
      // sources leave from the right-side cluster unless the saved edge chose a side.
      return getAggregateHandlePoint(node, handle ?? "right", connectionKind);
    }

    return getImageHandlePoint(node, handle ?? "right");
  };

  /** Get the input port anchor for a target node, based on the edge's targetPortId. */
  const getTargetPortAnchor = (nodeId: string, targetPortId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const targetEdge = edges.find((edge) => edge.targetId === nodeId && edge.targetPortId === targetPortId);
    const connectionKind = targetEdge ? getEdgeConnectionKind(targetEdge) : "image";
    if (targetEdge?.targetPresetChildId && isPresetGroupNode(node)) {
      const childAnchor = getPresetChildAnchor(node, targetEdge.targetPresetChildId);
      if (childAnchor) return childAnchor;
    }

    const semanticPoint = getSemanticPortPoint(node, targetPortId);
    if (semanticPoint) return semanticPoint;

    if (!isPresetGroupNode(node)) {
      // A legacy target without an explicit handle enters through the left-side
      // cluster, matching the semantic input ports on assistant cards.
      return getAggregateHandlePoint(node, targetEdge?.toHandle ?? "left", connectionKind);
    }
    return getInputPortHandlePoint(node, 0, 1);
  };

  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      shapeRendering="geometricPrecision"
      style={{ overflow: "visible", zIndex: 10 }}
    >
      {/* Render established edges */}
      {edges.map((edge) => {
        let sourceCenter: { x: number; y: number } | null = null;
        if (edge.sourcePresetChildId) {
          const sourceNode = nodes.find((n) => n.id === edge.sourceId);
          if (sourceNode && isPresetGroupNode(sourceNode)) {
            sourceCenter = getPresetChildRightAnchor(sourceNode, edge.sourcePresetChildId);
          }
        }
        if (!sourceCenter) {
          sourceCenter = getSourceAnchor(
            edge.sourceId,
            edge.sourcePortId,
            edge.fromHandle,
            getEdgeConnectionKind(edge),
          );
        }
        const targetCenter = getTargetPortAnchor(edge.targetId, edge.targetPortId);
        
        if (!sourceCenter || !targetCenter) return null;

        const isSelected = selectedEdgeId === edge.id;
        const pathData = buildBezierPath(sourceCenter, targetCenter);
        const connectionKind = getEdgeConnectionKind(edge);
        const strokeColor =
          connectionKind === "text"
            ? "var(--canvas-theme-connection-text)"
            : "var(--canvas-theme-connection-image)";
        const badgeBackground =
          connectionKind === "text"
            ? "var(--canvas-theme-connection-text-soft)"
            : "var(--canvas-theme-connection-image-soft)";

        // Calculate midpoint for a compact hover label.
        const midX = (sourceCenter.x + targetCenter.x) / 2;
        const midY = (sourceCenter.y + targetCenter.y) / 2;

        return (
          <g
            key={edge.id}
            data-canvas-interactive="true"
            className={`group pointer-events-auto ${cutMode ? "cursor-none" : "cursor-pointer"}`}
            onClick={(event) => {
              if (cutMode) {
                event.preventDefault();
                event.stopPropagation();
                onEdgeCut?.(edge.id);
                return;
              }

              onEdgeClick(edge.id, event);
            }}
          >
            {/* Invisible thick path for easier hovering/clicking */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth="20"
            />
            
            {/* Visible path */}
            <path
              d={pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isSelected ? "2.8" : "2.2"}
              strokeLinecap="round"
              className="opacity-90 transition-opacity group-hover:opacity-100"
            />

            {/* Hover Label */}
            <foreignObject x={midX - 35} y={midY - 12} width="70" height="24">
              <div className={`flex h-full w-full items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-wider shadow-sm transition ${
                isSelected 
                  ? "opacity-100"
                  : "bg-[var(--canvas-theme-surface-panel)] border-[var(--canvas-theme-border)] text-[var(--canvas-theme-text-muted)] opacity-0 group-hover:opacity-100"
              }`}
              style={isSelected ? { background: badgeBackground, borderColor: strokeColor, color: strokeColor } : undefined}>
                {connectionKind}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* Render draft edge if dragging */}
      {draftEdge && (() => {
        // Resolve source anchor: preset child right-center OR generic node handle
        let sourceCenter: { x: number; y: number } | null = null;

        if (draftEdge.sourcePresetChildId) {
          const sourceNode = nodes.find((n) => n.id === draftEdge.sourceId);
          if (sourceNode && isPresetGroupNode(sourceNode)) {
            sourceCenter = getPresetChildRightAnchor(sourceNode, draftEdge.sourcePresetChildId);
          }
        }

        if (!sourceCenter) {
          sourceCenter = getSourceAnchor(
            draftEdge.sourceId,
            draftEdge.sourcePortId,
            draftEdge.sourceHandle,
            draftEdge.connectionKind,
          );
        }

        if (!sourceCenter) return null;

        // If we have a snapped port, use its anchor; otherwise follow cursor
        let targetPoint = { x: draftEdge.targetX, y: draftEdge.targetY };

        if (draftEdge.snappedPortId && draftEdge.snappedNodeId) {
          const snappedAnchor = getTargetPortAnchor(draftEdge.snappedNodeId, draftEdge.snappedPortId);
          if (snappedAnchor) {
            targetPoint = snappedAnchor;
          }
        }

        const pathData = buildBezierPath(sourceCenter, targetPoint);
        const isSnapped = !!draftEdge.snappedPortId;
        const strokeColor =
          draftEdge.connectionKind === "text"
            ? "var(--canvas-theme-connection-text)"
            : "var(--canvas-theme-connection-image)";

        return (
          <path
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth={isSnapped ? "2.8" : "2.2"}
            strokeDasharray={isSnapped ? "none" : "4 4"}
            className={isSnapped ? "opacity-90" : "opacity-70 animate-pulse"}
          />
        );
      })()}
    </svg>
  );
}
