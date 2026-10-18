// ---------- WebMCP: the same settings, as tools an AI agent in the browser can call ----------
// the input schema comes from SCHEMA, so a new control shows up here without extra work
const FIELDS = {};
for (const [, fields] of SCHEMA) for (const [key, type, label, a, b, c] of fields) {
  if (type === "range") FIELDS[key] = { type: c >= 1 ? "integer" : "number", minimum: a, maximum: b, description: label };
  else if (type === "check") FIELDS[key] = { type: "boolean", description: label };
  else if (type === "select") {
    const opts = a.filter(o => o !== "custom");   // "custom" goes through set_custom_svg
    FIELDS[key] = { type: "string", enum: opts, description: b ? `${label}. ${opts.map(o => `${o}: ${b[o]}`).join("; ")}` : label };
  }
  else if (type === "text") FIELDS[key] = { type: "string", maxLength: 24, description: label };
}
for (const [k, l] of SWATCHES) FIELDS[k] = { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: `Palette color "${l}" (hex)` };

function applySettings(input = {}) {
  const applied = {}, ignored = {};
  // the format brings its layout first, so explicit layout values in the same call still win
  if (FORMATS[input.format]) Object.assign(S, FORMATS[input.format].layout);
  if (LIGHT_SHAPES[input.light] && !("svgMode" in input)) S.svgMode = LIGHT_SHAPES[input.light].mode;
  for (const [k, v] of Object.entries(input)) {
    const f = FIELDS[k];
    if (!f) { ignored[k] = "unknown setting"; continue; }
    let val = v;
    if (f.type === "number" || f.type === "integer") {
      if (typeof v !== "number" || !isFinite(v)) { ignored[k] = "expected a number"; continue; }
      val = Math.min(f.maximum, Math.max(f.minimum, f.type === "integer" ? Math.round(v) : v));
    } else if (f.type === "boolean") {
      if (typeof v !== "boolean") { ignored[k] = "expected true or false"; continue; }
    } else if (typeof v !== "string" || (f.enum && !f.enum.includes(v)) || (f.pattern && !new RegExp(f.pattern).test(v))) {
      ignored[k] = f.enum ? `expected one of: ${f.enum.join(", ")}` : f.pattern ? "expected a hex color like #c2410c" : "expected text"; continue;
    } else if (f.maxLength) val = v.slice(0, f.maxLength);
    S[k] = applied[k] = val;
  }
  syncPanel(); changed();
  return { applied, ignored };
}
function setSvg({ target, svg } = {}) {
  if (!SVG_KEY[target] || typeof svg !== "string") return Promise.resolve({ ok: false, message: 'Pass target ("light" or "cell") and svg.' });
  return new Promise((resolve) => {
    const done = (message) => { clearTimeout(timer); reports[target] = null; resolve({ ok: message === "SVG applied.", message }); };
    const timer = setTimeout(() => done("SVG applied."), 3000);   // same code as before: nothing reloads, nothing reports
    reports[target] = done;
    S[SVG_KEY[target]] = svg; S[SEL_KEY[target]] = "custom";
    syncPanel(); changed();
  });
}
const settingsNow = () => { const { svgLight, svgCell, ...rest } = S; return { ...rest, customSvg: { light: svgLight || null, cell: svgCell || null } }; };

const TOOLS = [
  {
    name: "get_settings", title: "Read Litgrid settings",
    description: "Returns every current Litgrid setting, the color preset names and the output size. Call it before changing settings, to see where you start.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => ({ settings: settingsNow(), colorPresets: Object.keys(PRESETS), size: { width: W, height: H, cols, rows } }),
  },
  {
    name: "set_settings", title: "Change Litgrid settings",
    description: "Litgrid draws a grid of cells lit by a scene (text plus a light shape): dark areas become dim dots, mid tones solid cells, bright areas hollow lit cells, with glow and scanlines on top. Pass only the settings to change; numbers are clamped to their range. Changing the format also moves the text and the shape to that format's layout, unless you pass layout values in the same call. Returns what was applied and what was ignored, with the reason.",
    inputSchema: { type: "object", properties: FIELDS, additionalProperties: false },
    execute: async (input) => applySettings(input),
  },
  {
    name: "apply_color_preset", title: "Apply a Litgrid color preset",
    description: "Sets the background, the five palette colors and the glow from a named preset.",
    inputSchema: { type: "object", properties: { name: { type: "string", enum: Object.keys(PRESETS) } }, required: ["name"] },
    execute: async ({ name } = {}) => PRESETS[name] ? applySettings(PRESETS[name]) : { applied: {}, ignored: { name: `expected one of: ${Object.keys(PRESETS).join(", ")}` } },
  },
  {
    name: "set_custom_svg", title: "Use your own SVG in Litgrid",
    description: 'Replaces the light shape (target "light") or the cell shape (target "cell") with SVG code. Use shapes and paths only: images, external fonts and links inside the SVG will not load. For "light", the svgMode setting decides whether the SVG is a lit silhouette or keeps its own tones. A cell SVG with preserveAspectRatio="none" stretches to fill the cell.',
    inputSchema: { type: "object", properties: { target: { type: "string", enum: ["light", "cell"] }, svg: { type: "string", description: "Full SVG code, from <svg …> to </svg>" } }, required: ["target", "svg"] },
    execute: setSvg,
  },
  {
    name: "export_media", title: "Export Litgrid as PNG, video or GIF",
    description: 'Saves what is on the stage to the user\'s downloads: "png" is the current frame at full size, "video" is MP4 when the browser can record it (WebM otherwise) at full size, "gif" is a looping GIF scaled down to `width`. Video and GIF are recorded in real time, so the call takes `seconds` (plus encoding, for a GIF) and the tab must stay visible. Turn on the animate setting first if the result should move. Returns the file name, type and size. With includeData, a PNG or GIF up to 4 MB also comes back as a data URL, so you can look at the result.',
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["png", "video", "gif"] },
        seconds: { type: "number", minimum: 1, maximum: 60, description: "Length of the recording: up to 60 for video, up to 10 for GIF. Default 4." },
        fps: { type: "integer", minimum: 5, maximum: 30, description: "GIF frames per second. Default 15." },
        width: { type: "integer", minimum: 160, maximum: 720, description: "GIF width in px; the height follows the format. Default 480." },
        includeData: { type: "boolean", description: "Also return a PNG or GIF as a data URL (up to 4 MB)." },
      },
      required: ["format"], additionalProperties: false,
    },
    execute: exportMedia,
  },
  {
    name: "reset_settings", title: "Reset Litgrid",
    description: "Puts every setting back to its default, custom SVGs included.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => { S = { ...DEFAULTS }; syncPanel(); changed(); return { settings: settingsNow() }; },
  },
];
// the spec puts the API on document; early Chrome builds had it on navigator
const modelContext = document.modelContext || navigator.modelContext;
if (modelContext?.registerTool) for (const tool of TOOLS) Promise.resolve().then(() => modelContext.registerTool(tool)).catch(() => {});
