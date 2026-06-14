export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type HsvColor = {
  h: number;
  s: number;
  v: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeHexColor(color: string, fallback = "#000000") {
  const trimmed = color.trim().toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  const compact = trimmed.replace(/[^0-9A-F]/g, "");
  if (compact.length === 6) {
    return `#${compact}`;
  }

  return fallback.toUpperCase();
}

export function hexToRgb(color: string): RgbColor {
  const normalized = normalizeHexColor(color).slice(1);

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor) {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  return {
    h: ((hue * 60) + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const chroma = value * saturation;
  const huePrime = hue / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = secondary;
  } else if (huePrime < 2) {
    red = secondary;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondary;
  } else if (huePrime < 4) {
    green = secondary;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

export function hsvToHex(color: HsvColor) {
  return rgbToHex(hsvToRgb(color));
}

export function hueToHex(hue: number) {
  return hsvToHex({ h: hue, s: 1, v: 1 });
}

export function formatRgbLabel(color: string) {
  const { r, g, b } = hexToRgb(color);
  return `RGB ${r}, ${g}, ${b}`;
}
