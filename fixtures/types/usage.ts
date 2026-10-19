// compiled against the emitted types (the package's own name resolves to dist/ through "exports")
import { createLitgrid, DEFAULTS, type Litgrid, type Settings } from "@ampulla/litgrid";

declare const canvas: HTMLCanvasElement;
const settings: Partial<Settings> = { followMouse: true, bg: "#000000", light: "sphere", mode: "variable" };
const lg: Litgrid = createLitgrid(canvas, { settings, size: [800, 600], pointer: window, media: "scene.png" });
lg.update({ shapeSize: DEFAULTS.shapeSize * 2 });
lg.bands([{ y: 400, bg: "#ffffff" }]);
lg.press(true);
const url: string = lg.snapshot("image/jpeg", 0.9);
lg.ready.then((ready) => ready.destroy());
void url;

// a misspelled option or setting does not compile
// @ts-expect-error: "setings" is not an option
createLitgrid(canvas, { setings: {} });
// @ts-expect-error: "folowMouse" is not a setting
lg.update({ folowMouse: true });
// @ts-expect-error: mode only takes "fixed", "variable" or "solid"
lg.update({ mode: "hollow" });
