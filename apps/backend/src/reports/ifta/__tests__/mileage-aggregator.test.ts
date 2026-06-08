import { describe, expect, it } from "vitest";
import { aggregateMilesByJurisdiction, parseQuarterLabel } from "../mileage-aggregator.service.js";

describe("mileage-aggregator.service", () => {
  it("parses quarter labels", () => {
    expect(parseQuarterLabel("2026-Q2")).toEqual({ year: 2026, quarter: 2 });
  });

  it("aggregates per-jurisdiction miles from samsara source", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("samsara.vehicle_state_miles")) {
          return {
            rows: [
              { state: "TX", miles: "12450.000" },
              { state: "OK", miles: "3200.000" },
              { state: "AR", miles: "1800.000" },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const result = await aggregateMilesByJurisdiction(
      client,
      "00000000-0000-4000-8000-000000000001",
      "2026-Q2"
    );
    expect(result).toEqual({ TX: 12450, OK: 3200, AR: 1800 });
  });
});
