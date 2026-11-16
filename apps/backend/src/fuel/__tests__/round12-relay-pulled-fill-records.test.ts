/**
 * ROUND 12 (owner 2026-11-15 18:40 CT) — a Relay fill pulled by the daily ingest is recorded from its own Relay lines, on the
 * load the one fuel-to-load rule finds, before any bank match or settlement.
 * Fail-old: 49 fills (11-06 … 11-14) sat in integrations.relay_fuel_transactions with no fuel.fuel_transactions row; E-19/E-21/E-22
 * had nothing to read since 11-11.
 */
import { describe, expect, it } from "vitest";
import { recordPulledRelayFill, relayFillRunVerdict } from "../fuel-expense-document.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FILL = "22222222-2222-4222-8222-222222222222";

function db(opts: { loadAtTime?: string | null; lines?: unknown[]; paid?: number }) {
  const inserts: unknown[][] = [];
  const audits: unknown[][] = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (/^SAVEPOINT|^RELEASE|^ROLLBACK TO/.test(sql.trim())) return { rows: [] };
      if (/audit\.append_event/.test(sql)) { audits.push(values); return { rows: [] }; }
      if (/CROSS JOIN LATERAL \(\s*SELECT COALESCE\(by_unit\.load_id, by_driver\.load_id\)/.test(sql)) {
        return { rows: opts.loadAtTime ? [{ load_id: opts.loadAtTime, load_number: "13740", matched_by: "unit", trailer_id: null, non_owned_trailer_id: null }] : [] };
      }
      if (/\/\* cross_rail_rows \*\//.test(sql)) return { rows: [] };
      if (/FROM fuel\.fuel_transactions\s+WHERE operating_company_id = \$1::uuid AND relay_fuel_transaction_id = \$2::uuid AND voided_at IS NULL AND archived_at IS NULL/.test(sql)) return { rows: [] };
      if (/SELECT transaction_id, relay_created_at::text, location_city AS city/.test(sql)) return { rows: [{ transaction_id: "txn_P", relay_created_at: "2026-11-14T18:00:00+00", city: "Laredo", state: "TX" }] };
      if (/SELECT r\.relay_created_at::text AS at,/.test(sql)) return { rows: [{ at: "2026-11-14T18:00:00+00", unit_id: "u1", driver_id: "d1" }] };
      if (/FROM mdata\.vendors/.test(sql)) return { rows: [{ id: "v0" }] };
      if (/SELECT transaction_id, total_amount_paid_cents::text, fees, ingest_source/.test(sql)) return { rows: [{ transaction_id: "txn_P", total_amount_paid_cents: String(opts.paid ?? 40000), fees: [], ingest_source: "api" }] };
      if (/FROM integrations\.relay_fuel_transaction_lines/.test(sql)) return { rows: opts.lines ?? [{ id: "l1", line_index: 0, fuel_type: "diesel", fuel_product_code: "ULSD", fuel_type_description: "Diesel", volume: "80", volume_uom: "gallons", discounted_price_per_unit_cents: "500", total_discounted_price_cents: "40000", fee_amount_cents: "0" }] };
      if (/INSERT INTO fuel\.fuel_transactions/.test(sql)) { inserts.push(values); return { rows: [{ id: `f${inserts.length}` }] }; }
      return { rows: [] };
    },
  };
  return { client, inserts, audits };
}

const input = { operating_company_id: CO, relay_fill_id: FILL, unit_id: "u1", driver_id: "d1", at: "2026-11-14T18:00:00+00", actor_user_uuid: "sys" };

describe("ROUND 12 — pulled Relay fill gets its fuel record", () => {
  it("records the fill from Relay's lines on the load the truck was running at Relay's moment", async () => {
    const d = db({ loadAtTime: "L-13740" });
    const r = await recordPulledRelayFill(d.client as never, input);
    expect(r).toEqual({ outcome: "recorded", reason: null });
    expect(d.inserts).toHaveLength(1);
    const v = d.inserts[0]!;
    expect(v[2]).toBe("L-13740"); // load_id from the one fuel-to-load rule
    expect(v[3]).toBe("d1");
    expect(v[4]).toBe("u1");
    expect(v[8]).toBe(400); // Relay's discounted amount, never a typed one
    expect(v[10]).toBe("2026-11-14T18:00:00+00");
  });
  it("no load at that moment: still recorded, with the receipt writer's exemption (the closer stamps the load later)", async () => {
    const d = db({ loadAtTime: null });
    const r = await recordPulledRelayFill(d.client as never, input);
    expect(r.outcome).toBe("recorded");
    expect(d.inserts[0]![2]).toBeNull();
  });
  it("lines that do not foot to what Relay paid: refused by name, audited, nothing written", async () => {
    const d = db({ loadAtTime: "L", paid: 99999 });
    const r = await recordPulledRelayFill(d.client as never, input);
    expect(r.outcome).toBe("refused");
    expect(d.inserts).toEqual([]);
  });
  it("the run verdict counts recorded / unchanged as done and refusals as refusals, never failures", () => {
    expect(relayFillRunVerdict([
      { relay_fill_id: "a", outcome: "recorded", reason: null },
      { relay_fill_id: "b", outcome: "unchanged", reason: null },
      { relay_fill_id: "c", outcome: "refused", reason: "x" },
    ])).toEqual({ failures: [], refusals: ["c: x"] });
  });
});
