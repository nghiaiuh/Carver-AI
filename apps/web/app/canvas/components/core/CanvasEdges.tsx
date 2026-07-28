/*
 * CanvasEdges
 * Renders SVG bezier edges between canvas nodes, with port-aware anchoring.
 * Source anchors use the right-side output handle.
 * Target anchors use getInputPortHandlePoint based on the edge's targetPortId.
 */

"use client";

import React from "react";
import type { CanvasNode, CanvasEdge } from "../../types/canvas";
import { getVisibleInputPorts } from "../../types/canvas";
import {
  buildBezierPath,
  getImageHandlePoint,
  getInputPortHandlePoint,
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
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
  // For interactive dragging — includes optional snappedPortId from hit-radius resolution
  draftEdge?: {
    sourceId: string;
    sourceHandle?: CanvasEdge["fromHandle"];
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
  onEdgeClick,
  draftEdge,
}: CanvasEdgesProps) {
  /** Get the output (right-side) anchor for a source node. */
  const getSourceAnchor = (nodeId: string, handle?: CanvasEdge["fromHandle"]) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return getImageHandlePoint(node, handle ?? "right");
  };

  /** Get the input port anchor for a target node, based on the edge's targetPortId. */
  const getTargetPortAnchor = (nodeId: string, targetPortId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const targetEdge = edges.find((edge) => edge.targetId === nodeId && edge.targetPortId === targetPortId);
    if (targetEdge?.targetPresetChildId && isPresetGroupNode(node)) {
      const childAnchor = getPresetChildAnchor(node, targetEdge.targetPresetChildId);
      if (childAnchor) return childAnchor;
    }

    const visiblePorts = getVisibleInputPorts(node.inputPorts, edges, node.id);
    const portVisibleIndex = visiblePorts.findIndex((p) => p.id === targetPortId);

    if (portVisibleIndex === -1) {
      // Fallback: port not visible (shouldn't happen, but graceful degradation)
      return getImageHandlePoint(node, "left");
    }

    return getInputPortHandlePoint(node, portVisibleIndex, visiblePorts.length);
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible", zIndex: 10 }}>
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
          sourceCenter = getSourceAnchor(edge.sourceId, edge.fromHandle ?? "right");
        }
        const targetCenter = getTargetPortAnchor(edge.targetId, edge.targetPortId);
        
        if (!sourceCenter || !targetCenter) return null;

        const isSelected = selectedEdgeId === edge.id;
        const pathData = buildBezierPath(sourceCenter, targetCenter);

        // Calculate midpoint for a compact hover label.
        const midX = (sourceCenter.x + targetCenter.x) / 2;
        const midY = (sourceCenter.y + targetCenter.y) / 2;

        return (
          <g
            key={edge.id}
            data-canvas-interactive="true"
            className="group pointer-events-auto cursor-pointer"
            onClick={(e) => onEdgeClick(edge.id, e)}
          >
            {/* Invisible thick path for easier hovering/clicking */}
            <path d={pathData} fill="none" stroke="transparent" strokeWidth="20" />
            
            {/* Visible path */}
            <path
              d={pathData}
              fill="none"
              stroke={isSelected ? "#EA7542" : "#94A3B8"}
              strokeWidth={isSelected ? "2.2" : "1.5"}
              strokeLinecap="round"
              className="opacity-70 transition-colors group-hover:stroke-[#3B82F6] group-hover:opacity-100"
            />

            <circle
              cx={targetCenter.x}
              cy={targetCenter.y}
              r={isSelected ? "4" : "3"}
              fill={isSelected ? "#EA7542" : "#3B82F6"}
              className="opacity-90 transition group-hover:scale-125"
            />

            {/* Hover Label */}
            <foreignObject x={midX - 35} y={midY - 12} width="70" height="24">
              <div className={`flex h-full w-full items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-wider shadow-sm transition ${
                isSelected 
                  ? "bg-[#FFF5F0] border-[#EA7542] text-[#EA7542] opacity-100"
                  : "bg-white border-[#E5E3DC] text-[#827E75] opacity-0 group-hover:opacity-100 group-hover:border-[#3B82F6] group-hover:text-[#3B82F6]"
              }`}>
                {edge.label}
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
          sourceCenter = getSourceAnchor(draftEdge.sourceId, draftEdge.sourceHandle ?? "right");
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

        return (
          <path
            d={pathData}
            fill="none"
            stroke={isSnapped ? "#466E55" : "#9CAF9A"}
            strokeWidth={isSnapped ? "2.2" : "1.5"}
            strokeDasharray={isSnapped ? "none" : "4 4"}
            className={isSnapped ? "opacity-90" : "opacity-70 animate-pulse"}
          />
        );
      })()}
    </svg>
  );
}
