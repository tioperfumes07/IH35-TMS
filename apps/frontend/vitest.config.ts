import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@legal": path.resolve(appDir, "../../docs/legal"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/components/forms/shared/CostBreakdownBox.tsx",
        "src/components/forms/shared/TotalsStack.tsx",
        "src/components/forms/shared/TypeTabBar.tsx",
        "src/components/Sidebar.tsx",
        "src/components/maintenance/LocationMapModal.tsx",
      ],
    },
  },
});
