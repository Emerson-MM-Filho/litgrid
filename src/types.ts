// ---------- public types ----------

export type ShapeTarget = "light" | "cell";

/** A palette: the background and five colors, from dark to lit. */
export interface Palette { bg: string; c0: string; c1: string; c2: string; c3: string; c4: string }

/** A horizontal band with its own palette, from `y` (drawing pixels) down to the next band. */
export interface Band extends Partial<Palette> { y: number }

/** Every setting. The editor's "Copy settings" produces this object as JSON. */
export interface Settings extends Palette {
  /** Custom light SVG, used when `light` is `"custom"`. */
  svgLight: string;
  /** Custom cell SVG, used when `cellShape` is `"custom"`. */
  svgCell: string;
  /** How the light SVG is drawn: a lit cutout, or its own shades. */
  svgMode: "silhouette" | "tones";
  /** Output format name (the editor's sizes). Ignored when a size is given. */
  format: string;
  text: string;
  textSize: number; textX: number; textY: number;
  /** Text volume: darkens toward the bottom. */
  volume: number;
  /** Light shape: a built-in name (`sparkle`, `sphere`, `ring`, `square`, `diamond`, `hourglass`), `"custom"` or `"none"`. */
  light: string;
  shapeX: number; shapeY: number;
  /** Light radius as a fraction of the drawing's short side. */
  shapeSize: number;
  /** Turns per second. */
  spin: number;
  followMouse: boolean;
  /** Follow delay, 0 (none) to 0.97. */
  smoothing: number;
  trail: boolean; trailDur: number; trailStrength: number; trailTaper: number; trailSpacing: number;
  deform: boolean; deformAmount: number; deformMax: number;
  /** Stretch of the light's middle, keeping its corners, as a fraction of the short side. */
  stretchX: number; stretchY: number;
  burstSize: number; burstGlow: number; burstSecs: number;
  ambient: number;
  /** Text and shape drawn on top of media. */
  overlay: boolean;
  /** Mirror the webcam (editor). */
  mirror: boolean;
  stepX: number; stepY: number; gapX: number; gapY: number;
  /** Cell shape: a built-in name (`square`, `circle`, `diamond`, `cross`, `line`) or `"custom"`. */
  cellShape: string;
  mode: "fixed" | "variable" | "solid";
  offBelow: number; hollowAbove: number; outline: number; dot: number; core: number;
  colorSource: "palette" | "media";
  contrast: number;
  bloom: number; bloomWide: number; scanlines: number;
  animate: boolean; fps: number; fpsUnlimited: boolean;
  pulse: number; drift: number; flicker: number; flickerEvery: number;
}

/** What the grid lights up from: an image or video URL, or an element to read from. */
export type MediaInput = string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

export interface LitgridOptions {
  /** The JSON from the editor's "Copy settings", whole or in part, over the defaults. */
  settings?: Partial<Settings>;
  /** An image or video URL (another origin needs CORS), or an `<img>`, `<video>` or `<canvas>`. */
  media?: MediaInput | null;
  /** `[width, height]` of the drawing in pixels. By default, the canvas' displayed size times the pixel ratio. */
  size?: [number, number] | null;
  /** Where the light listens to the pointer: the canvas by default; `window` for a canvas behind the page. */
  pointer?: EventTarget;
}

export interface Litgrid {
  /** Resolves after the first frame with the media and the SVGs loaded. */
  readonly ready: Promise<Litgrid>;
  /** Changes settings, whole or in part. */
  update(settings: Partial<Settings>): void;
  /** Palette bands, top to bottom, `y` in drawing pixels. */
  bands(list: Band[] | null): void;
  /** New drawing size in pixels. */
  resize(size: [number, number]): void;
  /** Draws again on the next frame (after changing a `<canvas>` used as media, with animate off). */
  redraw(): void;
  /** Swells and brightens the light once. */
  burst(): void;
  /** `true` swells the light and holds it; `false` lets it settle. */
  press(down: boolean): void;
  /** The current frame as a data URL. */
  snapshot(type?: string, quality?: number): string;
  /** Stops the frame loop and removes every listener the instance added. */
  destroy(): void;
}
