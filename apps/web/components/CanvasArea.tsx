"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface CardData {
  id: string;
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  rotate: number;
  label: string;
}

const INITIAL_CARDS: CardData[] = [
  {
    id: "card-1",
    src: "/assets/garden_3d_render.png",
    alt: "Garden 3D Realistic Render",
    x: 120,
    y: 80,
    width: 340,
    rotate: -1.5,
    label: "Garden 3D Realistic Render",
  },
  {
    id: "card-2",
    src: "/assets/mark_generation.png",
    alt: "Mark Generation",
    x: 520,
    y: 180,
    width: 280,
    rotate: 1.2,
    label: "Mark Generation",
  },
  {
    id: "card-3",
    src: "/assets/canvas_texture.png",
    alt: "Canvas Texture",
    x: 280,
    y: 360,
    width: 300,
    rotate: -0.8,
    label: "Canvas Texture",
  },
];

const TOOLS = [
  { id: "select", icon: "cursor", title: "Select" },
  { id: "pin", icon: "pin", title: "Pin" },
  { id: "image", icon: "image", title: "Upload Image" },
  { id: "grid", icon: "grid", title: "Grid" },
  { id: "shape", icon: "rect", title: "Shape" },
  { id: "draw", icon: "pencil", title: "Draw" },
  { id: "text", icon: "text", title: "Text" },
  { id: "export", icon: "share", title: "Export" },
];

function ToolIcon({ icon }: { icon: string }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, width: 18, height: 18 };
  switch (icon) {
    case "cursor": return <svg {...props}><path d="M5 3l14 9-7 1-3 7L5 3z" /></svg>;
    case "pin": return <svg {...props}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" /></svg>;
    case "image": return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;
    case "grid": return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
    case "rect": return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" /></svg>;
    case "pencil": return <svg {...props}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
    case "text": return <svg {...props}><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>;
    case "share": return <svg {...props}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>;
    default: return null;
  }
}

interface CanvasAreaProps {
  activeLayer: string | null;
  zoom: number;
  setZoom: (z: number) => void;
}

export default function CanvasArea({ activeLayer, zoom, setZoom }: CanvasAreaProps) {
  const [activeTool, setActiveTool] = useState("select");
  const [cards, setCards] = useState<CardData[]>(INITIAL_CARDS);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Zoom with wheel
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(Math.max(25, Math.min(200, zoom + (e.deltaY < 0 ? 10 : -10))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, setZoom]);

  const onCardMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    const card = cards.find(c => c.id === id)!;
    setDragging(id);
    setDragOffset({ x: e.clientX - card.x, y: e.clientY - card.y });
  }, [activeTool, cards]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setCards(prev => prev.map(c => c.id === dragging
        ? { ...c, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
        : c
      ));
    }
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [dragging, dragOffset, isPanning, panStart]);

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === "select" && !dragging) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [activeTool, dragging, pan]);

  return (
    <div className="canvas-wrapper">
      {/* Dot-grid background */}
      <div
        id="canvas-area"
        ref={canvasRef}
        className={`canvas-area ${activeTool === "select" ? "cursor-grab" : ""} ${isPanning ? "cursor-grabbing" : ""}`}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseDown={onCanvasMouseDown}
        onMouseLeave={onMouseUp}
      >
        {/* Dot grid */}
        <svg className="canvas-grid" aria-hidden>
          <defs>
            <pattern id="dot-pattern" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="0.75" cy="0.75" r="0.75" fill="#d1d5db" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-pattern)" />
        </svg>

        {/* Cards */}
        <div
          className="canvas-content"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`, transformOrigin: "0 0" }}
        >
          {cards.map((card) => (
            <div
              key={card.id}
              id={card.id}
              className={`canvas-card ${activeLayer === card.id ? "canvas-card-active" : ""} ${dragging === card.id ? "canvas-card-dragging" : ""}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                transform: `rotate(${card.rotate}deg)`,
              }}
              onMouseDown={(e) => onCardMouseDown(e, card.id)}
            >
              <div className="canvas-card-image-wrap">
                <Image
                  src={card.src}
                  alt={card.alt}
                  fill
                  className="canvas-card-image"
                  draggable={false}
                  sizes={`${card.width}px`}
                />
              </div>
              <div className="canvas-card-footer">
                <span className="canvas-card-label">{card.label}</span>
                <span className="canvas-card-badge">AI</span>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas label */}
        <div className="canvas-label">
          <div className="canvas-label-dot" />
          <span>Carver Studio · Infinite Canvas</span>
        </div>
      </div>

      {/* Floating toolbar */}
      <div className="floating-toolbar" id="floating-toolbar">
        {TOOLS.map((tool, i) => (
          <>
            {i === 7 && <div key="sep" className="toolbar-sep" />}
            <button
              key={tool.id}
              id={`tool-${tool.id}`}
              className={`toolbar-btn ${activeTool === tool.id ? "toolbar-btn-active" : ""}`}
              title={tool.title}
              onClick={() => setActiveTool(tool.id)}
            >
              <ToolIcon icon={tool.icon} />
            </button>
          </>
        ))}
        <div className="toolbar-sep" />
        <button id="tool-ai" className="toolbar-ai-btn" title="AI Action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span>AI</span>
        </button>
      </div>
    </div>
  );
}
