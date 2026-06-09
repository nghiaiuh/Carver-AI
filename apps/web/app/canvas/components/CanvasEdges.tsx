/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React from "react";
import type { CanvasNode, CanvasEdge } from "./CanvasWorkspace";

type CanvasEdgesProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEdgeId: string | null;
  onEdgeClick: (id: string, e: React.MouseEvent) => void;
  // For interactive dragging
  draftEdge?: { sourceId: string; targetX: number; targetY: number } | null;
};

export default function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  onEdgeClick,
  draftEdge,
}: CanvasEdgesProps) {
  // Helper to find node center coordinates
  const getNodeCenter = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2 + 16, // approximate center taking into account padding
    };
  };

  const drawBezier = (x1: number, y1: number, x2: number, y2: number) => {
    // For a nice curve, control points are offset horizontally
    const dx = Math.abs(x2 - x1);
    const offsetX = Math.max(dx * 0.4, 50);
    // If target is to the left, curve backwards. We just use standard horizontal bezier
    const dir = x2 > x1 ? 1 : -1;
    return `M ${x1} ${y1} C ${x1 + offsetX * dir} ${y1}, ${x2 - offsetX * dir} ${y2}, ${x2} ${y2}`;
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
      {/* Render established edges */}
      {edges.map((edge) => {
        const sourceCenter = getNodeCenter(edge.sourceId);
        const targetCenter = getNodeCenter(edge.targetId);
        
        if (!sourceCenter || !targetCenter) return null;

        const isSelected = selectedEdgeId === edge.id;
        const pathData = drawBezier(sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y);

        // Calculate midpoint for label
        const midX = (sourceCenter.x + targetCenter.x) / 2;
        const midY = (sourceCenter.y + targetCenter.y) / 2;

        return (
          <g key={edge.id} className="group pointer-events-auto cursor-pointer" onClick={(e) => onEdgeClick(edge.id, e)}>
            {/* Invisible thick path for easier hovering/clicking */}
            <path d={pathData} fill="none" stroke="transparent" strokeWidth="20" />
            
            {/* Visible path */}
            <path
              d={pathData}
              fill="none"
              stroke={isSelected ? "#3B82F6" : "#D1D5DB"}
              strokeWidth={isSelected ? "3" : "2"}
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
        const sourceCenter = getNodeCenter(draftEdge.sourceId);
        if (!sourceCenter) return null;
        const pathData = drawBezier(sourceCenter.x, sourceCenter.y, draftEdge.targetX, draftEdge.targetY);
        return (
          <path
            d={pathData}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeDasharray="5,5"
            className="opacity-70 animate-pulse"
          />
        );
      })()}
    </svg>
  );
}
