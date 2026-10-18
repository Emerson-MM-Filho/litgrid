// ---------- loop ----------
const stat = document.getElementById("stat");
let last = 0, acc = 0, fpsN = 0, fpsT = 0, fpsReal = 0, dirty = true;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000 || 0); last = now;
  if (S.animate) {
    acc += dt; t += dt;
    const step = S.fpsUnlimited ? 0 : 1 / S.fps;
    if (acc >= step - 0.002) {   // keep the remainder, so the cap is reached on any refresh rate
      acc = Math.min(acc - step, step); frame++;
      if (frame % S.flickerEvery === 0) reroll();
      render(); fpsN++; dirty = false;
    }
  } else if (dirty || bursting() || trail.length > 1 || (dfm && dfm.s > 1.01) || (media && media.tagName === "VIDEO" && !media.paused)) { render(); dirty = false; }
  if (rec) rec.tick(now);
  fpsT += dt; if (fpsT >= 1) { fpsReal = fpsN; fpsN = 0; fpsT = 0; }
  stat.textContent = `${cols}×${rows} cells · ${W}×${H} px${S.animate ? ` · ${fpsReal} fps` : ""}`;
  requestAnimationFrame(loop);
}
function changed() {
  sizeAll(); buildLut(); syncSvgs(); save(); dirty = true;
  playBtn.textContent = S.animate ? "Pause" : "Animate";
  cv.style.cursor = S.followMouse ? "crosshair" : "";
  cv.parentElement.style.background = S.bg;
  const [fr, fg, fb] = hex(S.bg);
  document.documentElement.classList.toggle("light", (0.299 * fr + 0.587 * fg + 0.114 * fb) / 255 > 0.5);
  cv.style.touchAction = S.followMouse ? "none" : "";
}
cv.addEventListener("pointermove", (e) => {
  const b = cv.getBoundingClientRect();
  mouse.tx = (e.clientX - b.left) / b.width * W; mouse.ty = (e.clientY - b.top) / b.height * H;
  if (!mouse.on) { if (!mouse.back) { mouse.x = mouse.tx; mouse.y = mouse.ty; } mouse.on = true; mouse.back = false; }
  if (S.followMouse && !S.animate) dirty = true;
});
// holding a button on the stage swells the shape and keeps it big until the release (press in the embed)
cv.addEventListener("pointerdown", (e) => { if (S.followMouse) cv.setPointerCapture(e.pointerId); setPress(true); });
cv.addEventListener("pointerup", () => setPress(false));
cv.addEventListener("pointerleave", (e) => { setPress(false); releasePointer(e); });   // the shape eases back to its drift
cv.addEventListener("pointercancel", (e) => { setPress(false); releasePointer(e); });

// ---------- buttons ----------
const playBtn = document.getElementById("play");
playBtn.onclick = () => { S.animate = !S.animate; syncPanel(); changed(); };
document.getElementById("reset").onclick = () => {
  S = { ...DEFAULTS }; syncPanel(); changed();
};
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
const dropBtn = document.getElementById("dropMedia"), camBtn = document.getElementById("cam"), photoBtn = document.getElementById("photo");
const note = document.getElementById("note");
const showNote = (msg) => { note.textContent = msg; note.hidden = !msg; };
function stopCam() {
  if (stream) stream.getTracks().forEach(tr => tr.stop());
  stream = null; camBtn.textContent = "Use webcam"; photoBtn.hidden = true;
}
function clearMedia() {
  if (media && media.tagName === "VIDEO") media.pause();
  stopCam(); media = null; mediaW = 0; mediaCam = false;
  dropBtn.hidden = true; document.getElementById("media").value = ""; dirty = true;
}
function setMedia(el, w, h, cam) {
  media = el; mediaW = w; mediaH = h; mediaCam = cam; dropBtn.hidden = false; dirty = true;
}
document.getElementById("media").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  if (media && media.tagName === "VIDEO") media.pause();
  stopCam(); showNote("");
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
    showNote("The browser didn't allow the webcam here. The webcam needs the page served over HTTPS or localhost, and permission to use the camera. On mobile, “Use image or video” can already take a photo with the camera.");
    return;
  }
  if (media && media.tagName === "VIDEO") media.pause();
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream;
  await v.play().catch(() => {});
  setMedia(v, v.videoWidth || 1280, v.videoHeight || 720, true);
  v.onloadedmetadata = () => { mediaW = v.videoWidth; mediaH = v.videoHeight; };
  camBtn.textContent = "Stop webcam"; photoBtn.hidden = false; showNote("");
};
photoBtn.onclick = () => {
  if (!media || !mediaCam) return;
  const c = document.createElement("canvas"); c.width = mediaW; c.height = mediaH;
  c.getContext("2d").drawImage(media, 0, 0, mediaW, mediaH);
  stopCam();
  setMedia(c, mediaW, mediaH, true);
  showNote("Photo taken. The effect now runs on it; “Remove media” goes back to the scene.");
};

// ---------- start ----------
buildPanel(); changed();
document.fonts.load('800 100px "Unbounded"').finally(() => { dirty = true; });
requestAnimationFrame(loop);
