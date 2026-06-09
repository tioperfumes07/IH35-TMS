import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("driver settlement finalizes and exports settlement PDF", async ({ page }) => {
  await installCriticalPathMocks(page, { role: "Owner" });

  await goTo(page, "/driver-finance/settlements");
  await expect(page.getByRole("heading", { name: "Driver Settlements" })).toBeVisible();
  await page.getByRole("button", { name: /open/i }).click();
  await expect(page).toHaveURL(/settlement_id=set-001/);

  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Finalize Settlement" }).click();
  await expect(page.getByText(/payment status/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Queue Payment" })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __openedUrls: string[] }).__openedUrls = [];
    const original = window.open;
    window.open = ((...args: Parameters<typeof window.open>) => {
      (window as unknown as { __openedUrls: string[] }).__openedUrls.push(String(args[0] ?? ""));
      return original("", "_blank");
    }) as typeof window.open;
  });
  await page.getByRole("button", { name: "View settlement PDF" }).click();
  const openedUrls = await page.evaluate(() => (window as unknown as { __openedUrls: string[] }).__openedUrls);
  expect(openedUrls.some((url) => url.includes("/api/v1/driver-finance/settlements/set-001.html"))).toBeTruthy();

  await page.getByRole("button", { name: "Queue Payment" }).click();
  await page.getByRole("button", { name: "Mark Sent to Bank" }).click();
  await page.getByRole("button", { name: "Mark Cleared" }).click();
  await expect(page.getByText("cleared")).toBeVisible();
});
