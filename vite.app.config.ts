// the editor: a Vite app that imports the library from source, published to GitHub Pages
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "app",
  base: "./",
  build: {
    outDir: "../dist-app",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, "app/index.html"), embed: resolve(import.meta.dirname, "app/embed.html") },
    },
  },
});
