import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("accounting enters bill flow, schedules payment, and records payment", async ({ page }) => {
  await installCriticalPathMocks(page, { role: "Accountant" });

  await goTo(page, "/accounting/bills");
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible();
  await page.getByLabel("Select bill BILL-1001").check();
  await page.getByRole("button", { name: "Mark scheduled" }).click();
  await page.locator('input[type="date"]').last().fill("2026-06-15");
  await page.getByRole("button", { name: "Mark scheduled" }).last().click();

  await goTo(page, "/accounting/bill-payments");
  await expect(page.getByRole("heading", { name: "Bill Payments" })).toBeVisible();
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "+ Record Bill Payment" }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});
