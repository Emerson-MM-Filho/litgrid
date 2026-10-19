# Changelog

All notable changes to this package are recorded here. The package follows
[semantic versioning](https://semver.org/); while it is `0.x`, a minor version may change
the API.

## 0.1.2

Documentation only: no change to the code in the package.

- The README's first image is now a tour of the library: the light is born wrapped around
  a button by the anchor, follows the pointer, turns into every light shape and every
  preset, swells on `burst()` and on a held `press(true)`, and is caught by three buttons.
  A caption in each frame names the exact code behind it, and the shapes and presets come
  from `LIGHT_SHAPES` and `PRESETS`, so a new one joins the tour by itself.
- A new GIF shows `burst()` and `press()` in the new "Clicks" section, which explains
  `burstSize`, `burstGlow` and `burstSecs`. A ring marks where each click happens.
- The GIFs fill the README's column, on GitHub and on npm.
- The editor's GIF encoder has a delta mode, off in the editor, which writes only what
  changed between frames; `npm run docs:media` uses it to keep the longer GIFs small.

## 0.1.1

Documentation only: no change to the code in the package.

- The README opens with a GIF of the effect, shows a magnet wrapping and releasing buttons
  in a second GIF, and has a catalog with an image of every preset, light shape and cell
  shape next to its exact name. The images load from the repository, so they render on
  npm too, and stay out of the package.
- `npm run docs:media` renders every one of those images from the current code, and a test
  fails when a preset or a shape has no image or no README row.

## 0.1.0

The first release as a package.

- `createLitgrid(canvas, options)`: one independent instance per canvas, with `ready`,
  `update`, `bands`, `resize`, `redraw`, `burst`, `press`, `snapshot` and `destroy`.
  `destroy()` stops the frame loop and removes every listener. Importing the package
  touches no browser global, so it is safe to import on a server.
- Builds: an ES module (`dist/litgrid.js`), a script-tag build that exposes
  `window.Litgrid` (`dist/litgrid.iife.js`) and TypeScript declarations. No runtime
  dependencies.
- Light control: `light.get()` (state, position in client pixels, holder, size and
  stretch), `light.set()`, `light.release()` and a read-only `pointer`.
- Magnets (`magnets`, `magnetMode`, `magnetReach`, `magnetBorder`, `magnetTime`) and an
  `anchor`, with the `on("magnet")` event: elements pull the light and wrap it in a
  rounded bar, the keyboard focus drives it too, and the light is born on the anchor.
- With `followMouse` on, the light waits at its place before the pointer comes and rests
  where the pointer left, instead of drifting.

Porting from the plain scripts: `Litgrid.mount(canvas, options)` becomes
`createLitgrid(canvas, options)` and `stop()` becomes `destroy()`. See the README.
