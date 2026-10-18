// ---------- export: PNG of the frame, video and GIF recorded in real time ----------
const EXPORT_MAX = { png: 0, video: 60, gif: 10 };
const VIDEO_TYPES = ["video/mp4;codecs=avc1.640028", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
const expBtns = { png: document.getElementById("expPng"), video: document.getElementById("expVideo"), gif: document.getElementById("expGif") };
const EXP_LABEL = { png: "PNG", video: "Video", gif: "GIF" };
let rec = null, snapUrl = null;   // rec: the recording in progress, fed by the loop
const lim = (v, a, b, d) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : d));

function deliver(blob, ext) {
  const name = `litgrid-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.${ext}`;
  if (snapUrl) URL.revokeObjectURL(snapUrl);
  snapUrl = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = snapUrl; a.download = name; document.body.append(a); a.click(); a.remove();
  // the preview stays below the stage, with a link, for browsers that don't download on their own
  const el = document.createElement(ext === "png" || ext === "gif" ? "img" : "video");
  el.src = snapUrl;
  if (el.tagName === "VIDEO") { el.controls = true; el.loop = true; el.muted = true; } else el.alt = "Exported frame of the effect";
  const kb = blob.size / 1024, size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  const snapNote = document.getElementById("snapNote");
  snapNote.textContent = `${name} · ${size}. If the download didn't start, `;
  const link = document.createElement("a"); link.href = snapUrl; link.download = name; link.textContent = "save it here";
  snapNote.append(link, ".");
  document.getElementById("snapBody").replaceChildren(el);
  document.getElementById("snap").hidden = false;
  return { ok: true, filename: name, mimeType: blob.type, bytes: blob.size };
}
function recording(kind, seconds, onTick, onStop) {
  for (const [k, b] of Object.entries(expBtns)) { b.disabled = k !== kind; if (k === kind) b.textContent = "Stop"; }
  rec = {
    end: performance.now() + seconds * 1000, stopped: false,
    tick(now) {
      if (this.stopped) return;
      onTick(now);
      showNote(`Recording ${EXP_LABEL[kind]} · ${Math.max(0, (this.end - now) / 1000).toFixed(1)} s left`);
      if (now >= this.end) this.stop();
    },
    stop() {
      if (this.stopped) return;
      this.stopped = true; rec = null;
      for (const [k, b] of Object.entries(expBtns)) { b.disabled = false; b.textContent = EXP_LABEL[k]; }
      onStop();
    },
  };
}
function recordVideo(seconds) {
  const type = window.MediaRecorder && cv.captureStream && VIDEO_TYPES.find(tp => MediaRecorder.isTypeSupported(tp));
  if (!type) return Promise.resolve({ ok: false, message: "This browser can't record video from the canvas." });
  return new Promise((resolve) => {
    const cap = cv.captureStream(60), parts = [];
    const mr = new MediaRecorder(cap, { mimeType: type, videoBitsPerSecond: 16e6 });
    mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    mr.onstop = () => {
      cap.getTracks().forEach(tr => tr.stop()); showNote("");
      resolve(deliver(new Blob(parts, { type: type.split(";")[0] }), type.startsWith("video/mp4") ? "mp4" : "webm"));
    };
    recording("video", seconds, () => {}, () => mr.stop());
    mr.start(1000); dirty = true;
  });
}
function recordGif(seconds, fps, width) {
  const gw = Math.round(width), gh = Math.round(H * gw / W), [gc, gx] = mk(true);
  gc.width = gw; gc.height = gh;
  // each frame is kept as 15-bit colors; the histogram and the sums pick the palette at the end
  const frames = [], times = [], hist = new Uint32Array(32768), sums = new Float64Array(32768 * 3);
  let next = 0;
  return new Promise((resolve) => {
    recording("gif", seconds, (now) => {
      if (now < next) return;
      next = (next || now) + 1000 / fps;
      gx.drawImage(cv, 0, 0, gw, gh);
      const px = gx.getImageData(0, 0, gw, gh).data, f = new Uint16Array(gw * gh);
      for (let i = 0, j = 0; j < f.length; i += 4, j++) {
        const k = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
        f[j] = k; hist[k]++; sums[k * 3] += px[i]; sums[k * 3 + 1] += px[i + 1]; sums[k * 3 + 2] += px[i + 2];
      }
      frames.push(f); times.push(now);
    }, async () => {
      if (!frames.length) { showNote(""); resolve({ ok: false, message: "No frame was captured. Keep the tab visible while recording." }); return; }
      times.push(times[times.length - 1] + 1000 / fps);
      const bytes = await encodeGif(frames, times, gw, gh, hist, sums, (p) => showNote(`Encoding GIF · ${Math.round(p * 100)}%`));
      showNote("");
      resolve(deliver(new Blob([bytes], { type: "image/gif" }), "gif"));
    });
  });
}
// minimal GIF89a encoder: one global palette with the 256 most used colors, LZW per frame, looping
async function encodeGif(frames, times, w, h, hist, sums, progress) {
  const keys = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
  keys.sort((a, b) => hist[b] - hist[a]); keys.length = Math.min(keys.length, 256);
  const pal = new Uint8Array(768);
  keys.forEach((k, i) => { for (let c = 0; c < 3; c++) pal[i * 3 + c] = Math.round(sums[k * 3 + c] / hist[k]); });
  const idx = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) {
    if (!hist[k]) continue;
    const r = sums[k * 3] / hist[k], g = sums[k * 3 + 1] / hist[k], b = sums[k * 3 + 2] / hist[k];
    let best = 0, bd = Infinity;
    for (let i = 0; i < keys.length; i++) {
      const d = (pal[i * 3] - r) ** 2 + (pal[i * 3 + 1] - g) ** 2 + (pal[i * 3 + 2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    idx[k] = best;
  }
  let out = new Uint8Array(1 << 20), n = 0;
  const put = (b) => { if (n === out.length) { const x = new Uint8Array(n * 2); x.set(out); out = x; } out[n++] = b; };
  const u16 = (v) => { put(v & 255); put(v >> 8); };
  const str = (s) => { for (const ch of s) put(ch.charCodeAt(0)); };
  str("GIF89a"); u16(w); u16(h); put(0xf7); put(0); put(0);
  for (const b of pal) put(b);
  put(0x21); put(0xff); put(11); str("NETSCAPE2.0"); put(3); put(1); u16(0); put(0);   // loop forever
  const hk = new Int32Array(8192), hv = new Int16Array(8192), blk = new Uint8Array(255);
  for (let fi = 0; fi < frames.length; fi++) {
    const delay = Math.max(2, Math.round((times[fi + 1] - times[0]) / 10) - Math.round((times[fi] - times[0]) / 10));
    put(0x21); put(0xf9); put(4); put(0x04); u16(delay); put(0); put(0);
    put(0x2c); u16(0); u16(0); u16(w); u16(h); put(0);
    put(8);
    // LZW with an open-addressing table, written in sub-blocks of 255 bytes
    let size = 9, next = 258, bits = 0, nb = 0, bn = 0;
    const byte = (b) => { blk[bn++] = b; if (bn === 255) { put(255); for (const x of blk) put(x); bn = 0; } };
    const emit = (code) => { bits |= code << nb; nb += size; while (nb >= 8) { byte(bits & 255); bits >>>= 8; nb -= 8; } };
    hk.fill(-1); emit(256);
    const f = frames[fi];
    let prefix = idx[f[0]];
    for (let i = 1; i < f.length; i++) {
      const c = idx[f[i]], key = (prefix << 8) | c;
      let s = Math.imul(key, 0x9e3779b1) >>> 19;
      while (hk[s] !== -1 && hk[s] !== key) s = (s + 1) & 8191;
      if (hk[s] === key) { prefix = hv[s]; continue; }
      emit(prefix);
      if (next < 4096) { hk[s] = key; hv[s] = next++; if (next > (1 << size) && size < 12) size++; }
      else { emit(256); hk.fill(-1); size = 9; next = 258; }
      prefix = c;
    }
    emit(prefix); emit(257);
    if (nb > 0) byte(bits & 255);
    if (bn) { put(bn); for (let i = 0; i < bn; i++) put(blk[i]); }
    put(0);
    progress((fi + 1) / frames.length);
    await new Promise(r => setTimeout(r));   // let the page breathe between frames
  }
  put(0x3b);
  return out.subarray(0, n);
}
async function exportMedia({ format, seconds = 4, fps = 15, width = 480, includeData = false } = {}) {
  if (!(format in EXPORT_MAX)) return { ok: false, message: 'format must be "png", "video" or "gif".' };
  if (rec) return { ok: false, message: "A recording is already running." };
  let res;
  if (format === "png") { render(); res = deliver(await new Promise(r => cv.toBlob(r, "image/png")), "png"); }
  else {
    const secs = lim(seconds, 1, EXPORT_MAX[format], 4);
    res = format === "video" ? await recordVideo(secs) : await recordGif(secs, Math.round(lim(fps, 5, 30, 15)), Math.round(lim(width, 160, Math.min(720, W), 480)));
  }
  if (res.ok && includeData && format !== "video" && res.bytes <= 4 * 1024 * 1024) {
    const blob = await fetch(snapUrl).then(r => r.blob());
    res.dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }
  return res;
}
for (const [k, b] of Object.entries(expBtns)) b.onclick = async () => {
  if (rec) { rec.stop(); return; }   // while recording, the active button reads "Stop"
  const res = await exportMedia({ format: k, seconds: +document.getElementById("expSecs").value, width: +document.getElementById("expWidth").value });
  if (!res.ok) showNote(res.message);
};
