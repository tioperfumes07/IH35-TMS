/**
 * ENG-65 (LEAD 11-03) — a Relay fill is recorded from its own Relay lines even when no settlement ever names it.
 * Fail-old: 48 posted Relay fill documents ($16,421.01) had no fuel record at all; only the Settlement Creator wrote them.
 */
import { describe, expect, it } from "vitest";
import { ensureRelayFillFuelRecords } from "../relay-fill-fuel-rows.js";
import { recordRelayFillAtReceipt } from "../fuel-expense-document.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FILL = "11111111-1111-4111-8111-111111111111";

function db(opts: { relayUnit?: string | null; relayDriver?: string | null; live?: Array<{ id: string; fuel_type: string }>; relayAt?: string | null; vendors?: number; loadUnit?: string | null; lines?: unknown[]; paid?: number; otherRail?: Array<{ fuel_transaction_id: string; card: string | null }> }) {
  const calls: string[] = [];
  const inserts: unknown[][] = [];
  const audits: unknown[][] = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push(sql.trim().slice(0, 40));
      if (/^SAVEPOINT|^RELEASE|^ROLLBACK TO/.test(sql.trim())) return { rows: [] };
      if (/audit\.append_event/.test(sql)) { audits.push(values); return { rows: [] }; }
      if (/\/\* cross_rail_rows \*\//.test(sql)) return { rows: opts.otherRail ?? [] };
      if (/FROM fuel\.fuel_transactions\s+WHERE operating_company_id = \$1::uuid AND relay_fuel_transaction_id = \$2::uuid AND voided_at IS NULL AND archived_at IS NULL/.test(sql)) return { rows: opts.live ?? [] };
      if (/SELECT transaction_id, relay_created_at::text, location_city AS city/.test(sql)) return { rows: [{ transaction_id: "txn_A", relay_created_at: opts.relayAt === undefined ? "2026-09-03T20:15:00+00" : opts.relayAt, city: "Natalia", state: "TX" }] };
      if (/SELECT r\.relay_created_at::text AS at,/.test(sql)) return { rows: [{ at: opts.relayAt ?? "2026-09-03T20:15:00+00", unit_id: opts.relayUnit ?? null, driver_id: opts.relayDriver ?? null }] };
      if (/FROM mdata\.vendors/.test(sql)) return { rows: Array.from({ length: opts.vendors ?? 1 }, (_, i) => ({ id: `v${i}` })) };
      if (/SELECT assigned_unit_id::text AS u FROM mdata\.loads/.test(sql)) return { rows: [{ u: opts.loadUnit ?? null }] };
      if (/SELECT transaction_id, total_amount_paid_cents::text, fees, ingest_source/.test(sql)) return { rows: [{ transaction_id: "txn_A", total_amount_paid_cents: String(opts.paid ?? 50000), fees: [], ingest_source: "api" }] };
      if (/FROM integrations\.relay_fuel_transaction_lines/.test(sql)) return { rows: opts.lines ?? [{ id: "l1", line_index: 0, fuel_type: "diesel", fuel_product_code: "ULSD", fuel_type_description: "Diesel", volume: "100", volume_uom: "gallons", discounted_price_per_unit_cents: "500", total_discounted_price_cents: "50000", fee_amount_cents: "0" }] };
      if (/INSERT INTO fuel\.fuel_transactions/.test(sql)) { inserts.push(values); return { rows: [{ id: `f${inserts.length}` }] }; }
      return { rows: [] };
    },
  };
  return { client, calls, inserts, audits };
}

