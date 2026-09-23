import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseFaroCsv, type FaroCsvLine } from "../faro-csv-import.js";

// The owner's real Faro export, committed verbatim (sha256 77b349828b21...), the same file
// ~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/measure_faro_shortpay.py measures.
const EXPORT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../docs/reconcile/faro-purchase-report-all-2026-09-23.csv"
);

/** face - escrow - cash reserve - discount - fees - dispatch - schedule fee, in cents. */
export function expectedNetAdvanceCents(l: FaroCsvLine): number {
  return (
    l.gross_amount_cents -
    l.reserve_amount_cents -
    (l.cash_rsv_amount_cents ?? 0) -
    l.discount_amount_cents -
    l.wire_fee_amount_cents -
    (l.dispatch_amount_cents ?? 0) -
    (l.schedule_fee_amount_cents ?? 0)
  );
}

describe("Faro funding identity on the owner's real export", () => {
  const lines = parseFaroCsv(fs.readFileSync(EXPORT, "utf8")).lines;
  const funded = lines.filter((l) => l.advance_amount_cents !== 0);
  const unfunded = lines.filter((l) => l.advance_amount_cents === 0).map((l) => l.invoice_number);

  it("captures Cash Rsv, Dispatch and Sch Fee on every row (the export carries all three columns)", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.cash_rsv_amount_cents).not.toBeNull();
      expect(l.dispatch_amount_cents).not.toBeNull();
      expect(l.schedule_fee_amount_cents).not.toBeNull();
    }
  });

  it("face - escrow - cash_rsv - discount - fees - dispatch - sch_fee = net advance on all 82 funded invoices, to the cent", () => {
    const broken = funded
      .filter((l) => expectedNetAdvanceCents(l) !== l.advance_amount_cents)
      .map((l) => `${l.invoice_number}: expected ${expectedNetAdvanceCents(l)} got ${l.advance_amount_cents}`);
    expect(broken).toEqual([]);
    expect(funded.length).toBe(82);
  });

  it("the 7 purchased-not-yet-funded invoices are exactly the ones the Lead measured", () => {
    expect([...unfunded].sort()).toEqual(["87", "88", "89", "90", "91", "92", "93"]);
  });

  it("Cash Rsv and Sch Fee are load-bearing: ignoring either breaks the identity (measured: 6 and 3 invoices)", () => {
    for (const [field, invoices] of [["cash_rsv_amount_cents", 6], ["schedule_fee_amount_cents", 3]] as const) {
      const brokenWithout = funded.filter((l) => expectedNetAdvanceCents({ ...l, [field]: 0 }) !== l.advance_amount_cents);
      expect(brokenWithout.length, field).toBe(invoices);
    }
  });

  it("Dispatch is captured but $0.00 on every row of this export (it does not occur in this period)", () => {
    expect(lines.filter((l) => l.dispatch_amount_cents !== 0)).toEqual([]);
  });

  it("the 24 day and grand-total summary rows are recognized by shape and reported, never silently dropped", () => {
    const result = parseFaroCsv(fs.readFileSync(EXPORT, "utf8"));
    expect(result.summary_rows_verified).toBe(24);
    expect(result.lines.length).toBe(89);
  });

  it("a blank-invoice row carrying money is still rejected, even when labelled as a total", () => {
    const csv =
      `Debtor,Date,Inv #,PO,Other Ref,Purchase,Escrow Rsv,Cash Rsv,Discount,Fees,Dispatch,Net Adv,Receipts,Sch Fee,ChgBack (Refund),,Non-purchased\n` +
      `IMPACT BULK LOGISTICS LLC,8/10/26,2,4483,,"$3,000.00",$45.00,$0.00,$45.00,$0.00,$0.00,"$2,910.00",$0.00,$0.00,$0.00,,\n` +
      `1,8/10/26 Total,,,,"$3,000.00",$45.00,$0.00,$45.00,$0.00,$0.00,"$2,910.00",$0.00,$0.00,$0.00,,`;
    expect(() => parseFaroCsv(csv)).toThrow(/rejected 1 of 2 data row/);
  });
});
