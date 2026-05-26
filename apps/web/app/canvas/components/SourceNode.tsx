"use client";

import { Bot, Image as ImageIcon, Layers3 } from "lucide-react";
import NextImage from "next/image";
import { CanvasNode, Source } from "../data/canvasData";

type SourceNodeProps = {
  node: CanvasNode;
  source?: Source;
  selected: boolean;
  onSelect: () => void;
};

export default function SourceNode({ node, source, selected, onSelect }: SourceNodeProps) {
  const isOutput = node.kind === "output";

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`canvas-node absolute overflow-hidden rounded-2xl border text-left shadow-xl transition ${
        selected ? "border-[#22C55E] ring-4 ring-[#22C55E]/15" : "border-[#E5E7EB] hover:border-[#D0D5DD]"
      } ${isOutput ? "bg-[#111827] text-white shadow-black/20" : "bg-white text-[#0A0A0A] shadow-black/8"}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
    >
      {/* Thumbnail image strip */}
      {source?.thumbnail && !isOutput ? (
        <div className="absolute inset-0">
          <NextImage
            src={source.thumbnail}
            alt={node.title}
            fill
            className="object-cover opacity-20"
            sizes={`${node.w}px`}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/60 to-white/95" />
        </div>
      ) : null}
      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`grid h-10 w-10 place-items-center rounded-xl ${isOutput ? "bg-white/12 text-[#A7A1FF]" : "bg-[#F7F8FA] text-[#667085]"}`}>
            {isOutput ? <Bot className="h-5 w-5" aria-hidden="true" /> : source?.type === "Floorplan" ? <Layers3 className="h-5 w-5" aria-hidden="true" /> : <ImageIcon className="h-5 w-5" aria-hidden="true" />}
          </div>
          {source ? (
            <span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#667085]">{source.role}</span>
          ) : (
            <span className="rounded-full bg-white/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white/70">output</span>
          )}
        </div>
        <div className="mt-auto">
          <p className="line-clamp-2 text-sm font-black leading-tight">{node.title}</p>
          <p className={`mt-1 text-xs font-semibold ${isOutput ? "text-white/56" : "text-[#667085]"}`}>{node.subtitle}</p>
          {isOutput ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/12">
              <div className="h-full w-3/4 rounded-full bg-[#6D5DFB]" />
            </div>
          ) : source?.thumbnail ? (
            <div className="relative mt-3 h-10 overflow-hidden rounded-xl border border-black/5">
              <NextImage
                src={source.thumbnail}
                alt={node.title}
                fill
                className="object-cover"
                sizes={`${node.w}px`}
              />
            </div>
          ) : (
            <div className="mt-3 h-8 rounded-xl" style={{ background: `linear-gradient(135deg, ${node.color}, #FFFFFF)` }} />
          )}
        </div>
      </div>
    </button>
  );
}