describe("ENG-65 ensureRelayFillFuelRecords", () => {
  it("returns the fill's live records and writes nothing when it has them", async () => {
    const d = db({ live: [{ id: "x", fuel_type: "diesel" }] });
    const r = await ensureRelayFillFuelRecords(d.client as never, { operatingCompanyId: CO, relayFillId: FILL, loadId: null, driverId: "d", unitId: "u", actorUserId: "a", notes: "n" });
    expect(r).toEqual({ written: false, rows: [{ id: "x", fuel_type: "diesel" }] });
    expect(d.inserts).toEqual([]);
  });
  it("writes the records from Relay's own lines at Relay's moment, referenced by the Relay transaction id", async () => {
    const d = db({});
    const r = await ensureRelayFillFuelRecords(d.client as never, { operatingCompanyId: CO, relayFillId: FILL, loadId: "L", driverId: "d", unitId: "u", actorUserId: "a", notes: "n" });
    expect(r.written).toBe(true);
    expect(d.inserts).toHaveLength(1);
    const v = d.inserts[0]!;
    expect(v[8]).toBe(500); // total_cost dollars from the line
    expect(v[10]).toBe("2026-09-03T20:15:00+00"); // relay_created_at
    expect(v[11]).toBe("txn_A");
  });
  it("ACCT-F11105: refuses by name, writing nothing, when another rail already records the purchase (any truck)", async () => {
    const d = db({ otherRail: [{ fuel_transaction_id: "dream-1", card: "DREAMLINE" }] });
    await expect(ensureRelayFillFuelRecords(d.client as never, { operatingCompanyId: CO, relayFillId: FILL, loadId: "L", driverId: "d", unitId: "u", actorUserId: "a", notes: "n" }))
      .rejects.toMatchObject({ code: "relay_fill_recorded_on_other_rail" });
    expect(d.inserts).toEqual([]);
  });
  it("ACCT-F11105: the cross-rail test is asked before any write", async () => {
    const d = db({});
    await ensureRelayFillFuelRecords(d.client as never, { operatingCompanyId: CO, relayFillId: FILL, loadId: "L", driverId: "d", unitId: "u", actorUserId: "a", notes: "n" });
    const asked = d.calls.findIndex((c) => c.startsWith("/* cross_rail_rows */"));
    const wrote = d.calls.findIndex((c) => c.startsWith("INSERT INTO fuel.fuel_transactions"));
    expect(asked).toBeGreaterThanOrEqual(0);
    expect(asked).toBeLessThan(wrote);
  });
  it("never stamps a guessed moment", async () => {
    const d = db({ relayAt: null });
    await expect(ensureRelayFillFuelRecords(d.client as never, { operatingCompanyId: CO, relayFillId: FILL, loadId: null, driverId: "d", unitId: "u", actorUserId: "a", notes: "n" }))
      .rejects.toMatchObject({ code: "relay_fill_no_moment" });
  });
});

describe("ENG-65 recordRelayFillAtReceipt", () => {
  it("refuses by name, audited, when no truck can be named (TIER1)", async () => {
    const d = db({ loadUnit: null });
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: "L", driver_id: "d", unit_id: null, actor_user_uuid: null });
    expect(r.written).toBe(false);
    expect(r.refused).toMatch(/^relay_fill_unit_unknown/);
    expect(d.audits).toHaveLength(1);
    expect(d.inserts).toEqual([]);
  });
  it("refuses by name when no driver can be named (TIER1) — never inserts a driverless fill", async () => {
    const d = db({});
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: null, driver_id: null, unit_id: "u", actor_user_uuid: null });
    expect(r.refused).toMatch(/^relay_fill_driver_unknown/);
    expect(d.inserts).toEqual([]);
  });
  it("records inside a savepoint and rolls back a refused write (lines that do not foot)", async () => {
    const d = db({ paid: 60000 });
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: "L", driver_id: "d", unit_id: "u", actor_user_uuid: null });
    expect(r.refused).toMatch(/^relay_fill_lines_do_not_foot/);
    expect(d.calls.some((c) => c.startsWith("ROLLBACK TO SAVEPOINT relay_fill_rec"))).toBe(true);
    expect(d.inserts).toEqual([]);
  });
  it("ACCT-F11125: Relay's own driver match names the driver (txn_2gAW9V27xqzpYB shape: truck on the document, no driver)", async () => {
    const d = db({ relayDriver: "relay-driver" });
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: "L", driver_id: null, unit_id: "u", actor_user_uuid: null });
    expect(r).toEqual({ written: true, refused: null });
    expect(d.inserts[0]![3]).toBe("relay-driver");
  });
  it("ACCT-F11125: Relay's own truck match (a truck of this company) names the truck when the document and load have none", async () => {
    const d = db({ relayUnit: "relay-unit" });
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: null, driver_id: "d", unit_id: null, actor_user_uuid: null });
    expect(r).toEqual({ written: true, refused: null });
    expect(d.inserts[0]![4]).toBe("relay-unit");
  });
  it("writes when truck and driver are known", async () => {
    const d = db({});
    const r = await recordRelayFillAtReceipt(d.client as never, { operating_company_id: CO, relay_fill_id: FILL, load_id: "L", driver_id: "d", unit_id: "u", actor_user_uuid: null });
    expect(r).toEqual({ written: true, refused: null });
    expect(d.inserts).toHaveLength(1);
  });
});
