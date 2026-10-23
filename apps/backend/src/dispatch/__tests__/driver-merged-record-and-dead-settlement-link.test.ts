import { describe, expect, it, vi } from "vitest";

// LEAD 443.192 — fail-old for the two engine defects behind 13656 / 13680's $0.00, rate-NULL driver bills (USMCA):
//  (1) both loads were booked on a MERGED driver record (merged_into_driver_id set) through an Owner credential override;
//      the pay writer looked up the merged record's rate card (none) instead of the person's, and minted $0 tracking bills.
//      A merged record is identity, not a credential: the shared gate now THROWS, so no override path can pass it.
//  (2) the $0 bills still pointed at their seed shells, voided "443.167 regroup". book-load read that dead link as
//      "settled" and refused the reassignment that re-prices the bill. A bill settled in a voided / cancelled settlement is
//      settled in nothing (the Settlement Creator's 443.167-R rule) — the re-price now releases the dead link, audited.

const audit = vi.hoisted(() => ({ calls: [] as Array<{ eventClass: string; payload: Record<string, unknown> }> }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async (_c: unknown, _u: string, eventClass: string, payload: Record<string, unknown>) => {
    audit.calls.push({ eventClass, payload });
  }),
}));

const { assertDriverQualifiedForLoad, recordHistoricalReassignQualification, DriverMergedError, DriverNotQualifiedError } =
  await import("../driver-qualification.service.js");
const { createDriverBillArtifacts, DriverBillReassignRefusedError } = await import("../book-load.service.js");
type BookLoadInput = import("../book-load.service.js").BookLoadInput;
type BookLoadStop = import("../book-load.service.js").BookLoadStop;

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const MERGED = "5363ee51-35f2-430f-9516-5be13e50e253";
const SURVIVOR = "61727a46-af2e-4d33-8236-e2d99b737708";
const LOAD_ID = "fe08ef09-92b9-4a3c-baa0-b9287aecba4a";
const BILL_ID = "0a4e6e96-1b73-4588-a0b4-cd8be961691f";
const DEAD_SETTLEMENT = "5950d817-0491-49a3-b580-0e6f834afa1e";

const cred = (over: Record<string, unknown>) => ({
  id: MERGED, driver_name: "Carlos Mauricio Carvallo", is_deactivated: false, is_archived: false, is_status_inactive: true,
  cdl_missing: true, cdl_expired: false, cdl_expires_at: null, med_missing: true, med_expired: false, med_expiry_date: null,
  hazmat_blocked: false, hazmat_endorsement_expires_at: null, merged_into: null, merged_into_name: null, ...over,
});
const credClient = (row: Record<string, unknown>) => ({
  query: vi.fn(async (sql: string) => (/cdl_missing/.test(sql) ? { rows: [row] } : { rows: [] })),
});

describe("443.192 (1) — a merged driver record can never be a load's driver", () => {
  it("the shared gate THROWS DriverMergedError (a DriverNotQualifiedError, so routes render the 422), naming the survivor", async () => {
    const row = cred({ merged_into: SURVIVOR, merged_into_name: "Carlos Mauricio Pena Carvallo" });
    let thrown: unknown = null;
    try {
      await assertDriverQualifiedForLoad(credClient(row), { driverId: MERGED, operatingCompanyId: OPCO, isHazmat: false });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DriverMergedError);
    expect(thrown).toBeInstanceOf(DriverNotQualifiedError);
    const err = thrown as InstanceType<typeof DriverMergedError>;
    expect(err.block.reasons).toEqual(["driver_merged"]);
    expect(err.survivorDriverId).toBe(SURVIVOR);
    expect(err.message).toContain("Carlos Mauricio Pena Carvallo");
  });

  it("the gate SQL reads merged_into_driver_id (the evidence is on the driver row)", async () => {
    const c = credClient(cred({}));
    await assertDriverQualifiedForLoad(c, { driverId: MERGED, operatingCompanyId: OPCO, isHazmat: false });
    const sql = String(c.query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("d.merged_into_driver_id::text AS merged_into");
  });

  it("an unmerged inactive driver still returns an (overridable) block, not a throw — the credential path is unchanged", async () => {
    const block = await assertDriverQualifiedForLoad(credClient(cred({})), { driverId: MERGED, operatingCompanyId: OPCO, isHazmat: false });
    // ROUND 443.257 — missing CDL / medical dates are never qualification blockers (reminders only).
    expect(block?.reasons).toEqual(["driver_status_inactive"]);
  });

  it("the historical-backfill reassignment (record-and-proceed) cannot pass a merged record either", async () => {
    const row = cred({ merged_into: SURVIVOR, merged_into_name: "Carlos Mauricio Pena Carvallo" });
    await expect(
      recordHistoricalReassignQualification(credClient(row), {
        driverId: MERGED, operatingCompanyId: OPCO, loadId: LOAD_ID, actorUserId: "actor", via: "settlement_creator",
      })
    ).rejects.toBeInstanceOf(DriverMergedError);
  });
});

function input(driverId: string): BookLoadInput {
  return {
    requestingUserUuid: "33333333-3333-4333-8333-333333333333",
    requestingUserRole: "Owner",
    operating_company_id: OPCO,
    customer_id: "44444444-4444-4444-8444-444444444444",
    status: "booked",
    charges: [],
    stops: [],
    save_mode: "book_dispatch",
    assigned_primary_driver_id: driverId,
  } as BookLoadInput;
}

/** settlementLive: the bill's settled_in_settlement_id names a LIVE settlement (true) or a voided / cancelled one (false). */
function billClient(settlementLive: boolean) {
  const updates: Array<{ sql: string; values: unknown[] }> = [];
  const billSql: string[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id::text/.test(sql) && /FROM driver_finance\.driver_bills db/.test(sql)) {
      billSql.push(sql);
      // What the SQL computes for 13656's bill: $0 open tracking bill on the merged record, linked to P-0072.
      return {
        rows: [{
          id: BILL_ID, status: "open", gross_amount_cents: 0, voided_at: null,
          settled_in_settlement_id: settlementLive ? DEAD_SETTLEMENT : null,
          dead_settlement_id: settlementLive ? null : DEAD_SETTLEMENT,
          driver_id: MERGED, team_driver_id: null,
        }],
      };
    }
    if (/FROM mdata\.load_stops/.test(sql)) return { rows: [{ d: "2026-10-02" }] };
    if (/FROM driver_finance\.driver_pay_rates/.test(sql)) {
      // The survivor's real card: 45c per mile from 2026-09-01. The merged record has none.
      return {
        rows: values[1] === SURVIVOR
          ? [{ basis_type: "per_mile_pay", rate_per_mile_cents: "45", flat_per_load_cents: null, miles_basis: "short_miles", is_test_data: false, rate_empty_per_mile_cents: null }]
          : [],
      };
    }
    if (/UPDATE driver_finance\.driver_bills/.test(sql) && !/SET unit_id/.test(sql)) {
      updates.push({ sql, values });
      return { rows: [], rowCount: 1 } as never;
    }
    if (/audit\.audit_events/.test(sql)) return { rows: [{ exists: false }] };
    if (/UPDATE driver_finance\.driver_bills b\s+SET unit_id/.test(sql)) return { rows: [], rowCount: 0 } as never;
    throw new Error(`billClient: unhandled query: ${sql}`);
  });
  return { query, updates, billSql };
}

