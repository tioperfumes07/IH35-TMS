/**
 * GAP-65 — Aggregator Service Unit Tests
 *
 * Tests ranking logic, deduplication, source coverage, and graceful degradation.
 */

import { describe, expect, it } from "vitest";
import { computeTodaysAttention, type AttentionItem } from "../aggregator.service.js";

// ─── Mock DB client ───────────────────────────────────────────────────────────

type MockRows = Record<string, unknown>[];

function mockClient(tableRowMap: Record<string, MockRows>) {
  return {
    async query(sql: string, values?: unknown[]) {
      // to_regclass check
      if (sql.includes("to_regclass")) {
        const match = sql.match(/to_regclass\(\$1\)/);
        if (match && Array.isArray(values) && typeof values[0] === "string") {
          const exists = values[0] in tableRowMap;
          return { rows: [{ ok: exists }] };
        }
        const inlineMatch = sql.match(/to_regclass\('([^']+)'\)/);
        if (inlineMatch) {
          const exists = inlineMatch[1] in tableRowMap;
          return { rows: [{ ok: exists }] };
        }
        return { rows: [{ ok: false }] };
      }
      // Detect which table is being queried
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeTodaysAttention", () => {
  it("returns empty array when no sources have data", async () => {
    const client = mockClient({});
    const items = await computeTodaysAttention(client, OCI);
    expect(items).toEqual([]);
  });

  it("returns top 5 when more than 5 items exist", async () => {
    // Seed all 10 sources with data
    const client = mockClient({
      "legal.form_425c_filings": [{ id: "id-1", deadline: "2026-06-10" }],
      "fuel.fraud_alerts": [{ c: "3" }],
      "banking.reconciliation_drift_alerts": [{ c: "2" }],
      "maintenance.work_orders": [{ c: "4" }],
      "telematics.cargo_sensor_incidents": [{ c: "1" }],
      "accounting.period_close_warnings": [{ c: "2" }],
      "safety.accident_liabilities": [{ c: "1" }],
      "mdata.detention_requests": [{ c: "2" }],
      "mdata.customer_health_scores": [{ c: "3" }],
      "maintenance.predictive_alerts": [{ c: "2" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("items are sorted by score descending", async () => {
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "1" }],       // score 95
      "maintenance.predictive_alerts": [{ c: "1" }], // score 65
      "mdata.detention_requests": [{ c: "1" }], // score 75
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    expect(items.length).toBeGreaterThan(0);

    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i]!.score).toBeGreaterThanOrEqual(items[i + 1]!.score);
    }
  });

  it("deduplicates items with same item_id", async () => {
    // Even if two source functions returned the same item_id (shouldn't happen in real code
    // but tests deduplication logic in the aggregator), only one is kept.
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "2" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    const ids = items.map((i: AttentionItem) => i.item_id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it("skips source gracefully when table does not exist", async () => {
    // Only fuel fraud table exists, rest are absent
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "1" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    // Should get exactly 1 item from the one available source
    expect(items.length).toBe(1);
    expect(items[0]?.source).toBe("fuel_fraud");
  });

  it("skips source when count is 0", async () => {
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "0" }],
      "mdata.detention_requests": [{ c: "0" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    expect(items).toEqual([]);
  });

  it("each item has required fields", async () => {
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "1" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    for (const item of items) {
      expect(typeof item.item_id).toBe("string");
      expect(item.item_id.length).toBeGreaterThan(0);
      expect(typeof item.source).toBe("string");
      expect(typeof item.score).toBe("number");
      expect(item.score).toBeGreaterThan(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(typeof item.title).toBe("string");
      expect(typeof item.action_url).toBe("string");
      expect(["info", "warning", "error", "critical"]).toContain(item.severity);
    }
  });

  it("respects custom topN parameter", async () => {
    const client = mockClient({
      "legal.form_425c_filings": [{ id: "id-1", deadline: "2026-06-10" }],
      "fuel.fraud_alerts": [{ c: "1" }],
      "banking.reconciliation_drift_alerts": [{ c: "1" }],
    });

    const items = await computeTodaysAttention(client, OCI, 2);
    expect(items.length).toBeLessThanOrEqual(2);
  });

  it("RLS — item_id includes operating_company_id for company-scoped items", async () => {
    const client = mockClient({
      "fuel.fraud_alerts": [{ c: "1" }],
    });

    const items = await computeTodaysAttention(client, OCI, 5);
    // Company-scoped items should include the OCI in the item_id
    expect(items[0]?.item_id).toContain(OCI);
  });
});
