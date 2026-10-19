// the library build: an ES module and an IIFE that exposes window.Litgrid
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    lib: {
      entry: "src/index.ts",
      name: "Litgrid",
      formats: ["es", "iife"],
      fileName: (format) => (format === "es" ? "litgrid.js" : "litgrid.iife.js"),
    },
  },
});
