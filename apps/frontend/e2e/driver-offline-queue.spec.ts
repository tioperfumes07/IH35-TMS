import { expect, test } from "@playwright/test";

/**
 * Smoke: service worker registers on driver login page (full offline replay needs driver auth).
 */
test("driver PWA registers service worker", async ({ page }) => {
  await page.goto("/driver/login");
  const hasApi = await page.evaluate(() => "serviceWorker" in navigator);
  expect(hasApi).toBe(true);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return Boolean(r);
  });
  expect(reg).toBeTruthy();
});
