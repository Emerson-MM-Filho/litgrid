import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { ssr: "server.tsx", outDir: "dist", emptyOutDir: true },
});
