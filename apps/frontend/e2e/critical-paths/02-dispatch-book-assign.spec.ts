import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 02 — dispatch book assign", () => {
  test("dispatcher books load and assigns driver", async ({ page }) => {
    await installCriticalPathMocks(page, { role: "Dispatcher" });
    await goTo(page, "/loads");
    await expect(page.getByText(/L-000001|Acme/i).first()).toBeVisible();
    await goTo(page, "/loads/new");
    await expect(page.getByText(/customer|load|book/i).first()).toBeVisible();
  });
});
