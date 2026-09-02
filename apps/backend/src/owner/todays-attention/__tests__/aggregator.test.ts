import { describe, expect, it } from "vitest";
import { ATTENTION_SOURCE_COUNT, computeTodaysAttention, type AttentionItem } from "../aggregator.service.js";

type MockRows = Record<string, unknown>[];

function mockClient(tableRowMap: Record<string, MockRows>) {
  return {
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("to_regclass")) {
        if (sql.includes("to_regclass($1)") && Array.isArray(values) && typeof values[0] === "string") {
          return { rows: [{ ok: values[0] in tableRowMap }] };
        }
        const m = sql.match(/to_regclass\('([^']+)'\)/);
        if (m) return { rows: [{ ok: m[1] in tableRowMap }] };
        return { rows: [{ ok: false }] };
      }
      for (const [table, rows] of Object.entries(tableRowMap)) {
        if (sql.includes(table)) return { rows };
      }
      return { rows: [] };
    },
  };
}

const OCI = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("computeTodaysAttention", () => {
  it("returns source stats when no sources have data", async () => {
    const result = await computeTodaysAttention(mockClient({}), OCI);
    expect(result.items).toEqual([]);
    expect(result.totalSources).toBe(ATTENTION_SOURCE_COUNT);
    expect(result.sourcesRan + result.sourcesSkipped).toBe(ATTENTION_SOURCE_COUNT);
  });

  it("tracks skipped sources in sourcesSkipped and skippedSources", async () => {
    const result = await computeTodaysAttention(mockClient({ "fuel.fraud_alerts": [{ c: "1" }] }), OCI, 5);
    expect(result.items.length).toBe(1);
    expect(result.sourcesRan).toBe(1);
    expect(result.skippedSources.length).toBeGreaterThan(0);
  });

  it("items are sorted by score descending", async () => {
    const result = await computeTodaysAttention(
      mockClient({
        "fuel.fraud_alerts": [{ c: "1" }],
        "maintenance.predictive_alerts": [{ c: "1" }],
        "dispatch.detention_requests": [{ c: "1" }],
      }),
      OCI,
      5
    );
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i]!.score).toBeGreaterThanOrEqual(result.items[i + 1]!.score);
    }
  });

  it("deduplicates items with same item_id", async () => {
    const result = await computeTodaysAttention(mockClient({ "fuel.fraud_alerts": [{ c: "2" }] }), OCI, 5);
    const ids = result.items.map((i: AttentionItem) => i.item_id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("RLS — item_id includes operating_company_id", async () => {
    const result = await computeTodaysAttention(mockClient({ "fuel.fraud_alerts": [{ c: "1" }] }), OCI, 5);
    expect(result.items[0]?.item_id).toContain(OCI);
  });
});
