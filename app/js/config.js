// ---------- config: presets, formats, shapes, the settings schema and the saved settings ----------
const PRESETS = {
  "Terracotta on night": { bg: "#090b1c", c0: "#161a3a", c1: "#78280e", c2: "#c2410c", c3: "#f08034", c4: "#ffe4c4", bloom: 0.9, bloomWide: 0.35 },
  "Terracotta on black": { bg: "#060505", c0: "#1d1713", c1: "#6a240a", c2: "#c2410c", c3: "#f08034", c4: "#ffe4c4", bloom: 0.9, bloomWide: 0.35 },
  "Violet dusk": { bg: "#05060c", c0: "#1b2350", c1: "#5b2f6e", c2: "#e0502a", c3: "#ff9a5a", c4: "#fff1d6", bloom: 1.1, bloomWide: 0.5 },
  // on light backgrounds the logic turns into ink: the more light in the scene, the more saturated the terracotta on paper
  "Light": { bg: "#ffffff", c0: "#e8e3de", c1: "#f2c6af", c2: "#e07a4a", c3: "#c2410c", c4: "#a3350a", bloom: 0.35, bloomWide: 0.15 },
  "Ink on paper": { bg: "#f3eee6", c0: "#dcd4c9", c1: "#e8b597", c2: "#d4602c", c3: "#b83c0b", c4: "#8c2d08", bloom: 0.25, bloomWide: 0.1 },
};
// each format brings its own layout: side by side on 16:9, stacked on 1:1 and 9:16.
// Sizes are measured against the short side, so they read the same in every format.
const FORMATS = {
  "16:9 1920×1080": { size: [1920, 1080], layout: { textSize: 0.16, textX: 0.36, textY: 0.52, shapeX: 0.75, shapeY: 0.5, shapeSize: 0.15 } },
  "9:16 1080×1920": { size: [1080, 1920], layout: { textSize: 0.14, textX: 0.5, textY: 0.66, shapeX: 0.5, shapeY: 0.45, shapeSize: 0.25 } },
  "1:1 1080×1080": { size: [1080, 1080], layout: { textSize: 0.13, textX: 0.5, textY: 0.74, shapeX: 0.5, shapeY: 0.4, shapeSize: 0.2 } },
};

