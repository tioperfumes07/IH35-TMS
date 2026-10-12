import { describe, expect, it, vi } from "vitest";
import {
  mapFuelCardRows,
  normalizeFuelType,
  computeFuelRowHash,
  importFuelCardTransactionsForCompany,
  resolveLoadId,
  type DbClient,
} from "../fuel-transaction-import.js";

const COMPANY = "00000000-0000-4000-8000-000000000001";
const UNIT_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_ID = "33333333-3333-4333-8333-333333333333";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";

describe("mapFuelCardRows", () => {
  it("maps a fleet-card transaction row into a typed import row", () => {
    const parsed = mapFuelCardRows([
      {
        transaction_date: "2026-06-15T14:32:00Z",
        transaction_id: "TXN-9001",
        card_number: "6001-1234",
        unit: "TRK-102",
        driver: "Juan Perez",
        merchant: "Love's #123",
        city: "Laredo",
        state: "tx",
        product: "ULSD Diesel",
        gallons: "112.500",
        ppg: "3.459",
        total_amount: "$389.14",
      },
    ]);
    expect(parsed.dead_letters).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0]!;
    expect(row).toMatchObject({
      transaction_reference: "TXN-9001",
      card_number: "6001-1234",
      unit_number: "TRK-102",
      driver_name: "Juan Perez",
      merchant: "Love's #123",
      location_city: "Laredo",
      location_state: "TX",
      fuel_type: "diesel",
      gallons: 112.5,
      price_per_gallon: 3.459,
      total_cost: 389.14,
    });
    expect(row.source_row_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dead-letters rows missing date or amount without crashing", () => {
    const parsed = mapFuelCardRows([
      { transaction_date: "2026-06-15", total_amount: "100.00" }, // ok
      { transaction_date: "", total_amount: "50.00" }, // no date
      { transaction_date: "2026-06-16", total_amount: "" }, // no amount
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.dead_letters).toHaveLength(2);
    expect(parsed.dead_letters[0]?.line_number).toBe(3);
  });

  it("normalizes fuel types and defaults to diesel", () => {
    expect(normalizeFuelType("DEF")).toBe("def");
    expect(normalizeFuelType("Reefer")).toBe("reefer_diesel");
    expect(normalizeFuelType("Unleaded")).toBe("gas");
    expect(normalizeFuelType("")).toBe("diesel");
    expect(normalizeFuelType("mystery")).toBe("other");
  });

  it("produces a stable hash keyed on provider reference", () => {
    const a = computeFuelRowHash({
      transaction_at: "2026-06-15T00:00:00Z",
      transaction_reference: "TXN-1",
      card_number: "x",
      unit_number: "u",
      total_cost: 10,
      gallons: 3,
    });
    const b = computeFuelRowHash({
      transaction_at: "2026-06-15T00:00:00Z",
      transaction_reference: "TXN-1",
      card_number: "DIFFERENT",
      unit_number: "DIFFERENT",
      total_cost: 999,
      gallons: 999,
    });
    expect(a).toBe(b); // same reference => same hash (dedupe by provider ref)
  });
});

type Captured = { sql: string; values?: unknown[] };

function makeClient(opts: {
  unitId?: string | null;
  driverId?: string | null;
  vendorId?: string | null;
  loadId?: string | null;
  /** The load's company trailer the one trailer rule returns with the load (443.110 G7). */
  trailerId?: string | null;
  insertRowCount?: number;
  captured: Captured[];
}): DbClient {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      opts.captured.push({ sql, values });
      // 443.110 G7 — the one fuel-to-load rule (fuel-load-at-time.ts): unit lateral, then driver lateral.
      if (sql.includes("by_unit") && sql.includes("by_driver")) {
        return opts.loadId
          ? { rows: [{ load_id: opts.loadId, load_number: "L1", matched_by: "unit", trailer_id: opts.trailerId ?? null, non_owned_trailer_id: null }] }
          : { rows: [{ load_id: null, load_number: null, matched_by: null, trailer_id: null, non_owned_trailer_id: null }] };
      }
      if (sql.includes("FROM mdata.units")) {
        return opts.unitId ? { rows: [{ id: opts.unitId }] } : { rows: [] };
      }
      if (sql.includes("FROM mdata.drivers")) {
        return opts.driverId ? { rows: [{ id: opts.driverId }] } : { rows: [] };
      }
      if (sql.includes("FROM mdata.vendors")) {
        return opts.vendorId ? { rows: [{ id: opts.vendorId }] } : { rows: [] };
      }
      if (sql.includes("INSERT INTO fuel.fuel_transactions")) {
        const rc = opts.insertRowCount ?? 1;
        return { rows: rc > 0 ? [{ id: "new-id" }] : [], rowCount: rc };
      }
      return { rows: [] };
    }),
  } as unknown as DbClient;
}

function insertCall(captured: Captured[]): Captured {
  const found = captured.find((c) => c.sql.includes("INSERT INTO fuel.fuel_transactions"));
  if (!found) throw new Error("no insert captured");
  return found;
}

