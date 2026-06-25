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
import { buildBezierPath, getImageHandlePoint, getInputPortHandlePoint } from "./imageGraph";
import { getPresetChildAnchor, isPresetGroupNode } from "../../utils/presetGroup";

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
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
      {/* Render established edges */}
      {edges.map((edge) => {
        const sourceCenter = getSourceAnchor(edge.sourceId, edge.fromHandle ?? "right");
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
              stroke={isSelected ? "#22D3EE" : "#5F5F5F"}
              strokeWidth={isSelected ? "2.75" : "2"}
              strokeLinecap="round"
              className="opacity-85 transition-colors group-hover:stroke-[#9CA3AF] group-hover:opacity-100"
            />

            <circle
              cx={targetCenter.x}
              cy={targetCenter.y}
              r={isSelected ? "4" : "3"}
              fill={isSelected ? "#22D3EE" : "#9CA3AF"}
              className="opacity-90 transition group-hover:fill-[#D1D5DB]"
            />

            {/* Keep labels discoverable without making dense graphs noisy. */}
            <foreignObject x={midX - 35} y={midY - 12} width="70" height="24">
              <div className={`flex h-full w-full items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-wider shadow-sm transition ${
                isSelected 
                  ? "bg-[#ECFEFF] border-[#22D3EE] text-[#155E75] opacity-100"
                  : "bg-white border-[#E5E7EB] text-[#6B7280] opacity-0 group-hover:opacity-100 group-hover:border-[#9CA3AF] group-hover:text-[#374151]"
              }`}>
                {edge.label}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* Render draft edge if dragging */}
      {draftEdge && (() => {
        const sourceCenter = getSourceAnchor(draftEdge.sourceId, draftEdge.sourceHandle ?? "right");
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
            stroke={isSnapped ? "#22D3EE" : "#737373"}
            strokeWidth={isSnapped ? "2.5" : "2"}
            strokeDasharray={isSnapped ? "none" : "4 4"}
            className={isSnapped ? "opacity-90" : "opacity-70 animate-pulse"}
          />
        );
      })()}
    </svg>
  );
}
