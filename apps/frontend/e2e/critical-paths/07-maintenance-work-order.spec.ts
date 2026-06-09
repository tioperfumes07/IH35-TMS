import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 07 — maintenance work order", () => {
  test("maintenance work orders page loads", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Mechanic" });
    await goTo(page, "/maintenance/work-orders");
    await expect(page.getByText(/work order|maintenance/i).first()).toBeVisible();
  });
});
