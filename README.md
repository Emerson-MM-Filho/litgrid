# Litgrid

A grid of cells that lights up with the light in the scene: dark becomes a dim
dot, mid becomes a solid cell, and bright becomes a hollow, lit cell, with glow
and scanlines on top. It's the CRT/LED panel look, rebuilt in the browser with
the 2D canvas.

## Running it

The editor is live at https://ampulla-tech.github.io/litgrid/ (the webcam works there).

The repository is the `@ampulla/litgrid` package plus the editor that uses it:

```sh
npm install
npm run dev        # the editor, with the library from source
npm run build      # the package: dist/litgrid.js (ESM), dist/litgrid.iife.js and the types
npm run build:app  # the editor, into dist-app/
npm run typecheck
npm test           # the browser fixtures (build both first)
```

## Files

- `src/`: the library, in TypeScript.
  - `index.ts`: the public entry, `createLitgrid`.
  - `engine.ts`: the canvas pipeline (scene, grid, light, trail, deformation), the frame
    loop and the pointer, all inside one instance.
  - `config.ts`: presets, formats, the built-in SVG shapes and the default settings.
  - `types.ts`: the public types.
- `app/`: the editor, a Vite app. `src/main.js` holds the buttons, media and webcam,
  `src/panel.js` builds the controls from `src/schema.js`, `src/export.js` does PNG, video
  and the GIF encoder, and `src/webmcp.js` the tools for AI agents. `embed.html` shows the
  renderer on a page of its own, without the editor.
- `fixtures/` and `tests/`: pages that load the built package, and the Playwright suite
  that drives them and the built editor.

`.github/workflows/ci.yml` typechecks, builds and runs the fixtures on every push and pull
request. `.github/workflows/pages.yml` builds the editor and publishes it to GitHub Pages on
every push to `main`.

## What you can change

- **Scene:** output format (16:9, 9:16 or 1:1), text, ambient light.
- **Shape:** the light shape is always an SVG. There are built-in ones (Sparkle,
  Sphere, Ring, Square, Diamond, Hourglass) and any SVG of your own, pasted or
  loaded from a file. It can follow the mouse, leave a fading trail and stretch
  with the speed of movement.
- **Cell:** each cell is drawn from an SVG too (square, circle, diamond, cross,
  line or your own), plus the grid size, the gaps and the thresholds between dim,
  solid and hollow.
- **Color:** dark and light presets, or a hand-picked palette. It can also take
  the colors from the input media.
- **Glow and Motion:** bloom, scanlines, pulse, drift and flicker.

An image, a video or the webcam can replace the scene as input. "Copy settings"
copies every setting as JSON.

**Export** saves the stage as a PNG of the current frame, a video (MP4 where the
browser can record it, WebM otherwise) or a looping GIF. Video and GIF are
recorded in real time, for the length you pick; the GIF is scaled down to the
width you pick.

Settings are kept in the browser. "Reset" goes back to the defaults.

## Using the package

Each canvas gets its own instance; importing the package never touches the browser.

```js
import { createLitgrid } from "@ampulla/litgrid";

const lg = createLitgrid(document.getElementById("lit"), {
  settings: { text: "", followMouse: true, bg: "#0c0a09", c4: "#ffffff" },
  media: "scene.png",
});
// later
lg.destroy();
```

Without a bundler, the IIFE build exposes `window.Litgrid`:

```html
<canvas id="lit"></canvas>
<script src="dist/litgrid.iife.js"></script>
<script>
  const lg = Litgrid.createLitgrid(document.getElementById("lit"), { settings: { followMouse: true } });
</script>
```

- `settings` takes the JSON from "Copy settings", whole or in part, over the defaults.
  Every color is a setting, so the theme is whatever you pass. Nothing is read from or
  saved to the browser.
- `media` is an image or video URL (another origin needs CORS), or an `<img>`, `<video>`
  or `<canvas>`. A `<canvas>` can change size later, as when the page redraws it to fit:
  its size is read on every frame.
- `size` is the drawing size in pixels; by default it is the canvas' displayed size
  times the pixel ratio.

Behind a page's content, the canvas can stay fixed and full screen: pass `pointer: window`
so the light follows the mouse over the whole page, a `<canvas>` you draw the scene on as
`media` (call `lg.redraw()` after drawing it when animate is off), and `lg.bands([{ y, bg,
c0, … }])` so each horizontal band of the screen, from `y` down, gets its own palette, for
sections with different backgrounds. `lg.resize([w, h])` follows the window.

`lg.burst()` swells and brightens the shape once, for a click on a button: `burstSize`,
`burstGlow` and `burstSecs` set how much it grows, how much brighter it gets and for how
long. `lg.press(true)` swells it the same way and holds it there, for as long as a mouse
button stays down; `lg.press(false)` lets it settle from wherever it was (in the editor,
holding the stage plays it). `stretchX` and `stretchY` stretch the
shape without stretching its corners, so a round light becomes a rounded bar with the same
falloff. The trail, the deformation and the burst follow the stretched shape.

