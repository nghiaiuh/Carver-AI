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
    canvas: "#F6F4EF",
    surface: "#FFFFFF", "surface-soft": "#FBFAF7", "surface-muted": "#F1EEE8", "surface-panel": "#FEFDFC",
    border: "#E2DED5", "border-strong": "#BDB6AA",
    text: "#292824", "text-soft": "#504D46", "text-muted": "#7C776E",
    icon: "#4B4841", "icon-muted": "#817B71",
    hover: "#F3F0EA",
    active: "#2D2C28", "active-text": "#FFFFFF",
    shadow: "rgba(29, 27, 22, 0.07)",
    selection: "#E97840", "selection-hover": "#D86631", "selection-soft": "#FFF0E7", "selection-ring": "rgba(233, 120, 64, 0.18)", "handle-bg": "#FFFFFF", "handle-border": "#E97840", "handle-dot": "#E97840",
    connector: "#8E8980", "connector-hover": "#D86631", "connector-active": "#E97840",
    guide: "#E97840", "guide-soft": "rgba(233, 120, 64, 0.12)",
    warning: "#AD741D", "warning-soft": "#FFF7E5",
    danger: "#B64135", "danger-soft": "#FFF0ED",
    success: "#477157", "success-soft": "#E8F2E8",
    contour: "#DDD9D0",
  },

  dark: {
    canvas: "#151714",
    surface: "#20231F", "surface-soft": "#272B26", "surface-muted": "#2E332D", "surface-panel": "#1D201C",
    border: "#3B4039", "border-strong": "#62695F",
    text: "#F2F1EC", "text-soft": "#D9D8D0", "text-muted": "#A8AAA0",
    icon: "#D8D9D1", "icon-muted": "#9DA097",
    hover: "#2C302B",
    active: "#F0EEE6", "active-text": "#171915",
    shadow: "rgba(0, 0, 0, 0.38)",
    selection: "#F08A57", "selection-hover": "#FFAA7A", "selection-soft": "#3A271E", "selection-ring": "rgba(240, 138, 87, 0.24)", "handle-bg": "#252824", "handle-border": "#F08A57", "handle-dot": "#F08A57",
    connector: "#93978E", "connector-hover": "#FFAA7A", "connector-active": "#F08A57",
    guide: "#F08A57", "guide-soft": "rgba(240, 138, 87, 0.17)",
    warning: "#E9B64C", "warning-soft": "#393019",
    danger: "#EE8D83", "danger-soft": "#3A2320",
    success: "#88C58B", "success-soft": "#203521",
    contour: "#4A5048",
  },

  "green-light": {
    canvas: "#F2F5EF",
    surface: "#FFFFFF", "surface-soft": "#F9FBF7", "surface-muted": "#EDF2EA", "surface-panel": "#FEFFFD",
    border: "#D8E0D4", "border-strong": "#AEBDA8",
    text: "#293128", "text-soft": "#4B5749", "text-muted": "#727D6F",
    icon: "#4A5748", "icon-muted": "#778374",
    hover: "#EEF3EB",
    active: "#587F53", "active-text": "#FFFFFF",
    shadow: "rgba(43, 67, 40, 0.08)",
    selection: "#5C8556", "selection-hover": "#4B7146", "selection-soft": "#E2EDDE", "selection-ring": "rgba(92, 133, 86, 0.19)", "handle-bg": "#FFFFFF", "handle-border": "#5C8556", "handle-dot": "#5C8556",
    connector: "#7C8978", "connector-hover": "#4B7146", "connector-active": "#5C8556",
    guide: "#5C8556", "guide-soft": "rgba(92, 133, 86, 0.13)",
    warning: "#A9701D", "warning-soft": "#FFF8E7",
    danger: "#B54A40", "danger-soft": "#FFF0ED",
    success: "#477A4B", "success-soft": "#E2EFDF",
    contour: "#D4DDD0",
  },

  "green-dark": {
    canvas: "#151A15",
    surface: "#1E251E", "surface-soft": "#252E25", "surface-muted": "#2C372C", "surface-panel": "#1B211B",
    border: "#374536", "border-strong": "#5B6D58",
    text: "#EEF3EB", "text-soft": "#D1DCCF", "text-muted": "#A6B2A3",
    icon: "#CDD8CB", "icon-muted": "#9EAA9B",
    hover: "#2D382D",
    active: "#83B279", "active-text": "#111811",
    shadow: "rgba(0, 0, 0, 0.4)",
    selection: "#83B279", "selection-hover": "#A0CE95", "selection-soft": "#2B3D2A", "selection-ring": "rgba(131, 178, 121, 0.25)", "handle-bg": "#222A22", "handle-border": "#83B279", "handle-dot": "#83B279",
    connector: "#9AA997", "connector-hover": "#A0CE95", "connector-active": "#83B279",
    guide: "#83B279", "guide-soft": "rgba(131, 178, 121, 0.18)",
    warning: "#EBC15D", "warning-soft": "#39321D",
    danger: "#EE9187", "danger-soft": "#3A2522",
    success: "#96CA8D", "success-soft": "#223A21",
    contour: "#4A5948",
  }
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
