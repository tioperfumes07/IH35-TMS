// 443.171 E — a posted purchase opens in the SAME Submit to Factor form: detail → rows / purchased / actuals, and the
// Save changes body built from the edited state.
import { describe, expect, it } from "vitest";
import type { FactoringPurchaseDetail } from "../../../api/factoring-purchases";
import { applyTotalEdit, buildEditPurchaseBody, computeSelectionTotals, editPrefillFromPurchase, linePurchased } from "../SubmitToFactorTab";

const line = (id: string, gross: number, extra: Record<string, unknown> = {}) => ({
  id: `pl-${id}`,
  line_no: 1,
  invoice_id: id,
  invoice_display_id: `99-${id}`,
  invoice_total_cents: 400000,
  invoice_status: "factored",
  customer_id: "cust",
  customer_name: "Shram Logistics Solutions",
  load_id: `load-${id}`,
  load_number: id,
  settlement_id: null,
  settlement_display_id: null,
  gross_cents: String(gross),
  escrow_reserve_cents: "4500",
  cash_reserve_cents: "0",
  fee_cents: 4500,
  faro_invoice_number: "99",
  ...extra,
});

const detail = {
  id: "fp-1",
  display_id: "FP-2026-00012",
  status: "posted",
  purchase_date: "2026-10-15",
  wire_date: "2026-10-16",
  faro_report_ref: "R-1",
  wire_fee_cents: "2000",
  factoring_company_name: "Faro",
  notes: "n",
  lines: [line("a", 300000, { invoice_open_cents: 400000 }), line("b", 250000)],
} as unknown as FactoringPurchaseDetail;

describe("443.171 E — edit-mode prefill", () => {
  it("maps each live line to a row, its purchased amount, its posted figures and Faro Inv #", () => {
    const p = editPrefillFromPurchase(detail);
    expect(p.rows.map((r) => [r.invoice_id, r.base_cents])).toEqual([
      ["a", 400000],
      ["b", 250000],
    ]);
    // a: Faro bought 3,000 of 4,000 → purchased recorded; b: no open balance reported → capped at its gross.
    expect(p.purchased).toEqual({ a: 300000 });
    expect(p.capFromGross).toEqual(["b"]);
    expect(p.actuals.a).toEqual({ escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500 });
    expect(p.faroNumbers).toEqual({ a: "99", b: "99" });
    const t = computeSelectionTotals(p.rows, 2000, p.actuals, p.purchased);
    expect(t).toMatchObject({ gross: 550000, escrow: 9000, fee: 9000, net: 550000 - 18000 - 2000 });
  });

  it("builds the PATCH body from the edited state (date fixed, line lowered, reason trimmed)", () => {
    const p = editPrefillFromPurchase(detail);
    const lowered = applyTotalEdit(p.rows, "gross", 500000, p.actuals, p.purchased);
    const body = buildEditPurchaseBody({
      rows: p.rows,
      purchased: lowered.purchased,
      actuals: lowered.actuals,
      faroNumbers: p.faroNumbers,
      purchaseDate: "2026-10-14",
      wireDate: "",
      reportRef: " R-1 ",
      wireFeeCents: 2000,
      notes: "",
      reason: "  wrong purchase date entered  ",
    });
    expect(body).toMatchObject({ purchase_date: "2026-10-14", wire_date: null, faro_report_ref: "R-1", notes: null, wire_fee_cents: 2000, reason: "wrong purchase date entered" });
    expect(body.lines.reduce((a, l) => a + l.gross_cents, 0)).toBe(500000);
    body.lines.forEach((l, i) => expect(l.gross_cents).toBeLessThanOrEqual(p.rows[i]!.base_cents));
    expect(body.lines[0]).toMatchObject({ invoice_id: "a", escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500, faro_invoice_number: "99" });
    expect(body.lines.map((l) => l.gross_cents)).toEqual(p.rows.map((r) => linePurchased(r, lowered.purchased)));
  });
});
