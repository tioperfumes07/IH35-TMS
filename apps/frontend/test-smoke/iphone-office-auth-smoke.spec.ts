import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, devices } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

/** Repo-root tests/results (cwd is apps/frontend when running Playwright here). */
const RESULTS_DIR = path.join(process.cwd(), "../../tests/results/iphone-smoke-2026-05-14");

function encodeTestAuthHeader(userId: string, role: string, email: string) {
  return Buffer.from(JSON.stringify({ id: userId, role, email }), "utf8").toString("base64url");
}

async function captureForReport(page: Page, filename: string) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const out = path.join(RESULTS_DIR, filename);
  await page.screenshot({ path: out, fullPage: true });
  await test.info().attach(filename, { path: out, contentType: "image/png" });
}

/**
 * Authenticated Office smoke — relies on API `IH35_TEST_AUTH_BYPASS=1` plus `x-test-auth`
 * (see `apps/backend/src/auth/session-middleware.ts`).
 *
 * Env vars are documented in `docs/iphone-smoke.md`.
 */
const OFFICE_BASE = process.env.IH35_OFFICE_SMOKE_URL?.trim() || "https://app.ih35dispatch.com";
const AUTH_USER_ID = process.env.IH35_OFFICE_SMOKE_USER_ID?.trim() ?? "";
const AUTH_EMAIL = process.env.IH35_OFFICE_SMOKE_EMAIL?.trim() ?? "smoke-office@example.invalid";
const AUTH_ROLE = process.env.IH35_OFFICE_SMOKE_ROLE?.trim() || "Dispatcher";
const BYPASS_SECRET = process.env.AUTH_EMAIL_TEST_BYPASS_SECRET?.trim() ?? "";

async function withOfficeContext(browser: Browser, fn: (page: Page) => Promise<void>) {
  const iphone = devices["iPhone 14"];
  const extraHTTPHeaders: Record<string, string> = {
    "x-test-auth": encodeTestAuthHeader(AUTH_USER_ID, AUTH_ROLE, AUTH_EMAIL),
  };
  if (BYPASS_SECRET) extraHTTPHeaders["x-ih35-auth-test-bypass"] = BYPASS_SECRET;

  const context = await browser.newContext({
    ...iphone,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    extraHTTPHeaders,
  });
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

test.describe("iPhone Safari — Office authenticated smoke", () => {
  test("dispatch board lists loads while authenticated", async ({ browser }) => {
    test.skip(!AUTH_USER_ID, "Set IH35_OFFICE_SMOKE_USER_ID (UUID) and enable IH35_TEST_AUTH_BYPASS=1 on the API.");

    await withOfficeContext(browser, async (page) => {
      try {
        await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(800);

        await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/dispatch?view=list`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });

        await expect(page.getByRole("heading", { name: /Dispatch Board/i })).toBeVisible({ timeout: 45_000 });
        await expect(page.getByText(/Showing \d+-\d+ of \d+/)).toBeVisible({ timeout: 45_000 });

        const mobileCards = page.locator('button[type="button"].w-full.rounded.border.border-gray-200.bg-white.p-3');
        await expect(mobileCards.first()).toBeVisible({ timeout: 45_000 });

        await captureForReport(page, "office-auth-dispatch-loads-ok.png");
      } catch (err) {
        await captureForReport(page, "office-auth-dispatch-loads-fail.png");
        throw err;
      }
    });
  });

  test("driver settlements opens highest-detail view from list", async ({ browser }) => {
    test.skip(!AUTH_USER_ID, "Set IH35_OFFICE_SMOKE_USER_ID (UUID) and enable IH35_TEST_AUTH_BYPASS=1 on the API.");

    await withOfficeContext(browser, async (page) => {
      try {
        await page.goto(`${OFFICE_BASE.replace(/\/$/, "")}/driver-finance/settlements`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });

        await expect(page.getByRole("heading", { name: /Driver Settlements/i })).toBeVisible({ timeout: 45_000 });

        const openBtn = page.getByRole("button", { name: "Open →" }).first();
        const openCount = await openBtn.count();
        if (openCount === 0) {
          await captureForReport(page, "office-auth-settlements-empty.png");
          test.skip(true, "No settlement rows — seed settlements or point IH35_OFFICE_SMOKE_USER_ID at a tenant with data.");
        }

        await openBtn.click();
        await expect(page.getByText("Detail View")).toBeVisible({ timeout: 45_000 });
        await captureForReport(page, "office-auth-settlement-detail-ok.png");
      } catch (err) {
        await captureForReport(page, "office-auth-settlement-detail-fail.png");
        throw err;
      }
    });
  });
});
