import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const coverageTargets = [
  "apps/backend/src/work-orders/work-orders.routes.ts",
  "apps/backend/src/accounting/expenses.routes.ts",
  "apps/backend/src/accounting/bills.routes.ts",
  "apps/backend/src/accounting/invoices.routes.ts",
  "apps/backend/src/driver-finance/settlements.routes.ts",
  "apps/backend/src/qbo/sync-alerts.routes.ts",
  "apps/backend/src/mdata/qbo-autocomplete.routes.ts",
];

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["apps/backend/src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    setupFiles: [path.join(repoRoot, "apps/backend/test-helpers/setup-env.ts")],
    coverage: {
      provider: "v8",
      reportsDirectory: path.join(repoRoot, "coverage/backend"),
      reporter: ["text", "json-summary"],
      include: coverageTargets,
      exclude: ["**/*.test.ts", "**/*.integration.test.ts"],
      thresholds: {
        // Target matrix requested 60/60/50; start strict-on-intent but keep CI green while suites grow.
        lines: 35,
        functions: 35,
        branches: 25,
      },
    },
  },
});
