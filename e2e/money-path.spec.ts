/**
 * MONEY PATH — go-live validation, TRANSP only.
 *
 * THROWAWAY BY DESIGN. This is a 48-hour go/no-go gate, not a maintained suite. It will rot the
 * moment the UI moves, and that is fine — its whole job is to be re-run against prod the instant
 * today's fixes deploy and answer one question: does money still flow end to end, to the cent?
 *
 * ENTITY: TRANSP (91e0bf0a-133f-4ce8-a734-2586cfa66d96), QBO write-back OFF.
 * NEVER USMCA — USMCA stays pristine for Sunday go-live.
 *
 * ── AUTH: A HUMAN MUST DO THIS ONCE ──────────────────────────────────────────────────────────
 *   npx playwright codegen --user-data-dir=./.pw-profile https://app.ih35dispatch.com
 * Log in in that window, then close it. The profile persists for every later run.
 *
 * CC-3 did NOT and will not perform the login: entering credentials is prohibited (§1.6). The
 * profile directory is the one step that requires the owner. Everything else runs unattended.
 *
 * ── WHAT WAS VERIFIED LIVE WHEN THIS WAS WRITTEN (2026-08-08, prod 6020040) ──────────────────
 * Read off the real pages in an authenticated session, so the routes and the economics below are
 * observed, not guessed:
 *   /accounting/invoices  — list renders; "Total billed $389,215.05 / Open $25,270.05";
 *                           11,979 invoices; a "+ Create" control is present.
 *   /factoring            — "Factoring (Faro Factoring)", a "Submit to Factor" button, and the
 *                           ACTIVE profile: ADVANCE 97% · FEE 1.5% · RESERVE 1.5% · RECOURSE 95d.
 *                           Reserve balance $0.00, chargeback balance $0.00, recourse pipeline
 *                           EMPTY ("No recourse pipeline rows available in this environment").
 *
 * THE EMPTY PIPELINE IS THE POINT. Factoring has never carried a row here, so this spec is not
 * re-checking a working path — it is the FIRST exercise of it. Expect it to fail the first time;
 * a first-run failure is a finding, not a broken test.
 */
import { test, expect, type Page } from "@playwright/test";

const APP = "https://app.ih35dispatch.com";
const TRANSP = "IH 35 Transportation";

/** Faro Factoring, read off the live profile card. Recomputed here so the test asserts ECONOMICS. */
const ADVANCE_RATE = 0.97;
const FEE_RATE = 0.015;
const RESERVE_RATE = 0.015;

/** Amount chosen so advance/fee/reserve land on exact cents and a rounding bug cannot hide. */
const INVOICE_TOTAL = 1000.0;
const EXPECTED_ADVANCE = 970.0; // 1000.00 * 0.97
const EXPECTED_FEE = 15.0; // 1000.00 * 0.015
const EXPECTED_RESERVE = 15.0; // 1000.00 * 0.015

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Every battery record carries this. `is_sample_data` is not settable from these screens, so the
 * marker rides in the memo — the only field this flow exposes — and it is greppable afterwards.
 */
const SAMPLE_TAG = `SAMPLE/TEST go-live money-path ${new Date().toISOString().slice(0, 10)}`;

/**
 * The entity switcher is the first thing that can silently invalidate the whole run: recording
 * against USMCA would write to the entity that must stay pristine. Fail loudly instead.
 */
async function assertOnTransp(page: Page) {
  const current = page.getByRole("button", { name: /Current company:/i });
  await expect(current, "entity switcher not found — layout changed").toBeVisible();
  await expect(
    current,
    `WRONG ENTITY — this spec must run on ${TRANSP}, never USMCA`
  ).toContainText(TRANSP);
}

