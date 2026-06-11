import type { CSSProperties } from "react";

export type CanvasThemeStyle = CSSProperties & Record<`--canvas-theme-${string}`, string>;

const DEFAULT_THEME_COLOR = "#F5F5F5";

function normalizeHexColor(color: string) {
  const value = color.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(value)) return value;
  return DEFAULT_THEME_COLOR;
}

function hexToRgb(color: string) {
  const normalized = normalizeHexColor(color).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function getRelativeLuminance(color: string) {
  const { r, g, b } = hexToRgb(color);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function buildCanvasThemeStyle(themeColor: string): CanvasThemeStyle {
  const canvas = normalizeHexColor(themeColor);
  const isDark = getRelativeLuminance(canvas) < 0.45;

  return {
    "--canvas-theme-canvas": canvas,
    "--canvas-theme-surface": isDark ? "#111827" : "#FFFFFF",
    "--canvas-theme-surface-soft": isDark ? "#1F2937" : "#F5F5F5",
    "--canvas-theme-surface-muted": isDark ? "#273244" : "#F7F8FA",
    "--canvas-theme-surface-panel": isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)",
    "--canvas-theme-border": isDark ? "rgba(255, 255, 255, 0.14)" : "#E5E7EB",
    "--canvas-theme-border-strong": isDark ? "rgba(255, 255, 255, 0.22)" : "#E5E5E5",
    "--canvas-theme-text": isDark ? "#FFFFFF" : "#111827",
    "--canvas-theme-text-soft": isDark ? "#D1D5DB" : "#3F454E",
    "--canvas-theme-text-muted": isDark ? "#9CA3AF" : "#667085",
    "--canvas-theme-icon": isDark ? "#FFFFFF" : "#3D3D3D",
    "--canvas-theme-icon-muted": isDark ? "#CBD5E1" : "#667085",
    "--canvas-theme-hover": isDark ? "rgba(255, 255, 255, 0.10)" : "#F5F5F5",
    "--canvas-theme-active": isDark ? "#FFFFFF" : "#232323",
    "--canvas-theme-active-text": isDark ? "#111827" : "#FFFFFF",
    "--canvas-theme-shadow": isDark ? "rgba(0, 0, 0, 0.34)" : "rgba(0, 0, 0, 0.10)",
  };
}
