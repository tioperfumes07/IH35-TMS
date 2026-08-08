import { defineConfig } from "@playwright/test";

/**
 * Go-live money-path validation only. THROWAWAY — see e2e/money-path.spec.ts.
 * Auth comes from ./.pw-profile, created ONCE by a human:
 *   npx playwright codegen --user-data-dir=./.pw-profile https://app.ih35dispatch.com
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Serial + single worker on purpose: this writes REAL rows to prod TRANSP. Parallel runs would
  // race on invoice numbers and on the factoring pipeline.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "https://app.ih35dispatch.com",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    launchOptions: { args: [`--user-data-dir=${process.cwd()}/.pw-profile`] },
  },
});
