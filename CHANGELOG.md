# Changelog

All notable changes to this package are recorded here. The package follows
[semantic versioning](https://semver.org/); while it is `0.x`, a minor version may change
the API.

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
