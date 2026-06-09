import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 09 — P&L drill export", () => {
  test("profit and loss report renders revenue lines", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Accountant" });
    await goTo(page, "/reports/profit-loss");
    await expect(page.getByText(/Linehaul Revenue|Net income/i).first()).toBeVisible();
  });
});