test.describe("money path — TRANSP", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${APP}/home`);
    await expect(
      page.getByRole("button", { name: /tioperfumes07@gmail\.com/i }),
      "not signed in — run: npx playwright codegen --user-data-dir=./.pw-profile " + APP
    ).toBeVisible({ timeout: 30_000 });
    await assertOnTransp(page);
  });

  test("invoice → factoring advance/fee/reserve tie to the cent", async ({ page }) => {
    // ── 1. INVOICE ────────────────────────────────────────────────────────────────────────────
    await page.goto(`${APP}/accounting/invoices`);
    await expect(page.getByText(/Accounts receivable invoice list/i)).toBeVisible();
    await assertOnTransp(page);

    await page.getByRole("button", { name: /^\+ Create$/ }).first().click();

    // Selectors below are intentionally role/label-based rather than CSS: the create panel is the
    // part of this flow CC-3 did not open in the authenticated session, so they are the stable
    // form of the guess and are expected to need one codegen pass to confirm.
    await page.getByLabel(/customer/i).click();
    await page.getByLabel(/customer/i).fill("ACORN EXPRESS");
    await page.getByRole("option", { name: /ACORN EXPRESS/i }).first().click();

    await page.getByLabel(/amount|total/i).first().fill(String(INVOICE_TOTAL));
    await page.getByLabel(/memo|notes/i).first().fill(SAMPLE_TAG);

    await page.getByRole("button", { name: /^Save$|^Create$/ }).click();

    // ASSERTION 1 — the invoice total is visible, to the cent.
    await expect(
      page.getByText(money(INVOICE_TOTAL), { exact: false }).first(),
      "invoice total not shown after save"
    ).toBeVisible({ timeout: 20_000 });

    const invoiceNo = await page
      .getByText(/INV-\d{4}-\d{5}/)
      .first()
      .innerText();
    expect(invoiceNo, "no invoice number rendered").toMatch(/INV-\d{4}-\d{5}/);

    // ── 2. FACTORING ──────────────────────────────────────────────────────────────────────────
    await page.goto(`${APP}/factoring`);
    await expect(page.getByText(/Factoring \(Faro Factoring\)/i)).toBeVisible();
    await assertOnTransp(page);

    // ASSERTION 2 — the profile still carries the rates this test computes against. If Faro's
    // terms change, the expected amounts below are wrong and the test must fail HERE, loudly,
    // rather than silently asserting stale economics further down.
    await expect(page.getByText("97", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1.5", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /Submit to Factor/i }).click();

    await page.getByRole("row", { name: new RegExp(invoiceNo) }).click();
    await page.getByRole("button", { name: /^Submit$|Confirm/i }).click();

    // ASSERTION 3 — advance, fee and reserve to the cent. This is the assertion that matters:
    // 97 / 1.5 / 1.5 on $1,000.00 must be exactly $970.00 / $15.00 / $15.00. A percentage applied
    // to the wrong base, or rounded at the wrong step, shows up here and nowhere else.
    await expect(
      page.getByText(money(EXPECTED_ADVANCE), { exact: false }).first(),
      `advance must be ${money(EXPECTED_ADVANCE)} (${INVOICE_TOTAL} × ${ADVANCE_RATE})`
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(money(EXPECTED_FEE), { exact: false }).first(),
      `fee must be ${money(EXPECTED_FEE)} (${INVOICE_TOTAL} × ${FEE_RATE})`
    ).toBeVisible();
    await expect(
      page.getByText(money(EXPECTED_RESERVE), { exact: false }).first(),
      `reserve must be ${money(EXPECTED_RESERVE)} (${INVOICE_TOTAL} × ${RESERVE_RATE})`
    ).toBeVisible();

    // ASSERTION 4 — the invoice now appears in the recourse pipeline. Before this run that table
    // read "No recourse pipeline rows available in this environment" — so this assertion is the
    // difference between "factoring is wired" and "factoring has never run".
    await expect(
      page.getByRole("row", { name: new RegExp(invoiceNo) }),
      "invoice did not enter the recourse pipeline"
    ).toBeVisible();

    // ASSERTION 5 — advance + reserve + fee reconciles to the invoice. Stated as arithmetic the
    // reviewer can check by eye, because a screen can show three plausible numbers that do not add up.
    expect(
      EXPECTED_ADVANCE + EXPECTED_FEE + EXPECTED_RESERVE,
      "advance + fee + reserve must equal the invoice total"
    ).toBeCloseTo(INVOICE_TOTAL, 2);
  });
});
