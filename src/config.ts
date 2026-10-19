// ---------- config: presets, formats, the built-in shapes and the default settings ----------
// Pure data: nothing here touches the browser, so importing the package on a server is safe.
import type { Palette, Settings, ShapeTarget } from "./types";

export const PRESETS: Record<string, Palette & { bloom: number; bloomWide: number }> = {
  "Terracotta on night": { bg: "#090b1c", c0: "#161a3a", c1: "#78280e", c2: "#c2410c", c3: "#f08034", c4: "#ffe4c4", bloom: 0.9, bloomWide: 0.35 },
  "Terracotta on black": { bg: "#060505", c0: "#1d1713", c1: "#6a240a", c2: "#c2410c", c3: "#f08034", c4: "#ffe4c4", bloom: 0.9, bloomWide: 0.35 },
  "Violet dusk": { bg: "#05060c", c0: "#1b2350", c1: "#5b2f6e", c2: "#e0502a", c3: "#ff9a5a", c4: "#fff1d6", bloom: 1.1, bloomWide: 0.5 },
  // on light backgrounds the logic turns into ink: the more light in the scene, the more saturated the terracotta on paper
  "Light": { bg: "#ffffff", c0: "#e8e3de", c1: "#f2c6af", c2: "#e07a4a", c3: "#c2410c", c4: "#a3350a", bloom: 0.35, bloomWide: 0.15 },
  "Ink on paper": { bg: "#f3eee6", c0: "#dcd4c9", c1: "#e8b597", c2: "#d4602c", c3: "#b83c0b", c4: "#8c2d08", bloom: 0.25, bloomWide: 0.1 },
};

export interface Layout { textSize: number; textX: number; textY: number; shapeX: number; shapeY: number; shapeSize: number }
// each format brings its own layout: side by side on 16:9, stacked on 1:1 and 9:16.
// Sizes are measured against the short side, so they read the same in every format.
export const FORMATS: Record<string, { size: [number, number]; layout: Layout }> = {
  "16:9 1920×1080": { size: [1920, 1080], layout: { textSize: 0.16, textX: 0.36, textY: 0.52, shapeX: 0.75, shapeY: 0.5, shapeSize: 0.15 } },
  "9:16 1080×1920": { size: [1080, 1920], layout: { textSize: 0.14, textX: 0.5, textY: 0.66, shapeX: 0.5, shapeY: 0.45, shapeSize: 0.25 } },
  "1:1 1080×1080": { size: [1080, 1080], layout: { textSize: 0.13, textX: 0.5, textY: 0.74, shapeX: 0.5, shapeY: 0.4, shapeSize: 0.2 } },
};

export interface ShapeDef { name: string; svg: string; mode?: "silhouette" | "tones" }
// every shape is an SVG. Light shapes carry the mode they start in: "tones" uses the SVG's own shades
// (sphere and ring are gradients), "silhouette" lights up the cutout. Cell shapes stretch to fill the cell.
const G = (stops: [number, string, number?][]) => `<defs><radialGradient id="g">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient></defs>`;
const SV = (vb: string, body: string, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>`;
export const LIGHT_SHAPES: Record<string, ShapeDef> = {
  sparkle: { name: "Sparkle", mode: "silhouette", svg: SV("21 46 132 132", '<path stroke="#000" stroke-width="3" stroke-linejoin="round" d="M87 48Q98 101 151 112 98 123 87 176 76 123 23 112 76 101 87 48Z"/>') },
  sphere: { name: "Sphere", mode: "tones", svg: SV("0 0 100 100", G([[0, "#fff"], [0.3, "#c8c8c8"], [0.7, "#4a4a4a"], [1, "#000", 0]]) + '<circle cx="50" cy="50" r="50" fill="url(#g)"/>') },
  ring: { name: "Ring", mode: "tones", svg: SV("0 0 100 100", G([[0, "#000", 0], [0.5, "#000", 0], [0.72, "#fff"], [0.86, "#555"], [1, "#000", 0]]) + '<circle cx="50" cy="50" r="50" fill="url(#g)"/>') },
  square: { name: "Square", mode: "silhouette", svg: SV("0 0 100 100", '<rect x="14" y="14" width="72" height="72"/>') },
  diamond: { name: "Diamond", mode: "silhouette", svg: SV("0 0 100 100", '<path d="M50 2.5 88 50 50 97.5 12 50Z"/>') },
  hourglass: { name: "Hourglass", mode: "silhouette", svg: SV("0 0 100 100", '<path d="M20 2.5H80L53.5 50 80 97.5H20L46.5 50Z"/>') },
};
const STRETCH = ' preserveAspectRatio="none"';
export const CELL_SHAPES: Record<string, ShapeDef> = {
  square: { name: "Square", svg: SV("0 0 100 100", '<rect width="100" height="100"/>', STRETCH) },
  circle: { name: "Circle", svg: SV("0 0 100 100", '<circle cx="50" cy="50" r="50"/>', STRETCH) },
  diamond: { name: "Diamond", svg: SV("0 0 100 100", '<path d="M50 0 100 50 50 100 0 50Z"/>', STRETCH) },
  cross: { name: "Cross", svg: SV("0 0 99 99", '<path d="M33 0H66V33H99V66H66V99H33V66H0V33H33Z"/>', STRETCH) },
  line: { name: "Horizontal line", svg: SV("0 0 99 99", '<rect y="33" width="99" height="33"/>', STRETCH) },
};

export const DEFAULTS: Settings = {
  svgLight: "", svgCell: "", svgMode: "silhouette",
  format: "16:9 1920×1080", text: "Litgrid", ...FORMATS["16:9 1920×1080"].layout, volume: 0.45,
  light: "sparkle", spin: 0, followMouse: false, smoothing: 0.85,
  trail: true, trailDur: 1.6, trailStrength: 0.8, trailTaper: 0.5, trailSpacing: 0.25,
  deform: true, deformAmount: 0.25, deformMax: 2.2, stretchX: 0, stretchY: 0, burstSize: 0.6, burstGlow: 0.6, burstSecs: 0.4, ambient: 0.04, overlay: true, mirror: true,
  stepX: 12, stepY: 12, gapX: 2, gapY: 4,
  cellShape: "square", mode: "fixed", offBelow: 0.18, hollowAbove: 0.62, outline: 2, dot: 3, core: 0.55,
  colorSource: "palette", contrast: 1, ...PRESETS["Terracotta on night"], scanlines: 0,
  animate: true, fps: 24, fpsUnlimited: true, pulse: 0.06, drift: 0, flicker: 0.05, flickerEvery: 3,
  magnets: null, magnetMode: "wrap", magnetReach: 40, magnetBorder: 56, magnetTime: 0.35, anchor: null, svgMagnet: "",
};

export const SVG_KEY = { light: "svgLight", cell: "svgCell" } as const;
export const SEL_KEY = { light: "light", cell: "cellShape" } as const;
const LIB = { light: LIGHT_SHAPES, cell: CELL_SHAPES };
/** The SVG behind a shape setting, built-in or custom. */
export function svgText(s: Settings, target: ShapeTarget): string {
  const sel = s[SEL_KEY[target]];
  return sel === "custom" ? s[SVG_KEY[target]] : (LIB[target][sel] || Object.values(LIB[target])[0]).svg;
}
