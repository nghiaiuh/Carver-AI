"use client";

import { useState } from "react";
import Image from "next/image";

const layers = [
  {
    id: "layer-1",
    title: "Garden 3D Realistic Render",
    subtitle: "Image · 3 min ago",
    thumb: "/assets/garden_3d_render.png",
    color: "#e8f5e9",
  },
  {
    id: "layer-2",
    title: "Mark Generation",
    subtitle: "Design · 8 min ago",
    thumb: "/assets/mark_generation.png",
    color: "#ede7f6",
  },
  {
    id: "layer-3",
    title: "Canvas Texture",
    subtitle: "Image · 15 min ago",
    thumb: "/assets/canvas_texture.png",
    color: "#fff3e0",
  },
];

interface LeftSidebarProps {
  activeLayer: string | null;
  onLayerSelect: (id: string) => void;
  zoom: number;
}

export default function LeftSidebar({ activeLayer, onLayerSelect, zoom }: LeftSidebarProps) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <button
        id="sidebar-open-btn"
        onClick={() => setVisible(true)}
        className="sidebar-toggle-btn"
        title="Open Layers"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="left-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          <div className="sidebar-logo">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <span className="sidebar-title">Layers</span>
        </div>
        <button id="sidebar-close-btn" className="icon-btn" onClick={() => setVisible(false)} title="Close sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* History Section */}
      <div className="sidebar-section">
        <button
          id="history-toggle-btn"
          className="section-toggle"
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="12" height="12"
            style={{ transform: historyOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span>History</span>
          <span className="section-badge">3</span>
        </button>

        {historyOpen && (
          <div className="history-empty">
            <div className="empty-illustration">
              <svg viewBox="0 0 64 64" fill="none" width="40" height="40">
                <circle cx="32" cy="32" r="28" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="4 3" />
                <path d="M32 20v12l8 4" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="32" cy="32" r="3" fill="#e5e7eb" />
              </svg>
            </div>
            <p className="empty-label">No history yet</p>
            <p className="empty-sublabel">Your AI generations will appear here</p>
          </div>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* Layers list */}
      <div className="sidebar-section layers-section">
        <div className="section-header-row">
          <span className="section-label">Generated</span>
          <button className="icon-btn-sm" title="Add layer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="layer-list">
          {layers.map((layer) => (
            <button
              key={layer.id}
              id={`layer-item-${layer.id}`}
              className={`layer-item ${activeLayer === layer.id ? "layer-item-active" : ""}`}
              onClick={() => onLayerSelect(layer.id)}
            >
              <div className="layer-thumb" style={{ background: layer.color }}>
                <Image
                  src={layer.thumb}
                  alt={layer.title}
                  fill
                  className="layer-thumb-img"
                  sizes="40px"
                />
              </div>
              <div className="layer-info">
                <p className="layer-name">{layer.title}</p>
                <p className="layer-sub">{layer.subtitle}</p>
              </div>
              <div className="layer-actions">
                <span className="layer-dot" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom minimap */}
      <div className="sidebar-bottom">
        <div className="minimap">
          <div className="minimap-canvas">
            <div className="minimap-card" style={{ left: "8%", top: "15%", width: "35%", height: "28%" }} />
            <div className="minimap-card" style={{ left: "50%", top: "30%", width: "30%", height: "22%" }} />
            <div className="minimap-card" style={{ left: "20%", top: "55%", width: "25%", height: "18%" }} />
            <div className="minimap-viewport" />
          </div>
        </div>
        <div className="zoom-bar">
          <button className="icon-btn-sm" title="Zoom out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35M8 11h6" />
            </svg>
          </button>
          <span className="zoom-pct">{zoom}%</span>
          <button className="icon-btn-sm" title="Zoom in">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
            </svg>
          </button>
          <button className="icon-btn-sm" title="Fit to screen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
