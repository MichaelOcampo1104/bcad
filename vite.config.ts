import { defineConfig } from "vite";

// bcad — minimal Vite config. No framework; plain TS modules wired in main.ts.
export default defineConfig({
  server: {
    open: true,
  },
  build: {
    target: "es2020",
    sourcemap: true,
  },
});
