import { describe, expect, it } from "vitest";
import { invoiceLineTotalCents } from "../invoice-line-total.js";

// Postgres side of invoice_lines_qty_rate_amount_check: round(round(quantity, 2) * unit_cents),
// half away from zero, in exact decimal arithmetic.
function postgresTotal(quantity: string, unitCents: string): number {
  const [whole, frac = ""] = quantity.split(".");
  const thousandths = BigInt(whole) * 1000n + BigInt((frac + "000").slice(0, 3));
  const hundredths = (thousandths + 5n) / 10n;
  const product = hundredths * BigInt(unitCents);
  return Number((product + 50n) / 100n);
}

describe("invoiceLineTotalCents", () => {
  it("matches the column on exact halves that floating point cannot hold", () => {
    expect(0.29 * 50).toBeLessThan(14.5);
    expect(Math.round(0.29 * 50)).toBe(14);
    expect(invoiceLineTotalCents(0.29, 50)).toBe(15);
    expect(postgresTotal("0.29", "50")).toBe(15);
  });

  it("rounds the quantity to the two places the column stores", () => {
    expect(invoiceLineTotalCents(0.295, 100)).toBe(30);
    expect(postgresTotal("0.295", "100")).toBe(30);
  });

  it("keeps a flat line exact", () => {
    expect(invoiceLineTotalCents(1, 420000)).toBe(420000);
  });

  it("agrees with the column across every 2-place quantity up to 20 for a spread of unit prices", () => {
    for (const unit of [1, 3, 7, 45, 50, 99, 101, 333, 12345]) {
      for (let h = 1; h <= 2000; h++) {
        const q = (h / 100).toFixed(2);
        expect(invoiceLineTotalCents(Number(q), unit)).toBe(postgresTotal(q, String(unit)));
      }
    }
  });
});
