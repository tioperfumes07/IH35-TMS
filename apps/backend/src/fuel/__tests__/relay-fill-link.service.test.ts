import { describe, expect, it, vi } from "vitest";
import { linkRelayFillToSettlementFuelRows, linkSettlementFuelRowToRelayFill } from "../relay-fill-link.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
function client(candidates: Array<Record<string, string>>) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (/^\s*SELECT/i.test(sql)) return { rows: candidates };
      return { rows: [], rowCount: 1 };
    }),
  };
}

describe("ACCT-F403 — a settlement fuel row links to the Relay fill it describes, by one rule, only when exactly one proves it", () => {
  it("links when exactly one fill matches (same truck, day +-1, product, gallons)", async () => {
    const c = client([{ rid: "fill-1" }]);
    const r = await linkSettlementFuelRowToRelayFill(c as never, CO, "fuel-1");
    expect(r).toEqual({ linked: "fill-1", candidates: 1 });
    expect(c.calls.some((x) => /UPDATE fuel\.fuel_transactions SET relay_fuel_transaction_id/.test(x.sql))).toBe(true);
    const sel = c.calls[0].sql;
    expect(sel).toMatch(/abs\(COALESCE\(r\.relay_created_at, r\.created_at\)::date - f\.transaction_at::date\) <= 1/);
    expect(sel).toMatch(/< 0\.6/);
    expect(sel).toMatch(/HAVING count\(\*\) = 1/);
  });
  it("links nothing when two fills match (never guessed)", async () => {
    const c = client([{ rid: "fill-1" }, { rid: "fill-2" }]);
    expect(await linkSettlementFuelRowToRelayFill(c as never, CO, "fuel-1")).toEqual({ linked: null, candidates: 2 });
    expect(c.calls.some((x) => /^\s*UPDATE/i.test(x.sql))).toBe(false);
  });
  it("from the fill side: one row per product links, an ambiguous product does not", async () => {
    const c = client([{ fid: "f-diesel", product: "diesel" }, { fid: "f-def-1", product: "def" }, { fid: "f-def-2", product: "def" }]);
    const out = await linkRelayFillToSettlementFuelRows(c as never, CO, "fill-1");
    expect(out).toContainEqual({ linked: "f-diesel", candidates: 1 });
    expect(out).toContainEqual({ linked: null, candidates: 2 });
    expect(c.calls.filter((x) => /^\s*UPDATE/i.test(x.sql))).toHaveLength(1);
  });
});
