/**
 * ACCT-F124 — an invoice with no revenue-bearing lines must not be sendable.
 *
 * The first test is the one that matters: it asserts the OTHER two guards pass on an empty line set.
 * That vacuous pass is the actual defect — both of them iterate the lines and validate what they
 * find, so with nothing to find they raise nothing and the invoice sends. INV-2026-00004 (USMCA)
 * reached status='sent' on 2026-08-04 with zero lines, and the posting engine then correctly refused
 * it (INVOICE_LINE_REVENUE_UNRESOLVED), leaving a receivable with no journal entry.
 *
 * If someone later "simplifies" by folding the new check into one of those loops, test 1 fails and
 * says why.
 */
import { describe, expect, it } from "vitest";
import {
  assertInvoiceHasRevenueLines,
  assertLoadRevenueHasSourceLoad,
  assertRevenueLinesHaveIncomeAccount,
  InvoiceHasNoRevenueLinesError,
  type InvoiceLineGuardRow,
} from "../invoice-linkage-guards.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA, the entity this actually happened on
const INVOICE = "f280b52a-5007-4820-8576-ceec1e2355c0"; // INV-2026-00004

const revenueLine: InvoiceLineGuardRow = {
  id: "line-1",
  line_type: "load_revenue",
  line_total_cents: 120_000,
  account_id: "acct-1",
  qbo_item_id: null,
} as InvoiceLineGuardRow;

describe("ACCT-F124 · invoice must carry a revenue line before send", () => {
  it("the pre-existing guards pass VACUOUSLY on an empty line set — this is the defect", () => {
    // Neither throws. Both are correct about the lines that exist; there simply are none.
    expect(() => assertLoadRevenueHasSourceLoad(null, [])).not.toThrow();
    expect(() => assertRevenueLinesHaveIncomeAccount(OPCO, [])).not.toThrow();
  });

  it("refuses an invoice with zero lines", () => {
    expect(() => assertInvoiceHasRevenueLines(OPCO, INVOICE, [])).toThrow(InvoiceHasNoRevenueLinesError);
  });

  it("refuses an invoice whose lines exist but none are revenue-bearing", () => {
    // Non-empty must not be enough. Per isRevenueBearingLine a line counts only when it is not 'tax'
    // AND carries a positive amount, so a tax-only invoice and a zero-amount invoice both have
    // nothing for the ledger to recognise — and would reproduce the INV-2026-00004 outcome.
    const taxOnly = [{ ...revenueLine, id: "line-tax", line_type: "tax" }] as InvoiceLineGuardRow[];
    const zeroAmount = [{ ...revenueLine, id: "line-zero", line_total_cents: 0 }] as InvoiceLineGuardRow[];
    expect(() => assertInvoiceHasRevenueLines(OPCO, INVOICE, taxOnly)).toThrow(InvoiceHasNoRevenueLinesError);
    expect(() => assertInvoiceHasRevenueLines(OPCO, INVOICE, zeroAmount)).toThrow(InvoiceHasNoRevenueLinesError);
  });

  it("allows an invoice carrying a revenue line", () => {
    expect(() => assertInvoiceHasRevenueLines(OPCO, INVOICE, [revenueLine])).not.toThrow();
  });

  it("names the invoice in the error so the refusal is actionable, not a bare 422", () => {
    try {
      assertInvoiceHasRevenueLines(OPCO, INVOICE, []);
      throw new Error("expected a refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(InvoiceHasNoRevenueLinesError);
      expect((e as Error).message).toContain(INVOICE);
    }
  });
});
