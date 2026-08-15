"use client";

import React, { useState } from "react";
import {
  Search,
  Image as ImageIcon,
  FileText,
  Lock,
  Grid,
  Square,
  UploadCloud,
  Compass,
  Camera,
  Map as MapIcon,
  Layers,
  X,
} from "lucide-react";
import Sparkles from "../../../components/icons/CarverSparklesIcon";

type QuickAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: string, sourceNodeIds?: string[]) => void;
  contextSourceOptions?: Array<{ id: string; title: string }>;
  initialContextSourceIds?: string[];
};

const CONTEXT_GROUP_TYPES = new Set(["site-set", "sketch-layer", "material-board"]);

export default function QuickAddMenu({
  open,
  onClose,
  onSelectType,
  contextSourceOptions = [],
  initialContextSourceIds = [],
}: QuickAddMenuProps) {
  const [query, setQuery] = useState("");
  const [pendingContextGroupType, setPendingContextGroupType] = useState<string | null>(null);
  const [selectedContextSourceIds, setSelectedContextSourceIds] = useState<string[]>([]);
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
      id: "site-set",
      title: "Site Set",
      category: "Context",
      icon: <MapIcon className="h-4 w-4 text-sky-600" />,
      desc: "Group selected site photos into one layout-aware input",
    },
    {
      id: "sketch-layer",
      title: "Sketch Layer",
      category: "Context",
      icon: <Layers className="h-4 w-4 text-violet-600" />,
      desc: "Group selected plan or sketch references into one input",
    },
    {
      id: "material-board",
      title: "Material Board",
      category: "Context",
      icon: <Grid className="h-4 w-4 text-amber-600" />,
      desc: "Group selected planting and material references into one input",
    },
    {
      id: "camera-shot-set",
      title: "Camera Shot Set",
      category: "Camera",
      icon: <Camera className="h-4 w-4 text-rose-500" />,
      desc: "Plan selected camera viewpoints and connect them as AI text context",
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
            type="text"
            autoFocus
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

        {pendingContextGroupType ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#1A1918]">Choose context images</p>
                <p className="mt-0.5 text-xs text-[#827E75]">The group stores stable references and exposes one shared output port.</p>
              </div>
              <button type="button" onClick={() => setPendingContextGroupType(null)} className="text-xs font-semibold text-[#827E75] hover:text-[#1A1918]">Back</button>
            </div>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {contextSourceOptions.map((source) => {
                const selected = selectedContextSourceIds.includes(source.id);
                return (
                  <label key={source.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#F8F7F3]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => setSelectedContextSourceIds((current) =>
                        selected ? current.filter((id) => id !== source.id) : [...current, source.id],
                      )}
                      className="h-4 w-4 accent-[#EA7542]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1A1918]">{source.title}</span>
                  </label>
                );
              })}
              {contextSourceOptions.length === 0 ? (
                <p className="rounded-xl bg-[#F8F7F3] px-3 py-4 text-center text-xs text-[#827E75]">Add site images to the canvas before creating a context group.</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={selectedContextSourceIds.length === 0}
              onClick={() => {
                onSelectType(pendingContextGroupType, selectedContextSourceIds);
                onClose();
              }}
              className="mt-4 w-full rounded-xl bg-[#1A1918] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2C2A26] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Create group with {selectedContextSourceIds.length} image{selectedContextSourceIds.length === 1 ? "" : "s"}
            </button>
          </div>
        ) : (
          <div className="mt-3 max-h-96 overflow-y-auto space-y-1 pr-1">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (CONTEXT_GROUP_TYPES.has(item.id)) {
                  setPendingContextGroupType(item.id);
                  setSelectedContextSourceIds(initialContextSourceIds);
                  return;
                }
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
        )}
      </div>
    </div>
  );
}
