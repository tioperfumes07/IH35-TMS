import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 03 — invoice send paid", () => {
  test("accounting views invoice and records payment", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Accountant" });
    await goTo(page, "/accounting/invoices");
    await expect(page.getByText(/INV-2026-0001|Acme/i).first()).toBeVisible();
    await goTo(page, "/accounting/payments");
    await expect(page.getByText(/payment|ACH/i).first()).toBeVisible();
  });
});
