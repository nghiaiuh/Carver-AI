"use client";

import { CanvasEdge, CanvasNode } from "../data/canvasData";

type ConnectionLayerProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export default function ConnectionLayer({ nodes, edges }: ConnectionLayerProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <marker id="connection-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L7,3 z" fill="#98A2B3" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + from.w;
        const y1 = from.y + from.h / 2;
        const x2 = to.x;
        const y2 = to.y + to.h / 2;
        const c1 = x1 + Math.max(80, (x2 - x1) * 0.44);
        const c2 = x2 - Math.max(80, (x2 - x1) * 0.34);
        const d = `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
        const lx = (x1 + x2) / 2;
        const ly = (y1 + y2) / 2;
        return (
          <g key={edge.id} className="connection-line pointer-events-auto group">
            <path d={d} fill="none" stroke="transparent" strokeWidth="18" />
            <path className="connection-path" d={d} fill="none" stroke="#98A2B3" strokeWidth="1.8" strokeDasharray="6 7" markerEnd="url(#connection-arrow)" />
            <foreignObject x={lx - 38} y={ly - 15} width="76" height="30">
              <div className="mx-auto w-fit rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#667085] shadow-sm group-hover:border-[#6D5DFB] group-hover:text-[#6D5DFB]">
                {edge.label}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
