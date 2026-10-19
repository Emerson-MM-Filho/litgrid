// the README's Vue component; the button swaps the palette after mounting, to show that new settings reach the canvas
import { createApp, h, ref } from "vue";
import { PRESETS } from "@ampulla/litgrid";
import Litgrid from "./Litgrid.vue";

const preset = ref("Terracotta on night");
createApp({
  render: () => [
    h("button", { onClick: () => { preset.value = "Ink on paper"; } }, "Swap palette"),
    h(Litgrid, { settings: { text: "Vue", followMouse: true, ...PRESETS[preset.value] } }),
  ],
}).mount("#app");
