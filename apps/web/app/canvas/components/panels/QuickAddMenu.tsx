"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Image as ImageIcon,
  FileText,
  Sparkles,
  Lock,
  Grid,
  Square,
  Type,
  UploadCloud,
  Compass,
  Layers,
  X,
} from "lucide-react";

type QuickAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: string) => void;
};

export default function QuickAddMenu({ open, onClose, onSelectType }: QuickAddMenuProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const nodeTypes = [
    {
      id: "upload-image",
      title: "Project Site Images",
      category: "Media",
      icon: <ImageIcon className="h-4 w-4 text-blue-500" />,
      desc: "Upload site photos or courtyard layout references",
    },
    {
      id: "text-note",
      title: "Site Notes / Constraints",
      category: "Context",
      icon: <FileText className="h-4 w-4 text-emerald-500" />,
      desc: "Add site notes, priorities, and physical requirements",
    },
    {
      id: "ai-brief",
      title: "AI Landscape Brief",
      category: "AI Workflow",
      icon: <Sparkles className="h-4 w-4 text-[#EA7542]" />,
      desc: "Define concept direction, style, materials, and atmosphere",
    },
    {
      id: "spatial-locks",
      title: "Spatial Locks Node",
      category: "Constraints",
      icon: <Lock className="h-4 w-4 text-amber-500" />,
      desc: "Lock house position, pond shape, paths, and mature trees",
    },
    {
      id: "carver-generate",
      title: "Carver Generate Node",
      category: "AI Workflow",
      icon: <Sparkles className="h-4 w-4 text-purple-500" />,
      desc: "AI generation engine node with image input context",
    },
    {
      id: "concept-set",
      title: "Concept Variations Set",
      category: "Output",
      icon: <Grid className="h-4 w-4 text-indigo-500" />,
      desc: "Compare multi-option AI concept variations in a 2x2 grid",
    },
    {
      id: "mood-study",
      title: "Alternate Mood Study",
      category: "Style",
      icon: <Compass className="h-4 w-4 text-pink-500" />,
      desc: "Reference images for atmosphere, lighting, and planting style",
    },
    {
      id: "drop-zone",
      title: "Upload Drop Zone",
      category: "Media",
      icon: <UploadCloud className="h-4 w-4 text-[#EA7542]" />,
      desc: "Canvas drop target for dragging external image files",
    },
    {
      id: "workflow-frame",
      title: "Workflow Section Frame",
      category: "Structure",
      icon: <Square className="h-4 w-4 text-slate-600" />,
      desc: "Group related nodes into an architectural workflow frame",
    },
  ];

  const filtered = nodeTypes.filter(
    (n) =>
      n.title.toLowerCase().includes(query.toLowerCase()) ||
      n.desc.toLowerCase().includes(query.toLowerCase()) ||
      n.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl border border-[#E5E3DC] bg-white p-4 shadow-[0_24px_60px_rgba(0,0,0,0.12)]">
        {/* Header Search */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E3DC] bg-[#F8F7F3] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-[#827E75]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search node types (e.g., Site Images, Brief, Spatial Locks)..."
            className="w-full bg-transparent text-sm font-medium text-[#1A1918] placeholder-[#827E75] outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1 text-[#827E75] hover:bg-[#E5E3DC] hover:text-[#1A1918]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Node Types List */}
        <div className="mt-3 max-h-96 overflow-y-auto space-y-1 pr-1">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectType(item.id);
                onClose();
              }}
              className="flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-[#F8F7F3] active:scale-[0.99]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2F0E9] shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1918]">{item.title}</span>
                  <span className="rounded-md bg-[#F2F0E9] px-2 py-0.5 text-[10px] font-semibold text-[#827E75]">
                    {item.category}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#827E75]">{item.desc}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-xs font-medium text-[#827E75]">
              No node types found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
