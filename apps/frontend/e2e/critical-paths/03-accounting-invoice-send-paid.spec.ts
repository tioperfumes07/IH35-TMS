import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("accounting creates invoice flow, sends, and starts paid flow", async ({ page }) => {
  await installCriticalPathMocks(page, { role: "Accountant" });

  await goTo(page, "/accounting/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();

  await page.getByRole("button", { name: "+ Create" }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByLabel("Select invoice INV-2026-0001").check();
  await page.getByRole("button", { name: "Mark sent" }).first().click();
  await expect(page.getByText(/mark selected draft invoices as sent/i)).toBeVisible();
  await page.getByRole("button", { name: "Mark sent" }).last().click();

  await goTo(page, "/accounting/payments");
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await page.getByRole("button", { name: "+ Record Payment" }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});
