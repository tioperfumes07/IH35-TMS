/**
 * ROUND 12 E-05 — a stop written before its load existed gets its load by the one rule later; a stop that names a load
 * is never moved. Fail-old: 668 stops (45 loads) stayed NULL, so 72 delivered loads had no real-driven legs.
 */
import { describe, expect, it } from "vitest";
import { reattributeStopEventLoads } from "../unit-stop-events.writer.js";

describe("reattributeStopEventLoads", () => {
  it("only fills NULL load_id_at_time, through loadAtTimeSql, inside the day window, for one company", async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const client = { query: async (sql: string, params: unknown[] = []) => { seen.push({ sql, params }); return { rows: [{ id: "a" }, { id: "b" }] }; } };
    const r = await reattributeStopEventLoads(client as never, "5c854333-6ea5-4faa-af31-67cb272fef80", { days: 500 });
    expect(r).toEqual({ attributed: 2 });
    const { sql, params } = seen[0]!;
    expect(sql).toMatch(/SET load_id_at_time = hit\.load_id/);
    expect(sql).toMatch(/e2\.load_id_at_time IS NULL/);
    expect(sql).toMatch(/WHERE e\.id = hit\.id AND e\.load_id_at_time IS NULL/);
    expect(sql).toMatch(/load_at_time/); // the one load-at-time rule, never re-inlined by hand
    expect(params).toEqual(["5c854333-6ea5-4faa-af31-67cb272fef80", 120]); // window clamped to 120 days
  });
});
