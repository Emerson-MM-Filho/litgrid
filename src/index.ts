// ---------- public entry ----------
// Importing this module touches no browser global; everything happens inside createLitgrid.
import { createEngine } from "./engine";
import type { Litgrid, LitgridOptions } from "./types";

export { DEFAULTS, PRESETS, FORMATS, LIGHT_SHAPES, CELL_SHAPES } from "./config";
export type { Band, Litgrid, LitgridOptions, MediaInput, Palette, Settings, ShapeTarget } from "./types";

/**
 * Starts litgrid on a canvas. Each call is an independent instance; `destroy()` releases it.
 *
 * ```js
 * const lg = createLitgrid(canvas, { settings: { followMouse: true } });
 * ```
 */
export function createLitgrid(canvas: HTMLCanvasElement, options: LitgridOptions = {}): Litgrid {
  const e = createEngine(canvas, options);
  const lg: Litgrid = {
    ready: e.ready.then(() => lg),
    update: e.update,
    bands: e.bands,
    resize: e.resize,
    redraw: e.redraw,
    burst: e.burst,
    press: e.press,
    snapshot: e.snapshot,
    destroy: e.destroy,
  };
  return lg;
}
