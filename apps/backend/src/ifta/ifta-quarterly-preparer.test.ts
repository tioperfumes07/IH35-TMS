import { describe, expect, it } from "vitest";
import { quarterWindow } from "./ifta-state-miles-aggregator.js";

describe("ifta-state-miles-aggregator", () => {
  it("builds deterministic quarter windows", () => {
    const q2 = quarterWindow(2, 2026);
    expect(q2.startDate).toBe("2026-04-01");
    expect(q2.endDateExclusive).toBe("2026-07-01");
  });

  it("returns rows sorted by state from aggregateStateMiles SQL contract", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("samsara.vehicle_state_miles")) {
          return { rows: [{ state: "TX", miles: "100.000" }] };
        }
        return { rows: [] };
      },
    };
    const { aggregateStateMiles } = await import("./ifta-state-miles-aggregator.js");
    const rows = await aggregateStateMiles(client, "00000000-0000-4000-8000-000000000001", quarterWindow(2, 2026));
    expect(rows).toEqual([{ state: "TX", miles: 100, source: "samsara" }]);
    expect(calls[0]).toContain("ORDER BY UPPER(TRIM(state))");
  });
});

describe("ifta-state-gallons-aggregator", () => {
  it("dedupes relay before loves in SQL priority", async () => {
    const { aggregateStateGallons } = await import("./ifta-state-gallons-aggregator.js");
    const client = {
      query: async (sql: string) => {
        expect(sql).toContain("ORDER BY state, priority");
        return {
          rows: [{ state: "TX", gallons: "50.000", source_kind: "relay", record_count: "2" }],
        };
      },
    };
    const rows = await aggregateStateGallons(client, "00000000-0000-4000-8000-000000000001", quarterWindow(2, 2026));
    expect(rows[0]?.state).toBe("TX");
    expect(rows[0]?.gallons).toBe(50);
    expect(rows[0]?.source).toBe("relay");
  });
});

describe("ifta-quarterly-preparer routes (smoke)", () => {
  it("exports registerIftaQuarterlyPreparerRoutes", async () => {
    const mod = await import("./ifta-quarterly-preparer.routes.js");
    expect(typeof mod.registerIftaQuarterlyPreparerRoutes).toBe("function");
  });
});

describe("ifta-tax-calculator", () => {
  it("computes per-state tax from miles and gallons hand example", async () => {
    const { calculateStateTaxes } = await import("./ifta-tax-calculator.js");
    const result = calculateStateTaxes({
      quarter: 2,
      year: 2026,
      stateMiles: [
        { state: "TX", miles: 1000 },
        { state: "OK", miles: 500 },
      ],
      stateGallons: [
        { state: "TX", gallons: 100 },
        { state: "OK", gallons: 50 },
      ],
    });
    expect(result.fleetMpg).toBe(10);
    const tx = result.rows.find((row) => row.state === "TX");
    expect(tx?.taxable_gallons).toBe(100);
    expect(tx?.net_taxable_gallons).toBe(0);
    expect(tx?.tax_owed).toBe(0);
  });
});

describe("ifta-csv-generator", () => {
  it("emits IFTA column order", async () => {
    const { buildIftaCsvContent } = await import("./ifta-csv-generator.js");
    const csv = buildIftaCsvContent({
      carrierIftaNumber: "IH35",
      quarter: 2,
      year: 2026,
      stateTaxRows: [
        {
          state: "TX",
          miles_in_state: 100,
          taxable_gallons: 10,
          gallons_purchased_in_state: 10,
          net_taxable_gallons: 0,
          tax_rate_per_gallon: 0.2,
          tax_owed: 0,
          mpg_in_state: 10,
        },
      ],
    });
    expect(csv.split("\n")[0]).toBe(
      "Carrier IFTA #,Quarter,Year,State,Total Miles,Taxable Miles,Taxable Gallons,Tax-Paid Gallons,Net Taxable Gallons,Tax Rate,Tax/Credit"
    );
  });
});
