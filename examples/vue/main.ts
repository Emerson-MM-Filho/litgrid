// the README's Vue component
import { createApp, h } from "vue";
import Litgrid from "./Litgrid.vue";

createApp({ render: () => h(Litgrid, { settings: { text: "Vue", followMouse: true } }) }).mount("#app");
