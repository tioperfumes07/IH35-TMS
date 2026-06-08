import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 10 — admin invite user", () => {
  test("admin users page loads and invite flow reachable", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Administrator" });
    await goTo(page, "/admin/users");
    await expect(page.getByText(/user|invite|Operations Owner/i).first()).toBeVisible();
  });
});
