import { describe, expect, it } from "vitest";
import { aggregateFuelByJurisdiction } from "../fuel-aggregator.service.js";

describe("fuel-aggregator.service", () => {
  it("aggregates per-jurisdiction fuel gallons", async () => {
    const client = {
      query: async (sql: string) => {
        expect(sql).toContain("fuel.fuel_transactions");
        return {
          rows: [
            { state: "TX", gallons: "5500.000", source_kind: "relay", record_count: "12" },
            { state: "OK", gallons: "1200.000", source_kind: "relay", record_count: "4" },
          ],
        };
      },
    };

    const result = await aggregateFuelByJurisdiction(
      client,
      "00000000-0000-4000-8000-000000000001",
      "2026-Q2"
    );
    expect(result).toEqual({ TX: 5500, OK: 1200 });
  });
});