// every shape is an SVG. Light shapes carry the mode they start in: "tones" uses the SVG's own shades
// (sphere and ring are gradients), "silhouette" lights up the cutout. Cell shapes stretch to fill the cell.
const G = (stops) => `<defs><radialGradient id="g">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient></defs>`;
const SV = (vb, body, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>`;
const LIGHT_SHAPES = {
  sparkle: { name: "Sparkle", mode: "silhouette", svg: SV("21 46 132 132", '<path stroke="#000" stroke-width="3" stroke-linejoin="round" d="M87 48Q98 101 151 112 98 123 87 176 76 123 23 112 76 101 87 48Z"/>') },
  sphere: { name: "Sphere", mode: "tones", svg: SV("0 0 100 100", G([[0, "#fff"], [0.3, "#c8c8c8"], [0.7, "#4a4a4a"], [1, "#000", 0]]) + '<circle cx="50" cy="50" r="50" fill="url(#g)"/>') },
  ring: { name: "Ring", mode: "tones", svg: SV("0 0 100 100", G([[0, "#000", 0], [0.5, "#000", 0], [0.72, "#fff"], [0.86, "#555"], [1, "#000", 0]]) + '<circle cx="50" cy="50" r="50" fill="url(#g)"/>') },
  square: { name: "Square", mode: "silhouette", svg: SV("0 0 100 100", '<rect x="14" y="14" width="72" height="72"/>') },
  diamond: { name: "Diamond", mode: "silhouette", svg: SV("0 0 100 100", '<path d="M50 2.5 88 50 50 97.5 12 50Z"/>') },
  hourglass: { name: "Hourglass", mode: "silhouette", svg: SV("0 0 100 100", '<path d="M20 2.5H80L53.5 50 80 97.5H20L46.5 50Z"/>') },
};
const STRETCH = ' preserveAspectRatio="none"';
const CELL_SHAPES = {
  square: { name: "Square", svg: SV("0 0 100 100", '<rect width="100" height="100"/>', STRETCH) },
  circle: { name: "Circle", svg: SV("0 0 100 100", '<circle cx="50" cy="50" r="50"/>', STRETCH) },
  diamond: { name: "Diamond", svg: SV("0 0 100 100", '<path d="M50 0 100 50 50 100 0 50Z"/>', STRETCH) },
  cross: { name: "Cross", svg: SV("0 0 99 99", '<path d="M33 0H66V33H99V66H66V99H33V66H0V33H33Z"/>', STRETCH) },
  line: { name: "Horizontal line", svg: SV("0 0 99 99", '<rect y="33" width="99" height="33"/>', STRETCH) },
};
const names = (lib, extra) => Object.assign(Object.fromEntries(Object.entries(lib).map(([k, v]) => [k, v.name])), extra);

const DEFAULTS = {
  svgLight: "", svgCell: "", svgMode: "silhouette",
  format: "16:9 1920×1080", text: "Litgrid", ...FORMATS["16:9 1920×1080"].layout, volume: 0.45,
  light: "sparkle", spin: 0, followMouse: false, smoothing: 0.85,
  trail: true, trailDur: 1.6, trailStrength: 0.8, trailTaper: 0.5, trailSpacing: 0.25,
  deform: true, deformAmount: 0.25, deformMax: 2.2, ambient: 0.04, overlay: true, mirror: true,
  stepX: 12, stepY: 12, gapX: 2, gapY: 4,
  cellShape: "square", mode: "fixed", offBelow: 0.18, hollowAbove: 0.62, outline: 2, dot: 3, core: 0.55,
  colorSource: "palette", contrast: 1, ...PRESETS["Terracotta on night"], scanlines: 0,
  animate: true, fps: 24, fpsUnlimited: true, pulse: 0.06, drift: 0, flicker: 0.05, flickerEvery: 3,
};

const SCHEMA = [
  ["Scene", [
    ["format", "select", "Format", Object.keys(FORMATS)],
    ["text", "text", "Text"],
    ["textSize", "range", "Text size", 0.05, 0.9, 0.01],
    ["textX", "range", "Text: horizontal", 0, 1, 0.01],
    ["textY", "range", "Text: vertical", 0, 1, 0.01],
    ["volume", "range", "Text volume (darkens toward the bottom)", 0, 1, 0.01],
    ["ambient", "range", "Ambient light", 0, 0.4, 0.01],
    ["overlay", "check", "Text and shape on top of media"],
    ["mirror", "check", "Mirror the webcam"],
  ]],
  ["Shape", [
    ["light", "select", "Shape", [...Object.keys(LIGHT_SHAPES), "custom", "none"], names(LIGHT_SHAPES, { custom: "My SVG", none: "None (text only)" })],
    ["svgPanel", "light"],
    ["svgMode", "select", "The SVG becomes", ["silhouette", "tones"], { silhouette: "Lit silhouette (ignores the SVG colors)", tones: "The SVG's own tones (light lights up, dark stays off)" }],
    ["followMouse", "check", "Follow the mouse (or finger)"],
    ["smoothing", "range", "Follow delay", 0, 0.97, 0.01],
    ["trail", "check", "Trail while following (fading tail)"],
    ["trailDur", "range", "Trail: duration (s)", 0.1, 3, 0.05],
    ["trailStrength", "range", "Trail: strength", 0, 1, 0.01],
    ["trailTaper", "range", "Trail: taper at the tip", 0, 1, 0.01],
    ["trailSpacing", "range", "Trail: spacing between shapes (2 = touching)", 0.1, 5, 0.05],
    ["deform", "check", "Deform with the force of movement"],
    ["deformAmount", "range", "Deform: sensitivity", 0, 3, 0.01],
    ["deformMax", "range", "Deform: max stretch", 1, 4, 0.05],
    ["shapeX", "range", "Horizontal", 0, 1, 0.01],
    ["shapeY", "range", "Vertical", 0, 1, 0.01],
    ["shapeSize", "range", "Size", 0.1, 3, 0.01],
    ["spin", "range", "Spin (turns per second)", -1, 1, 0.01],
  ]],
  ["Cell", [
    ["cellShape", "select", "Cell shape", [...Object.keys(CELL_SHAPES), "custom"], names(CELL_SHAPES, { custom: "My SVG" })],
    ["svgPanel", "cell"],
    ["stepX", "range", "Width (px)", 4, 48, 1],
    ["stepY", "range", "Height (px)", 4, 48, 1],
    ["gapX", "range", "Gap between columns (px)", 0, 16, 1],
    ["gapY", "range", "Gap between rows (px)", 0, 16, 1],
    ["mode", "select", "How brightness becomes a cell", ["fixed", "variable", "solid"], { fixed: "Fixed: off, solid, hollow", variable: "Size follows brightness", solid: "Always solid" }],
    ["offBelow", "range", "Below this, dim dot", 0, 1, 0.01],
    ["hollowAbove", "range", "Above this, hollow", 0, 1.01, 0.01],
    ["outline", "range", "Outline width (px)", 1, 8, 1],
    ["dot", "range", "Dim dot size (px)", 0, 12, 1],
    ["core", "range", "Hollow core brightness", 0, 1, 0.01],
  ]],
  ["Color", [
    ["presets"],
    ["colorSource", "select", "Color source", ["palette", "media"], { palette: "Palette below (by brightness)", media: "Original media color" }],
    ["swatches"],
    ["contrast", "range", "Contrast (brightness curve)", 0.3, 3, 0.01],
  ]],
  ["Glow", [
    ["bloom", "range", "Near glow", 0, 2.5, 0.01],
    ["bloomWide", "range", "Wide glow", 0, 2.5, 0.01],
    ["scanlines", "range", "Scanlines", 0, 0.8, 0.01],
  ]],
  ["Motion", [
    ["animate", "check", "Animate"],
    ["fps", "range", "Frames per second", 4, 60, 1],
    ["fpsUnlimited", "check", "Unlimited fps (as fast as the screen refreshes)"],
    ["pulse", "range", "Shape pulse", 0, 0.4, 0.01],
    ["drift", "range", "Shape drift", 0, 0.4, 0.01],
    ["flicker", "range", "Cell flicker", 0, 0.5, 0.01],
    ["flickerEvery", "range", "Flicker changes every (frames)", 1, 30, 1],
  ]],
];
const SWATCHES = [["bg", "bg"], ["c0", "dark"], ["c1", "low"], ["c2", "mid"], ["c3", "high"], ["c4", "lit"]];

const KEY = "litgrid-v2";
let S = { ...DEFAULTS };
try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) S = { ...DEFAULTS, ...saved }; } catch {}
if (!FORMATS[S.format]) S.format = DEFAULTS.format;   // saved format no longer in the list
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

if (matchMedia("(prefers-reduced-motion: reduce)").matches) S.animate = false;
