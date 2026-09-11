import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: webRoot,
  envDir: webRoot,
  plugins: [react()],
  build: {
    assetsInlineLimit: 0
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173)
  }
});
