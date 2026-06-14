/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React from "react";
import type { CanvasNode, CanvasEdge } from "./CanvasWorkspace";
import { buildBezierPath, getImageHandlePoint } from "./imageGraph";

type CanvasEdgesProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEdgeId: string | null;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
  // For interactive dragging
  draftEdge?: { sourceId: string; sourceHandle?: CanvasEdge["fromHandle"]; targetX: number; targetY: number } | null;
};

export default function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  onEdgeClick,
  draftEdge,
}: CanvasEdgesProps) {
  const getNodeAnchor = (nodeId: string, handle?: CanvasEdge["fromHandle"]) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return getImageHandlePoint(node, handle ?? "right");
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
      {/* Render established edges */}
      {edges.map((edge) => {
        const sourceCenter = getNodeAnchor(edge.sourceId, edge.fromHandle ?? "right");
        const targetCenter = getNodeAnchor(edge.targetId, edge.toHandle ?? "left");
        
        if (!sourceCenter || !targetCenter) return null;

        const isSelected = selectedEdgeId === edge.id;
        const pathData = buildBezierPath(sourceCenter, targetCenter);

        // Calculate midpoint for label
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
              stroke={isSelected ? "#8A8A8A" : "#5F5F5F"}
              strokeWidth={isSelected ? "2.5" : "2"}
              className="group-hover:stroke-[#9CA3AF] transition-colors"
            />
            
            {/* Label in the middle */}
            <foreignObject x={midX - 35} y={midY - 12} width="70" height="24">
              <div className={`flex items-center justify-center h-full w-full rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm transition-colors ${
                isSelected 
                  ? "bg-[#EFF6FF] border-[#3B82F6] text-[#1D4ED8]" 
                  : "bg-white border-[#E5E7EB] text-[#6B7280] group-hover:border-[#9CA3AF] group-hover:text-[#374151]"
              }`}>
                {edge.label}
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* Render draft edge if dragging */}
      {draftEdge && (() => {
        const sourceCenter = getNodeAnchor(draftEdge.sourceId, draftEdge.sourceHandle ?? "right");
        if (!sourceCenter) return null;
        const pathData = buildBezierPath(sourceCenter, { x: draftEdge.targetX, y: draftEdge.targetY });
        return (
          <path
            d={pathData}
            fill="none"
            stroke="#737373"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="opacity-70 animate-pulse"
          />
        );
      })()}
    </svg>
  );
}
