import { defineConfig, devices } from "@playwright/test";

const bypassSecret = process.env.AUTH_EMAIL_TEST_BYPASS_SECRET?.trim() ?? "";

export default defineConfig({
  testDir: "./test-smoke",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [["list"]],
  use: {
    ...devices["iPhone 14"],
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...(bypassSecret ? { extraHTTPHeaders: { "x-ih35-auth-test-bypass": bypassSecret } } : {}),
  },
});
