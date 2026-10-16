import { describe, expect, it } from "vitest";
import {
  applyTotalEdit,
  clampPurchased,
  computeSelectionTotals,
  distributeTotalProRata,
  lineFigures,
  linePurchased,
  selectionNotPurchased,
  type LineActuals,
} from "../SubmitToFactorTab";

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

describe("443.171 — partial purchase + editable Selection totals", () => {
  const rows = [row("a", 400000), row("b", 250000), row("c", 133333)];

  it("distributeTotalProRata: a fee total of $150.01 over 3 invoices sums to exactly 15001 cents", () => {
    const parts = distributeTotalProRata(15001, [400000, 250000, 133333]);
    expect(parts.reduce((a, x) => a + x, 0)).toBe(15001);
    expect(parts.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    expect(distributeTotalProRata(2, [1, 1, 1])).toEqual([0, 1, 1]); // residual cents to the later lines
    expect(distributeTotalProRata(500, [0, 0])).toEqual([0, 500]);
  });

  it("editing the fee total writes per-line actuals that sum exactly to the typed total", () => {
    const next = applyTotalEdit(rows as never, "fee_cents", 15001, {}, {});
    const t = computeSelectionTotals(rows as never, 0, next.actuals, next.purchased);
    expect(t.fee).toBe(15001);
    expect(Object.values(next.actuals).reduce((a, l) => a + l.fee_cents, 0)).toBe(15001);
  });

  it("a purchased total below the open sum splits pro rata by open; no line above its open; sums exactly", () => {
    const open = 400000 + 250000 + 133333;
    const next = applyTotalEdit(rows as never, "gross", 600001, {}, {});
    const lines = (rows as never[]).map((r) => linePurchased(r, next.purchased));
    expect(lines.reduce((a, x) => a + x, 0)).toBe(600001);
    (rows as Array<{ base_cents: number }>).forEach((r, i) => expect(lines[i]!).toBeLessThanOrEqual(r.base_cents));
    const t = computeSelectionTotals(rows as never, 0, next.actuals, next.purchased);
    expect(t.gross).toBe(600001);
    expect(selectionNotPurchased(rows as never, next.purchased)).toBe(open - 600001);
    // A purchased total ABOVE the open sum is refused (down only): it clamps to the open balance.
    const up = applyTotalEdit(rows as never, "gross", open + 99999, {}, next.purchased);
    expect(computeSelectionTotals(rows as never, 0, up.actuals, up.purchased).gross).toBe(open);
  });

  it("clampPurchased: never above the open balance, never zero; blank = the open balance", () => {
    expect(clampPurchased(500000, 400000)).toBe(400000);
    expect(clampPurchased(0, 400000)).toBe(1);
    expect(clampPurchased(null, 400000)).toBe(400000);
    expect(clampPurchased(300000, 400000)).toBe(300000);
  });

  it("Faro bought 3,000 of 4,000: expected split scales pro rata; Faro actuals still win", () => {
    const r = row("a", 400000);
    expect(lineFigures(r, undefined, 300000)).toEqual({ escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500 });
    const actual: LineActuals = { escrow_reserve_cents: 4400, cash_reserve_cents: 0, fee_cents: 4600 };
    expect(lineFigures(r, actual, 300000)).toEqual(actual);
    const t = computeSelectionTotals([r], 0, {}, { a: 300000 });
    expect(t).toMatchObject({ gross: 300000, escrow: 4500, fee: 4500, net: 291000 });
    expect(selectionNotPurchased([r], { a: 300000 })).toBe(100000);
  });
});
