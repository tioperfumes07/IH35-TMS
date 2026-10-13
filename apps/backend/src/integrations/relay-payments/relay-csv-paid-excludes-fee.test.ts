import { describe, expect, it } from "vitest";
import { csvPaidExcludingFee, csvRowToApiShape } from "./relay-fuel-csv-import.routes.js";

// 443.52 C: a CSV fill must equal the API fill of the same transaction — total_amount_paid EXCLUDES Relay's fee
// (txn_3SYsWdUdUjmorj: amount 593.85, fee 2.00, total 595.85 → paid 593.85, fees [2.00]).
describe("csvPaidExcludingFee / csvRowToApiShape", () => {
  it("paid = the CSV amount (fee excluded)", () => {
    expect(csvPaidExcludingFee("593.85", "595.85", "2.00")).toBe("593.85");
  });
  it("no amount column: total − fee", () => {
    expect(csvPaidExcludingFee(null, "595.85", "2.00")).toBe("593.85");
  });
  it("neither present stays missing (rejected by the parser, never $0.00)", () => {
    expect(csvPaidExcludingFee(null, null, "2.00")).toBeNull();
  });
  it("a real CSV code row maps paid without the fee and keeps the fee in fees[]", () => {
    const row: Record<string, string> = {
      id: "txn_3SYsWdUdUjmorj", type: "code", status: "settled", "processing time": "2026-10-01 03:07:27.6 -0400 EDT", work_date: "2026-10-01",
      amount: "593.85", fee: "2.00", total: "595.85", products: "Diesel", "volume diesel": "100.000", "total_price diesel": "593.85", "total_gross diesel": "600.00",
    };
    const shape = csvRowToApiShape((k) => row[k], { defAveragePricePerGallon: null }) as Record<string, unknown>;
    expect(shape.total_amount_paid).toBe("593.85");
    expect(shape.fees).toEqual([{ type: "relay_fee", amount: "2.00" }]);
  });
});
