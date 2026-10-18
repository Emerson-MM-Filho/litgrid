# Litgrid

A grid of cells that lights up with the light in the scene: dark becomes a dim
dot, mid becomes a solid cell, and bright becomes a hollow, lit cell, with glow
and scanlines on top. It's the CRT/LED panel look, rebuilt in the browser with
the 2D canvas.

## Running it

Live at https://emerson-mm-filho.github.io/litgrid/ (the webcam works there).

There is no build step and there are no dependencies: the app lives in `app/`,
open `app/index.html` in a browser.

On your machine, the webcam only works when the page is served from `localhost`:

```sh
cd app
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Files

Everything the page needs is in `app/`:

- `index.html`: the page markup.
- `style.css`: the layout and the light and dark frames.
- `js/config.js`: presets, formats, the built-in SVG shapes, the settings
  schema and the saved settings.
- `js/panel.js`: builds the control panel from the schema.
- `js/render.js`: the canvas pipeline (scene, grid, light, trail, deformation).
- `js/export.js`: PNG, video and the GIF encoder.
- `js/webmcp.js`: the tools for AI agents.
- `js/app.js`: the frame loop, the buttons, media and webcam, and the start.
- `js/embed.js` and `embed.html`: the renderer on another page, without the editor.

They are plain scripts, not ES modules, so the page still opens straight from
disk. They share their top-level names and load in the order listed in
`index.html`.

`.github/workflows/pages.yml` publishes `app/` to GitHub Pages on every push to
`main`.

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

## Embedding

`embed.html` shows the renderer on a page of its own, without the editor. Load three
scripts and mount it on a canvas:

```html
<canvas id="lit"></canvas>
<script src="js/config.js"></script>
<script src="js/render.js"></script>
<script src="js/embed.js"></script>
<script>
  const lg = Litgrid.mount(document.getElementById("lit"), {
    settings: { text: "", followMouse: true, bg: "#0c0a09", c4: "#ffffff" },
    media: "scene.png",
  });
</script>
```

- `settings` takes the JSON from "Copy settings", whole or in part, over the defaults.
  Every color is a setting, so the theme is whatever you pass. Nothing is read from or
  saved to the browser.
- `media` is an image or video URL (another origin needs CORS), or an `<img>`, `<video>`
  or `<canvas>`.
- `size` is the drawing size in pixels; by default it is the canvas' displayed size
  times the pixel ratio.

Behind a page's content, the canvas can stay fixed and full screen: pass `pointer: window`
so the light follows the mouse over the whole page, a `<canvas>` you draw the scene on as
`media` (call `lg.redraw()` after drawing it when animate is off), and `lg.bands([{ y, bg,
c0, … }])` so each horizontal band of the screen, from `y` down, gets its own palette, for
sections with different backgrounds. `lg.resize([w, h])` follows the window.

On a phone the page keeps scrolling: a vertical swipe scrolls, and a tap or a sideways
drag moves the light. When the pointer leaves, the light eases back to its drift.
Nothing is drawn while the canvas is off screen, and with reduced motion the canvas
shows a still frame. `lg.ready` resolves after the first full frame, `lg.update()`
changes settings, `lg.snapshot()` returns the frame as a data URL, and `lg.stop()`
ends it. There is one canvas per page, because the renderer keeps its state in globals.

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
