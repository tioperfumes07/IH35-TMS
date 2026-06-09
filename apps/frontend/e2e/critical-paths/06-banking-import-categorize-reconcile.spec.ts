import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("banking imports statement surface, categorizes, and reconciles", async ({ page }) => {
  await installCriticalPathMocks(page, { role: "Accountant" });

  await goTo(page, "/banking");
  await expect(page.getByRole("heading", { name: "Banking Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Import Statement" })).toBeVisible();

  await goTo(page, "/banking/reconcile");
  await expect(page.getByRole("heading", { name: /bank reconciliation/i })).toBeVisible();
  await expect(page.getByText("Diesel purchase")).toBeVisible();

  await page.locator('section:has-text("Unmatched bank transactions") input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: "Categorize as Fuel" }).click();
  await expect(page.getByText(/selected/)).toHaveCount(0);

  const txnCard = page.locator("article").filter({ hasText: "Diesel purchase" }).first();
  const obligationCard = page.getByRole("button", { name: /Roadside Vendor BILL-1001/i }).first();
  await txnCard.dragTo(obligationCard);
  await expect(page.getByText(/reconciled/i)).toBeVisible();
});
