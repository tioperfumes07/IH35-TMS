/**
 * GAP-68 — Safety Officer Home Service Unit Tests
 */

import { describe, expect, it } from "vitest";
import { getSafetyHomeData } from "../safety-home.service.js";

type MockRows = Record<string, unknown>[];

function mockClient(tableRowMap: Record<string, MockRows>) {
  return {
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("to_regclass")) {
        if (Array.isArray(values) && typeof values[0] === "string") {
          const exists = values[0] in tableRowMap;
          return { rows: [{ ok: exists }] };
        }
        const inlineMatch = sql.match(/to_regclass\('([^']+)'\)/);
        if (inlineMatch) {
          return { rows: [{ ok: inlineMatch[1] in tableRowMap }] };
        }
        return { rows: [{ ok: false }] };
      }

      if (sql.includes("mdata.drivers") && sql.includes("cdl_expires_at")) {
        return { rows: tableRowMap["mdata.drivers"] ?? [] };
      }

      for (const [table, rows] of Object.entries(tableRowMap)) {
        if (sql.includes(table)) {
          return { rows };
        }
      }
      return { rows: [] };
    },
  };
}

const OCI = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("getSafetyHomeData", () => {
  it("returns zeroed KPIs when no tables exist", async () => {
    const client = mockClient({});
    const data = await getSafetyHomeData(client, OCI);
    expect(data.kpis.open_dvir_major_defects).toBe(0);
    expect(data.kpis.hos_violations_today).toBe(0);
    expect(data.alerts).toEqual([]);
    expect(data.computed_at).toBeTruthy();
  });

  it("aggregates KPI counts from available sources", async () => {
    const client = mockClient({
      "safety.dvir_defects": [{ c: "3" }],
      "safety.hos_violations": [{ c: "2" }],
      "safety.accident_reports": [{ open_count: "1", pending_investigations: "1" }],
      "safety.da_random_pool_draws": [{ c: "1" }],
      "safety.csa_scores": [{ c: "2" }],
      "safety.workers_comp_claims": [{ c: "1" }],
      "mdata.drivers": [
        {
          driver_uuid: "d-1",
          driver_name: "Jane Doe",
          cdl_expires_at: "2026-06-15",
          medical_card_expires_at: null,
          hazmat_endorsement_expires_at: null,
          twic_expires_at: null,
          passport_expires_at: null,
          drug_test_due_date: null,
        },
      ],
    });

    const data = await getSafetyHomeData(client, OCI);
    expect(data.kpis.open_dvir_major_defects).toBe(3);
    expect(data.kpis.hos_violations_today).toBe(2);
    expect(data.kpis.open_accidents_7d).toBe(1);
    expect(data.kpis.pending_da_draws).toBe(1);
    expect(data.kpis.open_workers_comp_claims).toBe(1);
    expect(data.kpis.expiring_certs_30d).toBeGreaterThanOrEqual(0);
  });

  it("sorts alerts by severity rank ascending", async () => {
    const client = mockClient({
      "safety.dvir_defects": [{ c: "6" }],
      "safety.hos_violations": [{ c: "1" }],
      "safety.accident_reports": [{ open_count: "2", pending_investigations: "1" }],
    });

    const data = await getSafetyHomeData(client, OCI);
    expect(data.alerts.length).toBeGreaterThan(0);
    for (let i = 0; i < data.alerts.length - 1; i++) {
      expect(data.alerts[i]!.severity_rank).toBeLessThanOrEqual(data.alerts[i + 1]!.severity_rank);
    }
  });

  it("skips missing sources gracefully", async () => {
    const client = mockClient({
      "safety.hos_violations": [{ c: "4" }],
    });
    const data = await getSafetyHomeData(client, OCI);
    expect(data.kpis.hos_violations_today).toBe(4);
    expect(data.kpis.open_dvir_major_defects).toBe(0);
  });
});
