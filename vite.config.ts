import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only harness to preview <RemoveBgTool /> in a browser without
// depending on a host app. Not part of the published package (see
// package.json "files").
export default defineConfig({
  root: "demo",
  plugins: [react()],
  server: {
    fs: { allow: [".."] },
  },
});
