import { describe, expect, it } from "vitest";
import { normalizeLovesRows } from "./loves-upload.routes.js";

describe("normalizeLovesRows", () => {
  it("counts malformed and non-positive source rows instead of silently dropping them", () => {
    const result = normalizeLovesRows([
      { station_name: "Love's 001", station_address: "100 Main", price_per_gallon: 3.499 },
      { station_name: "", station_address: "200 Main", price_per_gallon: 3.599 },
      { station_name: "Love's 003", station_address: "", price_per_gallon: 3.699 },
      { station_name: "Love's 004", station_address: "400 Main", price_per_gallon: "not-a-price" },
      { station_name: "Love's 005", station_address: "500 Main", price_per_gallon: 0 },
      { station_name: "Love's 006", station_address: "600 Main", price_per_gallon: -1 },
    ]);

    expect(result.rows).toEqual([
      expect.objectContaining({ station_name: "Love's 001", price_per_gallon: 3.499 }),
    ]);
    expect(result.rows_rejected).toBe(5);
  });

  it("accepts supported workbook aliases while preserving optional location fields", () => {
    const result = normalizeLovesRows([
      {
        name: "Love's 777",
        address_line1: "777 Interstate",
        retail_price: "3.777",
        station_id: "station-777",
        city: "Laredo",
        state: "TX",
      },
    ]);

    expect(result).toEqual({
      rows_rejected: 0,
      rows: [{
        station_uuid: "station-777",
        station_name: "Love's 777",
        station_address: "777 Interstate",
        city: "Laredo",
        state: "TX",
        price_per_gallon: 3.777,
      }],
    });
  });
});
