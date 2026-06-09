import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 04 — bill schedule pay", () => {
  test("accounting bill list shows open bill and payments", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Accountant" });
    await goTo(page, "/accounting/bills");
    await expect(page.getByText(/BILL-1001|Roadside/i).first()).toBeVisible();
    await goTo(page, "/accounting/bill-payments");
    await expect(page.getByText(/ACH-88|scheduled/i).first()).toBeVisible();
  });
});
