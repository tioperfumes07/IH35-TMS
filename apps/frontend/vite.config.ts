import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@legal": path.resolve(appDir, "../../docs/legal"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "https://ih35-tms.onrender.com",
        changeOrigin: true,
      },
    },
  },
});
