import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static site. base matches the GitHub Pages project path
// (https://<user>.github.io/solar-system/); the dev server uses it too.
export default defineConfig({
  base: "/solar-system/",
  plugins: [react()],
});
