import { describe, expect, it } from "vitest";
import { extractRows, locationCodeOf, locationColumns } from "../perfumeFileReaders";

const CODES = ["008", "005", "011", "012", "018", "019", "229", "230", "231", "002", "T1"];

describe("PERFUME-DESK my inventory by location (owner 2026-11-20)", () => {
  it("reads location columns from headers that start with a registered number", () => {
    expect(locationCodeOf("8")).toBe("008");
    const header = ["UPC", "SKU", "Description", "Qty", "Avg cost", "008 Perfume Bodega Laredo", "11 - Laredo", "T1", "1 MILLION", "999 Nowhere"];
    expect([...locationColumns(header, CODES)]).toEqual([[5, "008"], [6, "011"], [7, "T1"]]);
  });
  it("each line carries its pieces per location; zero and blank cells are left out; $0 cost kept on my list", () => {
    const sheet = { name: "HK", cells: [
      ["UPC", "SKU", "Description", "Qty", "Avg cost", "008 Perfume Bodega Laredo", "011 Laredo"],
      ["8011003895755", "109832", "EROS NAJIM PARFUM 100ML (M)", 248, 52.51, 123, 31],
      [null, "41046", "CW CORAL REEF EDT 100ML (WT)", 36, 0, null, 0],
    ] };
    const ex = extractRows(sheet, 0, { upc: 0, sku: 1, desc: 2, qty: 3, price: 4 }, { keepPriceless: true, locationCodes: CODES });
    expect(ex.rows.map((r) => [r.price, r.qty_by_location])).toEqual([["52.51", { "008": "123", "011": "31" }], ["0.00", null]]);
    expect(ex.fileTotalCents).toBe(5251);
  });
});
