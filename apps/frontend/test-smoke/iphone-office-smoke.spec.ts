import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Repo-root tests/results (cwd is apps/frontend when running Playwright here). */
const RESULTS_DIR = path.join(process.cwd(), "../../tests/results/iphone-smoke-2026-05-14");

async function captureForReport(page: Page, filename: string) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const out = path.join(RESULTS_DIR, filename);
  await page.screenshot({ path: out, fullPage: true });
  await test.info().attach(filename, { path: out, contentType: "image/png" });
}

/**
 * Office web app smoke (IH35 Office) — iPhone layout.
 * Production base URL per P6-T11205; Google OAuth blocks full auth in automation unless
 * a dedicated test account + storageState is added (see docs/testing/iphone-safari-smoke.md).
 */
const OFFICE_BASE =
  process.env.IH35_OFFICE_SMOKE_URL?.trim() || "https://app.ih35dispatch.com";

test.describe("iPhone Safari — Office app smoke (unauthenticated gates)", () => {
  test("login page / Google entry renders", async ({ page }) => {
    await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByRole("heading", { name: /IH 35 Office Login/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
    await captureForReport(page, "office-login-iphone.png");
  });

  test("dispatch board route redirects unauthenticated users to login", async ({ page }) => {
    await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/dispatch`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForURL(/\/login/, { timeout: 45_000 });
    await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
    await captureForReport(page, "office-dispatch-gate-iphone.png");
  });

  test("driver finance settlements list redirects to login", async ({ page }) => {
    await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/driver-finance/settlements`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForURL(/\/login/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /IH 35 Office Login/i })).toBeVisible();
    await captureForReport(page, "office-driver-finance-gate-iphone.png");
  });
});
