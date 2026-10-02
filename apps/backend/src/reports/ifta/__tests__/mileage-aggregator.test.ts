import { describe, expect, it, vi } from "vitest";
vi.mock("../../../telematics/ifta-miles.service.js", () => ({
  samsaraIftaReportFetcher: () => async () => ({ vehicles: [] }),
  computeIftaMiles: async () => ({ status: "ok", linked_unit_miles: [{ jurisdiction: "TX", total_miles: 12450, taxable_miles: 12450 }, { jurisdiction: "OK", total_miles: 3200, taxable_miles: 3200 }, { jurisdiction: "AR", total_miles: 1800, taxable_miles: 1800 }] }),
}));

import { aggregateMilesByJurisdiction, parseQuarterLabel } from "../mileage-aggregator.service.js";

describe("mileage-aggregator.service", () => {
  it("parses quarter labels", () => {
    expect(parseQuarterLabel("2026-Q2")).toEqual({ year: 2026, quarter: 2 });
  });

  it("aggregates per-jurisdiction miles from the GPS apportionment engine", async () => {
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
