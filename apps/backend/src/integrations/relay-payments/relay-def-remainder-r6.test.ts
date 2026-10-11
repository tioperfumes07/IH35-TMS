import { describe, expect, it } from "vitest";
import { csvRowToApiShape, DEF_ESTIMATED_FLAG, fileDefAveragePricePerGallon } from "./relay-fuel-csv-import.routes.js";

// ROUND 443.29 d (Lead R6): a DEF-only fill whose lines do not add up to its amount carries the remainder as DEF at the
// file's average DEF price, flagged estimated. txn_8LZfDKWFvFv1oD: $38.89, file shows 0.112 gal / $0.45 -> 8.003 gal.

const row = (cells: Record<string, string>) => (name: string) => cells[name];
const r6 = row({
  type: "code", status: "settled", id: "txn_8LZfDKWFvFv1oD", "processing time": "2026-09-26 10:00:00.000000 -0500 CDT", work_date: "2026-09-26",
  amount: "38.89", fee: "2.00", total: "40.89", products: "DEF, DEF", "volume def": "0.112", "retail_price def": "3.999", "discounted_price def": "3.999",
  "total_price def": "0.45", "total_gross def": "0.45", "Truck #": "T170",
});

describe("R6 DEF remainder at the file's average DEF price (443.29 d)", () => {
  it("txn_8LZfDKWFvFv1oD becomes DEF 8.003 gal for $38.89, flagged estimated", () => {
    const shape = csvRowToApiShape(r6, { defAveragePricePerGallon: 3581.99 / 735.351 }) as { fuel_items: Array<Record<string, unknown>> };
    expect(shape.fuel_items).toHaveLength(1);
    expect(shape.fuel_items[0]).toMatchObject({ fuel_type: "def", volume: "8.003", total_discounted_price: "38.89", fuel_type_description: `DEF — ${DEF_ESTIMATED_FLAG}` });
  });
  it("no average (or lines already foot) -> the row is unchanged", () => {
    const shape = csvRowToApiShape(r6) as { fuel_items: Array<Record<string, unknown>> };
    expect(shape.fuel_items[0]).toMatchObject({ volume: "0.112", total_discounted_price: "0.45" });
  });
  it("a mixed diesel + DEF fill is never given an estimated DEF remainder", () => {
    const mixed = row({ type: "code", status: "settled", id: "t2", work_date: "2026-09-26", "processing time": "2026-09-26 10:00:00.000000 -0500 CDT", amount: "500.00", "volume diesel": "80", "total_price diesel": "400.00", "volume def": "1", "total_price def": "5.00" });
    const shape = csvRowToApiShape(mixed, { defAveragePricePerGallon: 4.87 }) as { fuel_items: Array<Record<string, unknown>> };
    expect(shape.fuel_items.find((i) => i.fuel_type === "def")).toMatchObject({ volume: "1", total_discounted_price: "5.00" });
  });
  it("the file average = sum(total_price def) / sum(volume def) over settled code rows", () => {
    const avg = fileDefAveragePricePerGallon([
      row({ type: "code", status: "settled", "volume def": "10", "total_price def": "48.71" }),
      row({ type: "code", status: "settled", "volume def": "", "total_price def": "38.89" }),
      row({ type: "deposit", status: "settled", "volume def": "100", "total_price def": "1" }),
    ]);
    expect(avg).toBeCloseTo(4.871, 3);
  });
});
