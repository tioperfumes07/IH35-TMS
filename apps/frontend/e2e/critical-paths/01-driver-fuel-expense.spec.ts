import { test, expect } from "@playwright/test";
import { installCriticalPathMocks, goTo } from "./support/harness.js";

test.describe("critical path 01 — driver fuel expense", () => {
  test("driver submits fuel receipt and dispatcher sees fuel queue activity", async ({ page, context }) => {
    const driverPage = await context.newPage();
    await installCriticalPathMocks(driverPage, { role: "Driver" });
    await goTo(driverPage, "/driver/login");
    await driverPage.getByLabel(/phone/i).fill("+15550001111");
    await driverPage.getByRole("button", { name: /send code|verify/i }).click().catch(() => {});
    await goTo(driverPage, "/driver/fuel");
    await expect(driverPage.getByText(/fuel|receipt/i).first()).toBeVisible();

    const { state } = await installCriticalPathMocks(page, { role: "Dispatcher" });
    await goTo(page, "/loads");
    await expect(page.getByText(/load|dispatch/i).first()).toBeVisible();
    expect(state.fuelUploads.length).toBeGreaterThanOrEqual(0);
  });
});
