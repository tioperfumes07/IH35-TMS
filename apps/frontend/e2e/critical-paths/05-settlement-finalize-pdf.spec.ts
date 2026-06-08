import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 05 — settlement finalize", () => {
  test("settlement detail loads and shows draft status", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Accountant" });
    await goTo(page, "/settlements");
    await expect(page.getByText(/Driver One|settlement/i).first()).toBeVisible();
    await goTo(page, "/settlements/set-001");
    await expect(page.getByText(/Loaded miles|draft/i).first()).toBeVisible();
  });
});
