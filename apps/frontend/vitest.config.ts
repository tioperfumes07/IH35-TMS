import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const appDir = path.dirname(fileURLToPath(import.meta.url));

// NODE-ENV-TEST-PIN: vitest only defaults NODE_ENV to "test" when it is UNSET. A shell that
// exports NODE_ENV=production (agent shells, CI images, .zshenv) therefore leaks straight into the
// test run, React resolves its PRODUCTION build, and React.act does not exist there -- so EVERY
// @testing-library render dies with "TypeError: React.act is not a function" and the whole FE suite
// reads as 100% dead. That is a measurement artifact, not a real failure, and it is expensive: it
// makes a mostly-green suite look unrunnable. Pin it here so a polluted shell cannot lie to us.
process.env.NODE_ENV = "test";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@legal": path.resolve(appDir, "../../docs/legal"),
    },
  },
  test: {
    globals: true,
    env: { NODE_ENV: "test" },
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "../../packages/shared-types/src/**/*.test.ts",
    ],
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
