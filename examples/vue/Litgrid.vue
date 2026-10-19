<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createLitgrid, type Litgrid, type Settings } from "@ampulla/litgrid";

const props = defineProps<{ settings?: Partial<Settings> }>();
const canvas = ref<HTMLCanvasElement>();
let lg: Litgrid | undefined;
onMounted(() => { lg = createLitgrid(canvas.value!, { settings: props.settings }); });
onBeforeUnmount(() => lg?.destroy());
watch(() => props.settings, (s) => { if (s) lg?.update(s); }, { deep: true });
</script>

<template>
  <canvas ref="canvas" style="width: 100%; aspect-ratio: 16 / 9" />
</template>