On a phone the page keeps scrolling: a vertical swipe scrolls, and a tap or a sideways
drag moves the light. With `followMouse` on, the light waits at `shapeX`/`shapeY` (without
drifting) until the pointer first comes, and when the pointer leaves the window it rests
where the pointer left.
Nothing is drawn while the canvas is off screen, and with reduced motion the canvas
shows a still frame. `lg.ready` resolves after the first full frame, `lg.update()`
changes settings, `lg.snapshot()` returns the frame as a data URL, and `lg.destroy()`
stops the frame loop and removes every listener the instance added.

### Magnets and the anchor

```js
const lg = createLitgrid(canvas, {
  pointer: window,
  magnets: "a[href], button",   // a selector or a list of elements; off by default
  anchor: "#cta",               // where the light is born
  magnetMode: "wrap",           // "wrap" (a rounded bar around the element) or "pull" (the centre only)
  magnetReach: 40,              // px from the element's edge
  magnetBorder: 56,             // px added around the element in wrap mode
  magnetTime: 0.35,             // seconds for the spring
});
lg.on("magnet", (el) => el?.animate([{ scale: 1 }, { scale: 1.04 }], 200));
```

The six options can also go inside `settings`, change through `update()`, and are part of
the editor's "Copy settings".

- The nearest magnet whose edge is within `magnetReach` px of the pointer catches the light.
  It stays caught until the pointer is more than `magnetReach × 1.25 + 6` px away, or a
  nearer magnet within reach wins, so the light does not flicker on the boundary. Elements
  inside `[inert]` or `[hidden]`, or with no size, are ignored, and a magnet that is
  removed, hidden or scrolled off screen lets go.
- The light travels on a critically damped spring (`ω = 6 / magnetTime`, integrated in
  short sub-steps), so it sets off gently and arrives without overshooting.
- In wrap mode the light's radius becomes half of the element's shorter side plus the
  border, and the stretch takes the rest of each side, so it frames the element. A non-round
  light shape is drawn as the round one while it wraps (`svgMagnet` can replace that round
  shape), and on release the stretch is zeroed in the same frame and the configured shape
  comes back, so a sparkle never shows as a cross. Pull mode only moves the centre.
- The `:focus-visible` element inside a magnet holds the light, so the keyboard drives it
  too. A real mouse move takes control back; scrolling under a still mouse does not.
- Until the pointer first moves, the anchor holds the light like a magnet while it is on
  screen; off screen, the light waits at its position.
- Element positions go through the canvas' rectangle on screen, so the light lands on the
  element on a canvas larger than the viewport, offset by scrolling or drawn at another
  resolution. Pass `pointer: window` when the magnets are outside the canvas.
- `lg.on("magnet", fn)` calls `fn` with the element (or `null`) whenever the element
  holding the light changes, the anchor included, and returns a function that stops
  listening. The library never styles or transforms your elements.

The states are drawn in [docs/flows/light-states.md](docs/flows/light-states.md).

### Reading and driving the light

`lg.light.get()` returns `{ state, x, y, element, size, stretchX, stretchY }`: where the light is, in client (viewport)
pixels, mapped through the canvas' rectangle on screen, so a canvas larger than the
viewport or offset by scrolling reports where the light really is; `size`, `stretchX` and
`stretchY` are what it is drawn with now, in the units of the settings. `state` is one of:

- `"waiting"`: following is on and the pointer has not been on the page yet.
- `"anchored"`: the anchor holds it, before the pointer first moves.
- `"following"`: it follows the pointer.
- `"held"`: a magnet holds it; `element` says which.
- `"resting"`: the pointer left the window and the light stays where it left (or following
  is off and the light sits at `shapeX`/`shapeY`, with its drift).
- `"manual"`: the page drives it.
- `"still"`: reduced motion, or animation off.

`lg.light.set({ x, y, stretchX, stretchY, size })` takes control: `x` and `y` in client
pixels, `stretchX`, `stretchY` and `size` in the units of the `stretchX`, `stretchY` and
`shapeSize` settings, and any of them can be left out. The light stops following and goes
where it is told, magnets included, until `lg.light.release()`, which hands control back from where the light
is, with no jump. `lg.pointer` is a read-only `{ x, y, on }`: where the instance thinks the
pointer is, in client pixels, and whether it is on the page.

**Porting from `Litgrid.mount`:** call `createLitgrid(canvas, options)` (or
`Litgrid.createLitgrid` from the IIFE) with the same options, and `destroy()` instead of
`stop()`. Several canvases on one page now work.

## For AI agents (WebMCP)

The page registers [WebMCP](https://github.com/webmachinelearning/webmcp) tools,
so an AI agent running in the browser can set it up for you:

- `get_settings`: every current setting, the color presets and the output size.
- `set_settings`: change any setting from the panel; returns what was applied
  and what was ignored, and why.
- `apply_color_preset`: one of the named palettes.
- `set_custom_svg`: your own SVG as the light shape or the cell shape.
- `export_media`: save a PNG, a video or a GIF; it can also hand a PNG or GIF
  back to the agent, so it can look at the result.
- `reset_settings`: back to the defaults.

In browsers without WebMCP nothing changes. To try it in Chrome, turn on
`chrome://flags/#enable-webmcp-testing`.

## License

[MIT](LICENSE)
