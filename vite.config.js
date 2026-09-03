import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { resolve } from "node:path";

// Static site, several apps: the solar system at the root and the gong at
// /gong/, each its own page with its own entry. base matches the GitHub
// Pages project path (https://<user>.github.io/solar-system/); the dev
// server uses it too, so the gong is at /solar-system/gong/ in both.
export default defineConfig({
  base: "/solar-system/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        gong: resolve(__dirname, "gong/index.html"),
      },
    },
  },
});
