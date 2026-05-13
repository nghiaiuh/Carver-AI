"use client";

import { useState } from "react";
import LeftSidebar from "../../components/LeftSidebar";
import CanvasArea from "../../components/CanvasArea";
import RightPanel from "../../components/RightPanel";

export default function CanvasPage() {
  const [activeLayer, setActiveLayer] = useState<string | null>("layer-1");
  const [zoom, setZoom] = useState(100);

  return (
    <div className="studio-layout">
      <LeftSidebar
        activeLayer={activeLayer}
        onLayerSelect={setActiveLayer}
        zoom={zoom}
      />
      <CanvasArea
        activeLayer={activeLayer}
        zoom={zoom}
        setZoom={setZoom}
      />
      <RightPanel />
    </div>
  );
}
