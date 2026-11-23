import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(src) },
  },
  // Keep the REACT_APP_* variable names the app was already deployed with.
  envPrefix: "REACT_APP_",
  server: { port: 3000 },
  preview: { port: 3000 },
  build: {
    // Same output folder as Create React App, so hosting settings don't change.
    outDir: "build",
  },
});
