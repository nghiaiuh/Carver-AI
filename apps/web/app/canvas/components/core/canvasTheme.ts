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
    "--canvas-theme-surface": isDark ? "#0F172A" : "#FFFFFF",
    "--canvas-theme-surface-soft": isDark ? "#1E293B" : "#F8FAFC",
    "--canvas-theme-surface-muted": isDark ? "#334155" : "#F1F5F9",
    "--canvas-theme-surface-panel": isDark ? "#020617" : "#FFFFFF",
    "--canvas-theme-border": isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(15, 23, 42, 0.06)",
    "--canvas-theme-border-strong": isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.12)",
    "--canvas-theme-text": isDark ? "#F8FAFC" : "#0F172A",
    "--canvas-theme-text-soft": isDark ? "#CBD5E1" : "#334155",
    "--canvas-theme-text-muted": isDark ? "#94A3B8" : "#64748B",
    "--canvas-theme-icon": isDark ? "#F8FAFC" : "#0F172A",
    "--canvas-theme-icon-muted": isDark ? "#94A3B8" : "#64748B",
    "--canvas-theme-hover": isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)",
    "--canvas-theme-active": isDark ? "#FFFFFF" : "#0F172A",
    "--canvas-theme-active-text": isDark ? "#0F172A" : "#FFFFFF",
    "--canvas-theme-shadow": isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(15, 23, 42, 0.06)",
  };
}
