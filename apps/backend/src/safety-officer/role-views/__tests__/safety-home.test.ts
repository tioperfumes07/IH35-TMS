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
      // pending DA draws now read from safety.da_test_records.result='pending' (real source);
      // safety.da_random_pool_draws has no `status` column (§4 landmine, migration 0327).
      "safety.da_test_records": [{ c: "1" }],
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

  it("deep-links alerts to the sole driver/unit when count(DISTINCT) === 1", async () => {
    const DRIVER = "11111111-1111-1111-1111-111111111111";
    const UNIT = "22222222-2222-2222-2222-222222222222";
    const client = mockClient({
      "safety.dvir_defects": [{ c: "2", distinct_units: "1", sole_unit: UNIT }],
      "safety.hos_violations": [{ c: "1", distinct_drivers: "1", sole_driver: DRIVER }],
      "safety.accident_reports": [
        {
          open_count: "1",
          distinct_drivers: "1",
          sole_driver: DRIVER,
          distinct_units: "1",
          sole_unit: UNIT,
        },
      ],
      "safety.da_test_records": [{ c: "1", distinct_drivers: "1", sole_driver: DRIVER }],
    });

    const data = await getSafetyHomeData(client, OCI);
    const byId = Object.fromEntries(data.alerts.map((a) => [a.alert_id, a]));

    expect(byId.dvir_major_defects?.action_url).toBe(`/fleet/units/${UNIT}`);
    expect(byId.dvir_major_defects?.subject_unit_id).toBe(UNIT);

    expect(byId.hos_violations_today?.action_url).toBe(`/drivers/${DRIVER}`);
    expect(byId.hos_violations_today?.subject_driver_id).toBe(DRIVER);

    expect(byId.accidents_7d?.action_url).toBe(`/drivers/${DRIVER}`);
    expect(byId.accidents_7d?.subject_driver_id).toBe(DRIVER);

    expect(byId.da_random_draws?.action_url).toBe(`/drivers/${DRIVER}`);
    expect(byId.da_random_draws?.subject_driver_id).toBe(DRIVER);

    // Never a bare /safety.
    for (const alert of data.alerts) {
      expect(alert.action_url).not.toBe("/safety");
    }
  });
});
