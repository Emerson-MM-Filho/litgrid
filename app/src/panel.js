// ---------- panel: builds the controls from the schema and keeps them in sync with the settings ----------
import { FORMATS, LIGHT_SHAPES, PRESETS } from "../../src/index";
import { SEL_KEY, SVG_KEY, svgText } from "../../src/config";
import { SCHEMA, SWATCHES } from "./schema";

// text settings that mean "off" when empty
const NULLABLE = { magnets: true, anchor: true };

// ed: the editor's shared state ({ S, changed(), reports, playBtn })
export function createPanel(ed) {
  const panel = document.getElementById("panel");
  const inputs = {}, editors = {};
  const fmt = (v, step) => step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2);
  function build() {
    panel.innerHTML = "";
    SCHEMA.forEach(([group, fields], gi) => {
      const d = document.createElement("details"); if (gi < 4) d.open = true;
      d.innerHTML = `<summary>${group}</summary>`;
      const box = document.createElement("div"); box.className = "fields"; d.append(box);
      for (const [key, type, label, a, b, c] of fields) {
        if (key === "presets") {
          const p = document.createElement("div"); p.className = "presets";
          for (const name of Object.keys(PRESETS)) {
            const bt = document.createElement("button"); bt.type = "button"; bt.textContent = name;
            bt.onclick = () => { Object.assign(ed.S, PRESETS[name]); sync(); ed.changed(); };
            p.append(bt);
          }
          box.append(p); continue;
        }
        if (key === "magnetDemo") {
          const p = document.createElement("div"); p.className = "presets";
          const bt = document.createElement("button"); bt.type = "button"; bt.textContent = "Try them on the demo buttons";
          bt.onclick = () => { Object.assign(ed.S, { magnets: ".demo button", anchor: "#demo-cta" }); sync(); ed.changed(); };
          p.append(bt); box.append(p); continue;
        }
        if (key === "svgPanel") {
          const target = type, id = "f-svg-" + target;
          const file = document.createElement("label"); file.className = "file";
          file.innerHTML = `Load .svg file<input type="file" accept=".svg,image/svg+xml">`;
          const row = document.createElement("div"); row.className = "row";
          row.innerHTML = `<label for="${id}">SVG code (edit and apply)</label><span></span><textarea id="${id}" rows="5" spellcheck="false"></textarea>`;
          const acts = document.createElement("div"); acts.className = "svg-actions";
          acts.innerHTML = '<button type="button">Apply</button>';
          const msg = document.createElement("p"); msg.className = "hint"; msg.setAttribute("role", "status");
          msg.textContent = "Use shapes and paths only. Images or external fonts inside the SVG won't load.";
          box.append(file, row, acts, msg);
          const ta = row.querySelector("textarea");
          const apply = () => { ed.S[SVG_KEY[target]] = ta.value; ed.S[SEL_KEY[target]] = "custom"; ed.reports[target] = (m) => { msg.textContent = m; }; sync(); ed.changed(); };
          acts.querySelector("button").onclick = apply;
          file.querySelector("input").onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); apply(); } };
          editors[target] = ta;
          continue;
        }
        if (key === "swatches") {
          const w = document.createElement("div"); w.className = "swatches";
          for (const [k, l] of SWATCHES) {
            const lab = document.createElement("label"); lab.htmlFor = "f-" + k;
            const inp = document.createElement("input"); inp.type = "color"; inp.id = "f-" + k;
            inp.oninput = () => { ed.S[k] = inp.value; ed.changed(); };
            inputs[k] = { el: inp, type: "color" };
            lab.append(inp, l); w.append(lab);
          }
          box.append(w); continue;
        }
        const row = document.createElement("div");
        if (type === "check") {
          row.className = "check";
          const inp = document.createElement("input"); inp.type = "checkbox"; inp.id = "f-" + key;
          const lab = document.createElement("label"); lab.htmlFor = inp.id; lab.textContent = label;
          inp.onchange = () => { ed.S[key] = inp.checked; ed.changed(); };
          inputs[key] = { el: inp, type };
          row.append(inp, lab); box.append(row); continue;
        }
        row.className = "row";
        const lab = document.createElement("label"); lab.htmlFor = "f-" + key; lab.textContent = label;
        const out = document.createElement("output"); out.htmlFor = "f-" + key;
        let inp;
        if (type === "range") {
          inp = document.createElement("input"); inp.type = "range"; inp.min = a; inp.max = b; inp.step = c;
          inp.oninput = () => { ed.S[key] = +inp.value; out.textContent = fmt(ed.S[key], c); ed.changed(); };
        } else if (type === "select") {
          inp = document.createElement("select");
          for (const o of a) { const op = document.createElement("option"); op.value = o; op.textContent = b ? b[o] : o; inp.append(op); }
          inp.onchange = () => {
            if (key === "light" && LIGHT_SHAPES[inp.value]) ed.S.svgMode = LIGHT_SHAPES[inp.value].mode;
            if (key === "format" && FORMATS[inp.value]) Object.assign(ed.S, FORMATS[inp.value].layout);
            const target = key === "light" ? "light" : key === "cellShape" ? "cell" : null;
            if (target && inp.value === "custom" && !ed.S[SVG_KEY[target]]) ed.S[SVG_KEY[target]] = editors[target].value;   // "My SVG" starts from the current shape
            ed.S[key] = inp.value; sync(); ed.changed();
          };
        } else {
          inp = document.createElement("input"); inp.type = "text"; inp.maxLength = a || 24;
          inp.oninput = () => { ed.S[key] = inp.value || (key in NULLABLE ? null : ""); ed.changed(); };
        }
        inp.id = "f-" + key;
        inputs[key] = { el: inp, type, out, step: c };
        row.append(lab, out, inp); box.append(row);
      }
      panel.append(d);
    });
    sync();
  }
  function sync() {
    for (const [k, f] of Object.entries(inputs)) {
      if (f.type === "check") f.el.checked = !!ed.S[k];
      else f.el.value = ed.S[k] ?? "";
      if (f.type === "range") f.out.textContent = fmt(ed.S[k], f.step);
    }
    for (const [target, ta] of Object.entries(editors)) if (document.activeElement !== ta) ta.value = svgText(ed.S, target);
    ed.playBtn.textContent = ed.S.animate ? "Pause" : "Animate";
  }
  return { build, sync };
}
