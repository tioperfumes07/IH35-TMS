import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));

// B-B — FRONTEND BUILD-SHA STAMP (deploy-parity). The frontend is a SEPARATE Render static deploy that can
// lag `main` while the backend advances (this caused the 2026-07-15 "fixed in main but old shows live" miss).
// Mirror the backend's resolveBackendVersion() precedence + 7-char slice
// (apps/backend/src/health/health.routes.ts:316) EXACTLY so the two shas are directly comparable.
const buildVersion = (
  process.env.RENDER_GIT_COMMIT?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  "dev"
).slice(0, 7);
const buildTime = new Date().toISOString();

// Emit dist/version.json = {version, builtAt} so a deploy-parity monitor can read the SERVED frontend sha
// with no backend involvement. Served at the static site root (/version.json).
function emitVersionJson(): Plugin {
  return {
    name: "ih35-emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: buildVersion, builtAt: buildTime }) + "\n",
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  // Injected at build time; consumed by the System module build-parity row (see build-globals.d.ts).
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
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
