/**
 * GAP-69 — Driver Manager Home Service Unit Tests
 */

import { describe, expect, it } from "vitest";
import { getDriverManagerHomeData } from "../dm-home.service.js";

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

      if (sql.includes("information_schema.columns")) {
        return { rows: [{ ok: false }] };
      }

      if (sql.includes("dispatch.stop_arrivals") && sql.includes("late_count")) {
        return { rows: tableRowMap["dispatch.stop_arrivals"] ?? [] };
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

describe("getDriverManagerHomeData", () => {
  it("returns zeroed KPIs when no tables exist", async () => {
    const client = mockClient({});
    const data = await getDriverManagerHomeData(client, OCI);
    expect(data.kpis.unread_driver_comms).toBe(0);
    expect(data.kpis.late_arrivals_7d).toBe(0);
    expect(data.kpis.pending_settlements).toBe(0);
    expect(data.attention_items).toEqual([]);
    expect(data.computed_at).toBeTruthy();
  });

  it("aggregates KPI counts from available sources", async () => {
    const client = mockClient({
      "mdata.driver_profile_messages": [{ c: "4" }],
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
      "dispatch.stop_arrivals": [
        { driver_id: "d-1", driver_name: "Jane Doe", late_count: "2" },
        { driver_id: "d-2", driver_name: "John Smith", late_count: "1" },
      ],
      "driver_finance.driver_settlements": [{ c: "3" }],
      "dispatch.driver_layovers": [{ c: "2" }],
      "safety.harsh_events": [
        {
          driver_id: "d-1",
          driver_name: "Jane Doe",
          incidents: "2",
          critical_count: "0",
          major_count: "1",
          minor_count: "1",
        },
      ],
    });

    const data = await getDriverManagerHomeData(client, OCI);
    expect(data.kpis.unread_driver_comms).toBe(4);
    expect(data.kpis.late_arrivals_7d).toBe(3);
    expect(data.kpis.pending_settlements).toBe(3);
    expect(data.pending_layovers).toBe(2);
    expect(data.attention_items.length).toBeGreaterThan(0);
  });

  it("sorts attention items by severity rank ascending", async () => {
    const client = mockClient({
      "mdata.driver_profile_messages": [{ c: "12" }],
      "mdata.drivers": [{ c: "1" }],
      "driver_finance.driver_settlements": [{ c: "6" }],
    });

    const data = await getDriverManagerHomeData(client, OCI);
    expect(data.attention_items.length).toBeGreaterThan(0);
    for (let i = 0; i < data.attention_items.length - 1; i++) {
      expect(data.attention_items[i]!.severity_rank).toBeLessThanOrEqual(data.attention_items[i + 1]!.severity_rank);
    }
  });

  it("skips missing sources gracefully", async () => {
    const client = mockClient({
      "driver_finance.driver_settlements": [{ c: "2" }],
    });
    const data = await getDriverManagerHomeData(client, OCI);
    expect(data.kpis.pending_settlements).toBe(2);
    expect(data.kpis.unread_driver_comms).toBe(0);
    expect(data.kpis.late_arrivals_7d).toBe(0);
  });
});
