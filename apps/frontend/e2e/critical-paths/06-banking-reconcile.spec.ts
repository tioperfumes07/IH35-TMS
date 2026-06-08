import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 06 — banking reconcile", () => {
  test("banking dashboard and reconcile views render", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Accountant" });
    await goTo(page, "/banking");
    await expect(page.getByText(/Operating Checking|banking/i).first()).toBeVisible();
    await goTo(page, "/banking/reconcile");
    await expect(page.getByText(/reconcil|transaction/i).first()).toBeVisible();
  });
});
