# Changelog

All notable changes to this package are recorded here. The package follows
[semantic versioning](https://semver.org/); while it is `0.x`, a minor version may change
the API.

## 0.2.0

A change of behaviour, so a minor version: while the package is `0.x`, a minor version is
where a change that can alter what a page sees goes. No API is added or removed.

- The light stays tied to what it follows when the canvas moves on screen. Its carried-over
  state (the follow position, the spring's centre, the glide, the trail and the velocity
  behind the deformation) lived in drawing pixels, so a canvas that moved under a still
  pointer (one that scrolls with the page, or one taller than the viewport that the page
  moves while scrolling) dragged the light away with it, and it eased back: the light, its
  trail and its deformation jumped. Now:
  - following, or resting where the pointer left: the light is tied to the screen, and stays
    under a still pointer;
  - held by a magnet or the anchor: it is tied to that element and moves with it, scroll
    included; the spring only catches and lets go;
  - drifting with `followMouse` off, driven by `light.set()`, gliding back after a release,
    or waiting: it is tied to the canvas, as before.
- With `animate: false`, a canvas that moves under a light tied to the screen is drawn again,
  so the light stays under the pointer.
- The README's CDN addresses point at `@0.2`.

## 0.1.2

Documentation only: no change to the code in the package.

- The README's first image keeps the sparkle's figure eight over the word, now centred, and
  adds a row of buttons that catch the light as magnets, wrap it in a bar and let it go.
- A new GIF shows `burst()` and `press()` in the new "Clicks" section, which explains
  `burstSize`, `burstGlow` and `burstSecs`. A ring marks where each click happens.
- The GIFs fill the README's column, on GitHub and on npm.
- The demo buttons, in the editor and in the GIFs, are named Primary, Secondary and
  Tertiary.
- The README shows its images by their path in the repository (`docs/media/...`), so each
  branch and pull request shows its own. npm turns those paths into addresses on the
  repository's default branch.
- The editor's GIF encoder has a delta mode, off in the editor, which writes only what
  changed between frames; `npm run docs:media` uses it to keep the GIFs small at this width.

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
