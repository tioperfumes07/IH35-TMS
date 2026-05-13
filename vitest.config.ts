import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/backend/src/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    setupFiles: ["apps/backend/src/test-env.ts"],
  },
});
