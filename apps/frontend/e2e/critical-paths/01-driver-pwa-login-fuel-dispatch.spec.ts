import { expect, test } from "@playwright/test";
import { goTo, installCriticalPathMocks } from "./support/harness";

test("driver login submits fuel receipt and dispatcher can see update", async ({ page }) => {
  const { state } = await installCriticalPathMocks(page, { role: "Owner" });

  await goTo(page, "/driver/login");
  await page.locator('input[inputmode="tel"]').fill("+15550001111");
  await page.getByRole("button", { name: /send code/i }).click();
  await expect(page.getByText(/code sent/i)).toBeVisible();

  await page.locator('input[inputmode="numeric"]').fill("123456");
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/driver\/loads/);

  await goTo(page, "/pwa/fuel-receipt");
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6W5kEAAAAASUVORK5CYII=",
      "base64"
    ),
  });
  await page.getByLabel("Truck (unit) ID").fill("TRK-21");
  await page.getByLabel("Odometer").fill("120345");
  await page.getByLabel("Amount (USD)").fill("320.55");
  await page.getByLabel("Station name").fill("Fuel Plaza");
  await page.getByRole("button", { name: /upload receipt/i }).click();

  await expect(page.getByText(/saved\. bank txn/i)).toContainText("fuel-receipt-1");
  expect(state.fuelUploads).toHaveLength(1);

  await goTo(page, "/dispatch/map");
  await expect(page.getByTestId("dispatch-map-view")).toBeVisible();
  await expect(page.getByRole("button", { name: /load/i })).toBeVisible();
});
