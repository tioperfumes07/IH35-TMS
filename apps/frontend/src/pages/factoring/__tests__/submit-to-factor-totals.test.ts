import { describe, expect, it } from "vitest";
import { computeSelectionTotals, lineFigures, type LineActuals } from "../SubmitToFactorTab";

const row = (id: string, open: number) =>
  ({
    invoice_id: id,
    open_cents: open,
    base_cents: open,
    expected_escrow_reserve_cents: Math.round(open * 0.015),
    expected_cash_reserve_cents: 0,
    expected_fee_cents: Math.round(open * 0.015),
  }) as never;

describe("Submit to Factor totals (Faro actuals per invoice)", () => {
  it("uses the expected split when no actuals are entered (escrow 1.5%, fee 1.5%, cash 0)", () => {
    const t = computeSelectionTotals([row("a", 300000)], 0);
    expect(t).toMatchObject({ gross: 300000, escrow: 4500, cash: 0, fee: 4500, advance: 291000, net: 291000 });
  });

  it("moves the reserve to cash for an invoice Faro booked as Cash Rsv; net is unchanged, advance rises", () => {
    const a = row("a", 250000);
    const f = lineFigures(a);
    const actuals: Record<string, LineActuals> = { a: { ...f, cash_reserve_cents: f.escrow_reserve_cents, escrow_reserve_cents: 0 } };
    const t = computeSelectionTotals([a], 1000, actuals);
    expect(t).toMatchObject({ escrow: 0, cash: 3750, fee: 3750, advance: 246250, net: 241500 });
    expect(computeSelectionTotals([a], 1000).net).toBe(t.net);
  });
});