// LEAD 443.192 (12:35Z) OWNER LAW: per-mile pay is SHORT miles only — the fixture carries short miles (practical differs and is ignored).
const load = { id: LOAD_ID, load_number: "13656", miles_practical: 1997.7, miles_shortest: 1897.7 };
const stops = [{ stop_type: "pickup", sequence_number: 1 }, { stop_type: "delivery", sequence_number: 2 }] as BookLoadStop[];

describe("443.192 (2) — a bill linked to a voided / cancelled settlement is settled in nothing", () => {
  it("13656 shape: reassigning to the survivor RE-PRICES the bill at the survivor's card and releases the dead link (audited)", async () => {
    audit.calls.length = 0;
    const c = billClient(false);
    const out = await createDriverBillArtifacts(c, input(SURVIVOR), load, "13656", stops);
    expect(out.outcome).toBe("minted");
    const u = c.updates.find((x) => /gross_amount_cents = \$4/.test(x.sql));
    expect(u).toBeDefined();
    expect(u!.values[1]).toBe(SURVIVOR);
    expect(u!.values[3]).toBe(85397); // 1897.7 practical mi x 45c, half-up (the one money rule)
    expect(u!.values[6]).toBe(45);
    expect(u!.values[12]).toBe(DEAD_SETTLEMENT);
    // 443.243: the link is released unless it is the bill's OPEN pre-settlement ($14) — a dead settlement is never that.
    expect(u!.sql.replace(/\s+/g, " ")).toContain("settled_in_settlement_id = CASE WHEN settled_in_settlement_id = $14::uuid THEN settled_in_settlement_id END");
    expect(u!.values[13]).toBeNull();
    expect(u!.sql.replace(/\s+/g, " ")).toContain("(settled_in_settlement_id IS NULL OR settled_in_settlement_id = $13::uuid OR settled_in_settlement_id = $14::uuid)");
    const released = audit.calls.find((a) => a.eventClass === "driver_finance.driver_bill.dead_settlement_link_released");
    expect(released?.payload).toMatchObject({ driver_bill_id: BILL_ID, released_settlement_id: DEAD_SETTLEMENT, load_id: LOAD_ID });
  });

  it("the bill read treats a voided / cancelled settlement as no settlement (same predicate as the Settlement Creator)", async () => {
    const c = billClient(false);
    await createDriverBillArtifacts(c, input(SURVIVOR), load, "13656", stops);
    const sql = c.billSql[0]!.replace(/\s+/g, " ");
    expect(sql).toContain("CASE WHEN settlement_live THEN settled_in_settlement_id::text END AS settled_in_settlement_id");
    // 443.193 group A (#26979, step 2648 entity scope) added the same-company predicate to this subquery — the settlement
    // must be the bill's own company's. Same rule otherwise: voided / cancelled = settled in nothing.
    expect(sql).toContain("s.id = db.settled_in_settlement_id AND s.operating_company_id = db.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled') AS settlement_live");
  });

  it("a bill inside a LIVE settlement is still settled history: the reassignment is refused, nothing is re-priced", async () => {
    audit.calls.length = 0;
    const c = billClient(true);
    await expect(createDriverBillArtifacts(c, input(SURVIVOR), load, "13656", stops)).rejects.toBeInstanceOf(DriverBillReassignRefusedError);
    expect(c.updates).toHaveLength(0);
    expect(audit.calls.find((a) => a.eventClass === "driver_finance.driver_bill.dead_settlement_link_released")).toBeUndefined();
  });
});
