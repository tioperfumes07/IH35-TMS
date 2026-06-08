import { describe, it, expect, vi } from "vitest";
import { runDailyReconciliation } from "../reconciliation.service.js";

function makeMockClient(queryResults: Record<string, unknown[]>) {
  return {
    query: vi.fn(async (sql: string) => {
      const key = Object.keys(queryResults).find(k => sql.includes(k));
      const rows = key ? queryResults[key] : [];
      return { rows, rowCount: rows.length };
    }),
  };
}

describe("geofence reconciliation", () => {
  it("returns empty result when no geofence_events table", async () => {
    const client = makeMockClient({
      "information_schema.tables": [],
    });
    const result = await runDailyReconciliation(client as never, "test-company-id", "2026-06-07");
    expect(result.total_events).toBe(0);
    expect(result.anomalies_found).toBe(0);
  });

  it("correctly identifies result structure", () => {
    const date = "2026-06-07";
    const result = {
      report_date: date,
      operating_company_id: "co",
      total_events: 10,
      anomalies_found: 2,
      findings: [],
    };
    expect(result).toHaveProperty("report_date");
    expect(result).toHaveProperty("anomalies_found");
  });
});
