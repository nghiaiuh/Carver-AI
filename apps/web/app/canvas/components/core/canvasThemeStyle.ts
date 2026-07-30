import type { CSSProperties } from "react";

export type CanvasTheme = "light" | "dark" | "green-light" | "green-dark";

export const CANVAS_THEME_STORAGE_KEY = "carver-canvas-theme";
export const DEFAULT_CANVAS_THEME: CanvasTheme = "light";

export const CANVAS_THEME_OPTIONS: ReadonlyArray<{ id: CanvasTheme; label: string; swatch: string }> = [
  { id: "light", label: "Light", swatch: "#ECE9DF" },
  { id: "dark", label: "Dark", swatch: "#2D2C29" },
  { id: "green-light", label: "Green Light", swatch: "#76A66D" },
  { id: "green-dark", label: "Green Dark", swatch: "#4F7A4A" },
];

export type CanvasThemeStyle = CSSProperties & Record<`--canvas-theme-${string}`, string>;

type ThemePalette = Record<string, string>;

const THEME_PALETTES: Record<CanvasTheme, ThemePalette> = {
  light: {
    canvas: "#ECEAE3", surface: "#FFFFFF", "surface-soft": "#F8F7F3", "surface-muted": "#F2F0E9", "surface-panel": "#FFFFFF",
    border: "#DDD9CF", "border-strong": "#B8B0A1", text: "#2D2C29", "text-soft": "#4A4843", "text-muted": "#77736B",
    icon: "#4A4843", "icon-muted": "#77736B", hover: "#F2F0E9", active: "#2D2C29", "active-text": "#FFFFFF", shadow: "rgba(0, 0, 0, 0.06)",
    selection: "#EF6F3C", "selection-hover": "#DC5E2F", "selection-soft": "#FFF0E8", "selection-ring": "rgba(239, 111, 60, 0.18)",
    "handle-bg": "#FFFFFF", "handle-border": "#EF6F3C", "handle-dot": "#EF6F3C", connector: "#8A867E", "connector-hover": "#DC5E2F", "connector-active": "#EF6F3C", guide: "#EF6F3C", "guide-soft": "rgba(239, 111, 60, 0.12)",
    warning: "#B7791F", "warning-soft": "#FFFAEB", danger: "#B42318", "danger-soft": "#FFF0EF", success: "#3F6B51", "success-soft": "#E7F1E5", contour: "#D5D2C7",
  },
  dark: {
    canvas: "#111210", surface: "#20211E", "surface-soft": "#292A26", "surface-muted": "#30312C", "surface-panel": "#20211E",
    border: "#393A35", "border-strong": "#61635B", text: "#F1F0EA", "text-soft": "#D8D5CC", "text-muted": "#B7B4AA",
    icon: "#D8D5CC", "icon-muted": "#B7B4AA", hover: "#30312C", active: "#ECE9DF", "active-text": "#191A17", shadow: "rgba(0, 0, 0, 0.4)",
    selection: "#F09264", "selection-hover": "#FFAE87", "selection-soft": "#3A2820", "selection-ring": "rgba(240, 146, 100, 0.24)",
    "handle-bg": "#252622", "handle-border": "#F09264", "handle-dot": "#F09264", connector: "#8F9289", "connector-hover": "#FFAE87", "connector-active": "#F09264", guide: "#F09264", "guide-soft": "rgba(240, 146, 100, 0.17)",
    warning: "#F2B84B", "warning-soft": "#3A301B", danger: "#F28B82", "danger-soft": "#3B2321", success: "#87C98A", "success-soft": "#1E3320", contour: "#55564F",
  },
  "green-light": {
    canvas: "#E7ECE2", surface: "#FFFFFF", "surface-soft": "#F5F7F2", "surface-muted": "#EEF2EA", "surface-panel": "#FFFFFF",
    border: "#D5DCCF", "border-strong": "#AEBCA5", text: "#293027", "text-soft": "#485246", "text-muted": "#687064",
    icon: "#485246", "icon-muted": "#687064", hover: "#EEF2EA", active: "#4F7A4A", "active-text": "#FFFFFF", shadow: "rgba(32, 55, 30, 0.08)",
    selection: "#4F7A4A", "selection-hover": "#42683E", "selection-soft": "#E0ECDA", "selection-ring": "rgba(79, 122, 74, 0.18)",
    "handle-bg": "#FFFFFF", "handle-border": "#4F7A4A", "handle-dot": "#4F7A4A", connector: "#758572", "connector-hover": "#42683E", "connector-active": "#4F7A4A", guide: "#4F7A4A", "guide-soft": "rgba(79, 122, 74, 0.12)",
    warning: "#A66D18", "warning-soft": "#FFF8E6", danger: "#B4463D", "danger-soft": "#FFF0EF", success: "#3F7541", "success-soft": "#E0ECDA", contour: "#C9D4C2",
  },
  "green-dark": {
    canvas: "#101410", surface: "#1D231D", "surface-soft": "#252C24", "surface-muted": "#2C352B", "surface-panel": "#1D231D",
    border: "#354034", "border-strong": "#5A6C56", text: "#EDF2E9", "text-soft": "#CAD4C6", "text-muted": "#B2BDAE",
    icon: "#CAD4C6", "icon-muted": "#B2BDAE", hover: "#2C352B", active: "#76A66D", "active-text": "#101710", shadow: "rgba(0, 0, 0, 0.42)",
    selection: "#76A66D", "selection-hover": "#9BC991", "selection-soft": "#2B3C29", "selection-ring": "rgba(118, 166, 109, 0.24)",
    "handle-bg": "#222922", "handle-border": "#76A66D", "handle-dot": "#76A66D", connector: "#9CAA97", "connector-hover": "#9BC991", "connector-active": "#76A66D", guide: "#76A66D", "guide-soft": "rgba(118, 166, 109, 0.18)",
    warning: "#F0C15A", "warning-soft": "#3A321D", danger: "#F18C82", "danger-soft": "#3B2422", success: "#94C88C", "success-soft": "#213A20", contour: "#4C5A49",
  },
};

export function isCanvasTheme(value: string | null | undefined): value is CanvasTheme {
  return CANVAS_THEME_OPTIONS.some((theme) => theme.id === value);
}

export function buildCanvasThemeStyle(theme: CanvasTheme): CanvasThemeStyle {
  const palette = THEME_PALETTES[theme];
  return Object.fromEntries(
    Object.entries(palette).map(([token, value]) => [`--canvas-theme-${token}`, value]),
  ) as CanvasThemeStyle;
}
