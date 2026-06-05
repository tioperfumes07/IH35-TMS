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
