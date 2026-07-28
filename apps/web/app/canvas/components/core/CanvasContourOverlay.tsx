"use client";

import React from "react";

export default function CanvasContourOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none opacity-40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="contour-pattern" width="1200" height="800" patternUnits="userSpaceOnUse">
          {/* Subtle Topographic Contour Lines */}
          <path
            d="M -100 200 C 200 100, 400 350, 700 200 C 1000 50, 1100 300, 1300 150"
            fill="none"
            stroke="#D5D2C7"
            strokeWidth="0.75"
            strokeDasharray="4 4"
          />
          <path
            d="M -100 280 C 180 180, 420 400, 680 260 C 950 120, 1150 360, 1300 220"
            fill="none"
            stroke="#E0DDD2"
            strokeWidth="0.75"
          />
          <path
            d="M -100 360 C 150 260, 450 450, 660 320 C 900 190, 1200 420, 1300 290"
            fill="none"
            stroke="#E8E5DC"
            strokeWidth="0.5"
          />
          
          {/* Corner Botanical Ring Contour Marks */}
          <circle cx="1050" cy="650" r="120" fill="none" stroke="#E2DFD6" strokeWidth="0.75" strokeDasharray="3 3" />
          <circle cx="1050" cy="650" r="80" fill="none" stroke="#E8E5DC" strokeWidth="0.5" />
          <circle cx="1050" cy="650" r="40" fill="none" stroke="#EEECE4" strokeWidth="0.5" />

          <circle cx="150" cy="150" r="90" fill="none" stroke="#E2DFD6" strokeWidth="0.5" strokeDasharray="2 4" />
          <circle cx="150" cy="150" r="50" fill="none" stroke="#E8E5DC" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#contour-pattern)" />
    </svg>
  );
}
