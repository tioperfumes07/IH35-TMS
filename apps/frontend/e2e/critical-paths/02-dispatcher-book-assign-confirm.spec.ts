import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("dispatcher books load, reviews assignment, and confirms flow", async ({ page }) => {
  await installCriticalPathMocks(page, { role: "Dispatcher" });

  await goTo(page, "/dispatch");
  await expect(page.getByText("Dispatch")).toBeVisible();

  await page.getByRole("tab", { name: /book load/i }).click();
  await expect(page.getByText(/use the book load flow/i)).toBeVisible();
  await page.getByRole("button", { name: "+ Book Load" }).click();
  await expect(page.getByText("Customer · Invoice · Charges")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).first().click();

  await page.getByRole("tab", { name: /assignments/i }).click();
  await expect(page.getByTestId("dispatch-assignments-embed")).toBeVisible();

  await page.getByRole("tab", { name: /settlements/i }).click();
  const quickLink = page.getByTestId("dispatch-settlements-link");
  await expect(quickLink).toBeVisible();
  await quickLink.click();
  await expect(page).toHaveURL(/\/driver-finance\/settlements/);
});
