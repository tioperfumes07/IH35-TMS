/**
 * LEAD 443.185 G7 — fail-old: the Relay ingest bridge and the Relay load rematch asked a load-only wrapper
 * (resolveLoadId) and wrote NO trailer, while every other fuel writer took the trailer from the one rule's hit.
 * Now both ask resolveFuelLoadAtTime and write its trailer_id. Synthetic ids only.
 */
import { describe, expect, it } from "vitest";
import { bridgeRelayFuelToCanonical } from "../relay-fuel-canonical-bridge.js";
import { rematchRelayFuelLoads } from "../relay-fuel-load-rematch.service.js";

const CO = "00000000-0000-4000-8000-000000000001";
const UNIT = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const LOAD = "44444444-4444-4444-8444-444444444444";
const TRAILER = "55555555-5555-4555-8555-555555555555";
const FT = "66666666-6666-4666-8666-666666666666";

function client(captured: Array<{ sql: string; values?: unknown[] }>) {
  return {
    query: async (sql: string, values?: unknown[]) => {
      captured.push({ sql, values });
      if (/AS non_owned_trailer_id/.test(sql)) {
        return { rows: [{ load_id: LOAD, load_number: "13999", matched_by: "unit", trailer_id: TRAILER, non_owned_trailer_id: null }] };
      }
      if (/FROM fuel\.fuel_transactions/.test(sql) && /load_id IS NULL/.test(sql) && !/UPDATE/.test(sql) && !/journal_entry_postings/.test(sql)) {
        return { rows: [{ id: FT, operating_company_id: CO, driver_id: DRIVER, unit_id: UNIT, transaction_at: "2026-10-10T12:00:00Z" }] };
      }
      if (/INSERT INTO fuel\.fuel_transactions/.test(sql)) return { rows: [{ id: FT }] };
      if (/UPDATE fuel\.fuel_transactions/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [] };
    },
  } as never;
}

describe("Relay fuel writers take load + trailer from the one rule", () => {
  it("the ingest bridge writes the load's trailer", async () => {
    const captured: Array<{ sql: string; values?: unknown[] }> = [];
    await bridgeRelayFuelToCanonical(
      client(captured),
      CO,
      { transaction_id: "txn_synthetic", created_at: "2026-10-10T12:00:00Z", total_amount_paid: "100.00", fuel_items: [], merchant: null, location: null } as never,
      { driver_id: DRIVER, unit_id: UNIT }
    );
    const ins = captured.find((c) => /INSERT INTO fuel\.fuel_transactions/.test(c.sql))!;
    expect(ins.sql).toMatch(/trailer_id/);
    expect(ins.values).toContain(LOAD);
    expect(ins.values).toContain(TRAILER);
  });

  it("the rematch writes the trailer beside the load (fill-null only)", async () => {
    const captured: Array<{ sql: string; values?: unknown[] }> = [];
    const r = await rematchRelayFuelLoads(client(captured), { operating_company_id: CO });
    expect(r.updated).toBe(1);
    const up = captured.find((c) => /UPDATE fuel\.fuel_transactions/.test(c.sql))!;
    expect(up.sql).toMatch(/trailer_id = COALESCE\(trailer_id, \$3::uuid\)/);
    expect(up.values).toEqual([LOAD, FT, TRAILER]);
  });
});
