import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const DRIVER_URL = process.env.DRIVER_PWA_SMOKE_URL ?? "https://driver.ih35dispatch.com";
const DRIVER_EMAIL = process.env.DRIVER_SMOKE_EMAIL ?? "";
const BYPASS_CODE = process.env.AUTH_EMAIL_TEST_BYPASS_CODE?.trim() ?? "000000";
const BYPASS_SECRET = process.env.AUTH_EMAIL_TEST_BYPASS_SECRET?.trim() ?? "";

const API_ORIGIN = process.env.IH35_SMOKE_API_ORIGIN ?? "";
const SETTLEMENT_ID = process.env.DRIVER_SMOKE_SETTLEMENT_ID ?? "";
const OPERATING_COMPANY_ID = process.env.DRIVER_SMOKE_OPERATING_COMPANY_ID ?? "";

const GEO_LAT = Number(process.env.DRIVER_SMOKE_LAT ?? "30.267153");
const GEO_LNG = Number(process.env.DRIVER_SMOKE_LNG ?? "-97.743057");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function attachScreenshot(label: string, page: Page) {
  await test.info().attach(label, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe.configure({ mode: "serial" });

test.describe("iPhone Safari — Driver PWA smoke", () => {
  test("happy path with screenshots", async ({ browser }) => {
    test.skip(!DRIVER_EMAIL, "Set DRIVER_SMOKE_EMAIL to a driver-linked identity email.");
    test.skip(!BYPASS_SECRET, "Set AUTH_EMAIL_TEST_BYPASS_SECRET (must match server env + Playwright extra header).");

    const context = await browser.newContext({
      permissions: ["geolocation"],
      geolocation: { latitude: GEO_LAT, longitude: GEO_LNG },
      ...(BYPASS_SECRET ? { extraHTTPHeaders: { "x-ih35-auth-test-bypass": BYPASS_SECRET } } : {}),
    });
    const page = await context.newPage();

    await test.step("01 — open driver PWA", async () => {
      await page.goto(DRIVER_URL, { waitUntil: "domcontentloaded" });
      await attachScreenshot("01-home.png", page);
    });

    await test.step("02 — PWA install signal", async () => {
      const manifestHint = await page.locator('link[rel="manifest"]').count();
      const swHint = await page.evaluate(() => Boolean(navigator.serviceWorker));
      await test.info().attach("02-pwa-signals.txt", {
        body: Buffer.from(`manifest_link_tags=${manifestHint}\nservice_worker_api=${swHint}`, "utf8"),
        contentType: "text/plain",
      });
      await attachScreenshot("02-after-pwa-check.png", page);
    });

    await test.step("03 — email login (OTP bypass)", async () => {
      await page.getByRole("button", { name: "Email" }).click();
      await page.getByPlaceholder(/driver@example\.com/i).fill(DRIVER_EMAIL);
      await page.getByRole("button", { name: "Send code" }).click();
      await page.getByPlaceholder("6-digit code").fill(BYPASS_CODE);
      await page.getByRole("button", { name: "Verify" }).click();
      await page.waitForURL(/\/(today|home)/, { timeout: 120_000 });
      await attachScreenshot("03-after-login.png", page);
    });

    await test.step("04 — today loads list", async () => {
      await page.goto(new URL("/today", DRIVER_URL).toString(), { waitUntil: "networkidle" }).catch(() => undefined);
      await expect(page.getByText("Today")).toBeVisible();
      await attachScreenshot("04-today-loads.png", page);
    });

    await test.step("05 — open first load (or skip)", async () => {
      const primaryCandidate = page.locator(".space-y-2").locator('button[type="button"]').first();
      if ((await primaryCandidate.count()) === 0) {
        await test.info().attach("05-no-loads.txt", {
          body: Buffer.from("No load buttons detected under Today — skipping pickup/drop placeholders."),
          contentType: "text/plain",
        });
        await attachScreenshot("05-empty-loads.png", page);
        return;
      }

      await primaryCandidate.click();
      await page.waitForTimeout(1200);
      await attachScreenshot("05-load-detail.png", page);

      const acceptButton = page.getByRole("button", { name: /accept/i });
      if ((await acceptButton.count()) > 0) {
        await acceptButton.first().click().catch(() => undefined);
        await page.waitForTimeout(1200);
        await attachScreenshot("05-after-accept.png", page);
      }

      await page.getByRole("button", { name: "Stops" }).click();
      await page.locator('button[type="button"].min-h-11').first().click();
      await attachScreenshot("05-stop-action.png", page);

      await page.waitForTimeout(6000);
      await page.getByRole("button", { name: "Mark Arrived" }).click({ timeout: 120_000 });

      await page.getByRole("button", { name: "Upload BOL/POD" }).click();
      const tmpFile = path.join(os.tmpdir(), `ih35-smoke-bol-${Date.now()}.png`);
      await fs.writeFile(tmpFile, PNG_BYTES);
      const fileInputs = page.locator('input[type="file"]');
      const fileInputCount = await fileInputs.count();
      await fileInputs.nth(fileInputCount > 1 ? 1 : 0).setInputFiles(tmpFile);

      const bolCategory = page.getByRole("button", { name: /BOL/i }).first();
      if ((await bolCategory.count()) > 0) {
        await bolCategory.click();
      } else {
        await page.locator("button.min-h-14").first().click();
      }

      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Queue Upload" }).click({ timeout: 120_000 });
      await attachScreenshot("06-after-bol-queue.png", page);

      await page.getByRole("button", { name: "Mark Departed" }).click({ timeout: 180_000 });
      await attachScreenshot("07-after-depart.png", page);
    });

    await test.step("08 — settlement dispute (API, uses session cookies)", async () => {
      if (!API_ORIGIN || !SETTLEMENT_ID || !OPERATING_COMPANY_ID) {
        await test.info().attach("08-dispute-skipped.txt", {
          body: Buffer.from(
            "Missing IH35_SMOKE_API_ORIGIN, DRIVER_SMOKE_SETTLEMENT_ID, or DRIVER_SMOKE_OPERATING_COMPANY_ID — skipping POST /settlements/:id/dispute."
          ),
          contentType: "text/plain",
        });
        return;
      }

      const disputeUrl = `${API_ORIGIN.replace(/\/$/, "")}/api/v1/driver/settlements/${SETTLEMENT_ID}/dispute?operating_company_id=${OPERATING_COMPANY_ID}`;
      const response = await page.request.post(disputeUrl, {
        data: {
          reason_code: "SMOKE_UI",
          reason_text: "Automated iPhone Safari smoke dispute — minimum length satisfied.",
          claimed_adjustment_cents: 150,
          evidence_r2_paths: [],
        },
      });

      const status = response.status();
      const bodyText = await response.text();

      await test.info().attach("08-dispute-response.json", {
        body: Buffer.from(JSON.stringify({ status, body: bodyText }, null, 2)),
        contentType: "application/json",
      });
      expect(response.ok()).toBeTruthy();
    });

    await test.step("09 — disputes inbox UI", async () => {
      await page.goto(new URL("/profile", DRIVER_URL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "My Disputes" }).click();
      await expect(page.getByText("My Disputes")).toBeVisible();
      await attachScreenshot("09-my-disputes.png", page);
    });

    await context.close();
  });
});
