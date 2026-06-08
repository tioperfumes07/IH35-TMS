import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 08 — safety live map HOS", () => {
  test("safety map route renders with telematics mock", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Safety" });
    await goTo(page, "/safety/map");
    await expect(page.getByText(/map|safety|fleet/i).first()).toBeVisible();
  });
});
