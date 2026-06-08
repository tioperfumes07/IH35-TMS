import { describe, expect, it, vi } from "vitest";
import { calculatePerTruckCpm } from "../cpm-calculator.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function mockClient(rows: Record<string, unknown>[]) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  };
}

describe("cpm-calculator (GAP-45)", () => {
  it("computes CPM from miles and total cost", async () => {
    const client = mockClient([
      { unit_uuid: "u1", display_id: "TRK-101", miles: "1000", total_cost_cents: "250000" },
      { unit_uuid: "u2", display_id: "TRK-102", miles: "500", total_cost_cents: "100000" },
    ]);
    const rows = await calculatePerTruckCpm(client, COMPANY, "2026-01-01", "2026-03-31");
    expect(rows).toHaveLength(2);
    expect(rows[0].cpm_cents).toBe(200);
    expect(rows[0].rank).toBe(1);
    expect(String(client.query.mock.calls[0]?.[0])).toContain("operating_company_id = $1::uuid");
  });

  it("returns zero CPM when unit has no miles", async () => {
    const client = mockClient([{ unit_uuid: "u1", display_id: "TRK-101", miles: "0", total_cost_cents: "50000" }]);
    const rows = await calculatePerTruckCpm(client, COMPANY, "2026-01-01", "2026-01-31");
    expect(rows[0].cpm_cents).toBe(0);
  });

  it("handles unit with no costs", async () => {
    const client = mockClient([{ unit_uuid: "u1", display_id: "TRK-101", miles: "100", total_cost_cents: "0" }]);
    const rows = await calculatePerTruckCpm(client, COMPANY, "2026-01-01", "2026-01-31");
    expect(rows[0].total_cost_cents).toBe(0);
    expect(rows[0].cpm_cents).toBe(0);
  });
});