describe("importFuelCardTransactionsForCompany", () => {
  const parsed = mapFuelCardRows([
    {
      transaction_date: "2026-06-15T14:32:00Z",
      transaction_id: "TXN-9001",
      unit: "TRK-102",
      driver: "Juan Perez",
      merchant: "Love's #123",
      city: "Laredo",
      state: "TX",
      product: "Diesel",
      gallons: "112.5",
      ppg: "3.459",
      total_amount: "389.14",
    },
  ]);

  it("persists a fuel transaction with resolved unit/driver/vendor/load FKs (G18 load link)", async () => {
    const captured: Captured[] = [];
    const client = makeClient({
      unitId: UNIT_ID,
      driverId: DRIVER_ID,
      vendorId: VENDOR_ID,
      loadId: LOAD_ID,
      captured,
    });

    const counts = await importFuelCardTransactionsForCompany(client, COMPANY, parsed, {
      userId: "user-1",
      sourceFileName: "loves-june.csv",
    });

    expect(counts.rows_inserted).toBe(1);
    expect(counts.rows_unlinked_to_load).toBe(0);
    expect(counts.gl_post_candidates).toHaveLength(1);
    expect(counts.gl_post_candidates[0]).toMatchObject({
      operating_company_id: COMPANY,
      fuel_transaction_id: "new-id",
      fuel_type: "diesel",
      amount_cents: 38914,
      actor_user_id: "user-1",
    });

    const ins = insertCall(captured);
    const v = ins.values!;
    // positional args: $1 company, $2 txn_at, $3 load_id, $4 driver_id, $5 unit_id, $6 vendor_id
    expect(v[0]).toBe(COMPANY);
    expect(v[2]).toBe(LOAD_ID); // G18: load FK present
    expect(v[3]).toBe(DRIVER_ID);
    expect(v[4]).toBe(UNIT_ID);
    expect(v[5]).toBe(VENDOR_ID);
    // $16 load_exemption_reason must be null when a load is linked
    expect(v[15]).toBeNull();
    expect(ins.sql).toContain("ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING");
  });

  it("flags a G18 gap with an exemption reason when no load resolves", async () => {
    const captured: Captured[] = [];
    const client = makeClient({
      unitId: UNIT_ID,
      driverId: DRIVER_ID,
      vendorId: null,
      loadId: null, // no load matched
      captured,
    });

    const counts = await importFuelCardTransactionsForCompany(client, COMPANY, parsed);

    expect(counts.rows_inserted).toBe(1);
    expect(counts.rows_unlinked_to_load).toBe(1);

    const ins = insertCall(captured);
    const v = ins.values!;
    expect(v[2]).toBeNull(); // no load
    // load_exemption_reason set and >= 20 chars (satisfies enforce_load_fk_invariant)
    const reason = v[15] as string;
    expect(reason).toBeTruthy();
    expect(reason.length).toBeGreaterThanOrEqual(20);
  });

  it("is idempotent: ON CONFLICT no-op counts as duplicate, not inserted", async () => {
    const captured: Captured[] = [];
    const client = makeClient({
      unitId: UNIT_ID,
      driverId: DRIVER_ID,
      loadId: LOAD_ID,
      insertRowCount: 0, // conflict => nothing inserted
      captured,
    });

    const counts = await importFuelCardTransactionsForCompany(client, COMPANY, parsed);
    expect(counts.rows_inserted).toBe(0);
    expect(counts.rows_duplicate).toBe(1);
    expect(counts.rows_unlinked_to_load).toBe(0);
  });

  it("resolves the load through the ONE fuel-to-load rule and carries the load's trailer (443.110 G7)", async () => {
    // The import used its own ±1-day SCHEDULED window (ignored actual stamps; null on any overlap). It now asks the same
    // rule the Relay post asks (resolveFuelLoadAtTime -> loadAtTimeSql, driver fallback): overlaps are decided by actual
    // time inside SQL (proved on real Postgres in fuel-load-at-time.db.test.ts), never by sort order.
    const captured: Captured[] = [];
    const TRAILER = "88888888-8888-4888-8888-888888888888";
    const client = makeClient({ unitId: UNIT_ID, driverId: DRIVER_ID, vendorId: null, loadId: LOAD_ID, trailerId: TRAILER, captured });
    const counts = await importFuelCardTransactionsForCompany(client, COMPANY, parsed);
    expect(counts.rows_inserted).toBe(1);
    const resolver = captured.find((c) => c.sql.includes("by_unit") && c.sql.includes("by_driver"));
    expect(resolver).toBeTruthy();
    expect(resolver!.sql).not.toMatch(/interval '1 day'\s*$/m);
    expect(captured.some((c) => /HAVING MIN\(COALESCE\(s\.scheduled_arrival_at/.test(c.sql))).toBe(false);
    const v = insertCall(captured).values!;
    expect(v[2]).toBe(LOAD_ID);
    expect(v[18]).toBe(TRAILER);
  });

  it("no load at the fill time -> unlinked with a G18 reason, never a guess", async () => {
    const captured: Captured[] = [];
    const client = makeClient({ unitId: UNIT_ID, driverId: DRIVER_ID, vendorId: null, loadId: null, captured });
    const counts = await importFuelCardTransactionsForCompany(client, COMPANY, parsed);
    expect(counts.rows_unlinked_to_load).toBe(1);
    const v = insertCall(captured).values!;
    expect(v[2]).toBeNull();
    expect(v[18]).toBeNull();
    expect((v[15] as string).length).toBeGreaterThanOrEqual(20);
  });

  it("resolveLoadId delegates to the one rule: the rule's load, else null", async () => {
    expect(await resolveLoadId(makeClient({ loadId: LOAD_ID, captured: [] }), COMPANY, UNIT_ID, DRIVER_ID, "2026-08-12T00:00:00Z")).toBe(LOAD_ID);
    expect(await resolveLoadId(makeClient({ loadId: null, captured: [] }), COMPANY, UNIT_ID, DRIVER_ID, "2026-08-12T00:00:00Z")).toBeNull();
    expect(await resolveLoadId(makeClient({ loadId: LOAD_ID, captured: [] }), COMPANY, null, null, "2026-08-12T00:00:00Z")).toBeNull();
  });
});
