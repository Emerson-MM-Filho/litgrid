// ---------- the editor: settings, the engine on the stage, the buttons, media and webcam ----------
import { DEFAULTS, FORMATS } from "../../src/index";
import { createEngine } from "../../src/engine";
import { createPanel } from "./panel";
import { createExporter } from "./export";
import { registerTools } from "./webmcp";

const KEY = "litgrid-v2";
let S = { ...DEFAULTS };
try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) S = { ...DEFAULTS, ...saved }; } catch {}
if (!FORMATS[S.format]) S.format = DEFAULTS.format;   // saved format no longer in the list
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
if (matchMedia("(prefers-reduced-motion: reduce)").matches) S.animate = false;

const cv = document.getElementById("stage");
const stat = document.getElementById("stat");
const playBtn = document.getElementById("play");
const note = document.getElementById("note");
const lightStat = document.getElementById("lightStat");
// a short name for an element in the read-out: its tag, id or text
const describe = (el) => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 20)}"`;

// what the panel, the export and the agent tools share; S is reassigned on reset, so it's read through a getter
const ed = {
  get S() { return S; }, set S(v) { S = v; },
  canvas: cv, playBtn,
  reports: {},   // reports[target] hears, once, how loading an SVG went
  changed, syncPanel: () => panel.sync(),
  showNote: (msg) => { note.textContent = msg; note.hidden = !msg; },
};

let fpsN = 0, fpsT = 0, fpsReal = 0, lastNow = 0;
ed.engine = createEngine(cv, {
  settings: S, formatSize: true, reducedMotion: false,
  onSvgReport: (target, msg) => { const r = ed.reports[target]; ed.reports[target] = null; r?.(msg); },
  onFrame(now, drew) {
    const dt = Math.min(0.25, (now - lastNow) / 1000 || 0); lastNow = now;
    if (drew && S.animate) fpsN++;
    exporter.tick(now);
    fpsT += dt; if (fpsT >= 1) { fpsReal = fpsN; fpsN = 0; fpsT = 0; }
    const { width, height, cols, rows } = ed.engine.info();
    stat.textContent = `${cols}×${rows} cells · ${width}×${height} px${S.animate ? ` · ${fpsReal} fps` : ""}`;
    const l = ed.engine.light.get();
    lightStat.textContent = `light: ${l.state} · ${Math.round(l.x)}, ${Math.round(l.y)}${l.element ? ` · ${describe(l.element)}` : ""}`;
  },
});
const panel = createPanel(ed);
const exporter = createExporter(ed);

function changed() {
  ed.engine.update(S); save();
  playBtn.textContent = S.animate ? "Pause" : "Animate";
  cv.style.cursor = S.followMouse ? "crosshair" : "";
  cv.parentElement.style.background = S.bg;
  const [fr, fg, fb] = [1, 3, 5].map(i => parseInt(S.bg.slice(i, i + 2), 16));
  document.documentElement.classList.toggle("light", (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255 > 0.5);
  cv.style.touchAction = S.followMouse ? "none" : "";
}
// holding a button on the stage swells the shape and keeps it big until the release (press in the library)
cv.addEventListener("pointerdown", (e) => { if (S.followMouse) cv.setPointerCapture(e.pointerId); ed.engine.press(true); });
cv.addEventListener("pointerup", () => ed.engine.press(false));
cv.addEventListener("pointerleave", () => ed.engine.press(false));
cv.addEventListener("pointercancel", () => ed.engine.press(false));

// ---------- buttons ----------
playBtn.onclick = () => { S.animate = !S.animate; panel.sync(); changed(); };
document.getElementById("reset").onclick = () => { S = { ...DEFAULTS }; panel.sync(); changed(); };
document.getElementById("copy").onclick = async (e) => {
  const txt = JSON.stringify(S, null, 2), btn = e.currentTarget;
  try { await navigator.clipboard.writeText(txt); btn.textContent = "Settings copied"; }
  catch {
    const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("aria-label", "Settings");
    ta.style.cssText = "width:100%;height:160px;font:12px var(--mono);background:var(--bg);color:var(--fg);border:1px solid var(--line)";
    btn.closest(".stage-wrap").append(ta); ta.select(); btn.textContent = "Select and copy below";
  }
  setTimeout(() => { btn.textContent = "Copy settings"; }, 2200);
};

// ---------- media and webcam ----------
const dropBtn = document.getElementById("dropMedia"), camBtn = document.getElementById("cam"), photoBtn = document.getElementById("photo");
let media = null, mediaW = 0, mediaH = 0, mediaCam = false, stream = null;
function stopCam() {
  if (stream) stream.getTracks().forEach(tr => tr.stop());
  stream = null; camBtn.textContent = "Use webcam"; photoBtn.hidden = true;
}
function setMedia(el, w, h, cam) {
  media = el; mediaW = w; mediaH = h; mediaCam = cam; dropBtn.hidden = !el;
  ed.engine.setMedia(el, w, h, cam);
}
function clearMedia() {
  if (media && media.tagName === "VIDEO") media.pause();
  stopCam(); setMedia(null, 0, 0, false);
  document.getElementById("media").value = "";
}
document.getElementById("media").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  if (media && media.tagName === "VIDEO") media.pause();
  stopCam(); ed.showNote("");
  if (f.type.startsWith("video")) {
    const v = document.createElement("video"); v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
    v.onloadedmetadata = () => { setMedia(v, v.videoWidth, v.videoHeight, false); v.play().catch(() => {}); };
  } else {
    const im = new Image(); im.onload = () => setMedia(im, im.naturalWidth, im.naturalHeight, false); im.src = url;
  }
};
dropBtn.onclick = clearMedia;
camBtn.onclick = async () => {
  if (stream) { clearMedia(); return; }
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("not supported");
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch {
    stream = null;
    ed.showNote("The browser didn't allow the webcam here. The webcam needs the page served over HTTPS or localhost, and permission to use the camera. On mobile, “Use image or video” can already take a photo with the camera.");
    return;
  }
  if (media && media.tagName === "VIDEO") media.pause();
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream;
  await v.play().catch(() => {});
  setMedia(v, v.videoWidth || 1280, v.videoHeight || 720, true);
  v.onloadedmetadata = () => setMedia(v, v.videoWidth, v.videoHeight, true);
  camBtn.textContent = "Stop webcam"; photoBtn.hidden = false; ed.showNote("");
};
photoBtn.onclick = () => {
  if (!media || !mediaCam) return;
  const c = document.createElement("canvas"); c.width = mediaW; c.height = mediaH;
  c.getContext("2d").drawImage(media, 0, 0, mediaW, mediaH);
  stopCam();
  setMedia(c, mediaW, mediaH, true);
  ed.showNote("Photo taken. The effect now runs on it; “Remove media” goes back to the scene.");
};

// ---------- start ----------
panel.build(); changed();
registerTools(ed, exporter);
