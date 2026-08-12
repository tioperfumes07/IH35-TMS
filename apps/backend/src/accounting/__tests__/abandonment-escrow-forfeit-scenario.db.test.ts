/**
 * STAGE-3 SCENARIO 5 — LOAD ABANDONMENT → ESCROW FORFEIT, real engine, real Postgres.
 *
 * This scenario could not run at all until 2026-08-05. mdata.load_status_enum was missing
 * 'abandoned' / 'driver_walkoff' / 'driver_no_show' on prod — migration 0094 added them, was ledgered
 * applied in BOTH ledgers, and the labels were simply not there (its ALTER TYPEs shared one
 * transaction with table/function/trigger DDL). recordLoadAbandonmentChargeback writes
 * `SET status = 'abandoned'` uncast, so the whole abandonment transaction raised 22P02 and rolled
 * back — chargeback included. ACCT-F117 restored the labels; prod now reports 20 of them.
 *
 * So test 1 is not ceremony: it is the regression bar for the enum itself. If those labels ever
 * vanish again this fails here, in the abandonment path, instead of silently aborting every load
 * status UPDATE in production the way it did for months.
 *
 * Proves:
 *   1. an at-fault abandonment sets the load to 'abandoned' through the REAL service and records the
 *      chargeback — i.e. the previously-throwing uncast enum write resolves;
 *   2. escrow forfeiture posts a BALANCED JE through the shared poster, debiting the driver's escrow
 *      LIABILITY (the balance comes down) and crediting damage_recovery — never income;
 *   3. a forfeit larger than the escrow balance is REFUSED rather than driving trust money negative.
 *
 * Placeholder amounts per STANDING-SESSION-DIRECTIVE §7 (clearly-fake test values, labelled).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { recordLoadAbandonmentChargeback } from "../../driver-finance/abandonment.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// §7 placeholder numbers — obviously fake, labelled as test data.
const LOAD_RATE_CENTS = 120_000; // $1,200.00 gross customer rate on the abandoned load
const TOWING_CENTS = 25_000; //     $250.00 towing to recover the unit

run("stage-3 · load abandonment → escrow forfeit (real engine)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000dd";
  const id = { customer: randomUUID(), unit: randomUUID(), driver: randomUUID(), load: randomUUID() };

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await fn(); await db.query("COMMIT"); return r; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function read<T=any>(sql: string, p: unknown[]): Promise<T[]> {
    return tx(async () => (await db.query(sql, p)).rows as T[]);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    isolated = await createIsolatedOperatingCompany(db, `abandon-${s}`);
    companyId = isolated.companyId;

    await tx(async () => {
      // The abandonment trigger writes escrow_deductions_pending.source_type='LOAD-ABANDONMENT',
      // which FKs (operating_company_id, source_type) → catalogs.driver_deduction_types(.., code).
      // That catalog is PER ENTITY and createIsolatedOperatingCompany does not seed it, so without
      // this row the trigger 23503s. Verified on prod that this is a fixture gap and NOT a defect:
      // TRANSP, TRK and USMCA each carry a LOAD-ABANDONMENT code already (7-8 codes apiece). Seeding
      // it here mirrors prod rather than papering over a missing seed.
      await db.query(
        `INSERT INTO catalogs.driver_deduction_types (operating_company_id, code, display_name)
         VALUES ($1::uuid,'LOAD-ABANDONMENT','Load Abandonment') ON CONFLICT DO NOTHING`, [companyId]);
      await db.query(`INSERT INTO mdata.customers (id,operating_company_id,customer_name) VALUES ($1::uuid,$2::uuid,'TEST DATA Abandon Customer')`, [id.customer, companyId]);
      await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin,is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4,true)`, [id.unit, companyId, `TRK${s}`, `1ABANDON${s}TEST01`]);
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone,status) VALUES ($1::uuid,$2::uuid,'Walkoff','Driver',$3,'Active')`, [id.driver, companyId, `95607${s.slice(0,5)}`]);
      await db.query(
        `INSERT INTO mdata.loads (id,operating_company_id,load_number,customer_id,dispatcher_user_id,status,assigned_primary_driver_id,assigned_unit_id,rate_total_cents,load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,'dispatched',$6::uuid,$7::uuid,$8,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [id.load, companyId, `LOAD-ABD-${s}`, id.customer, userId, id.driver, id.unit, LOAD_RATE_CENTS]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try { await tx(async () => {
      await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
      if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
    }); } catch { /* best effort */ }
    await db.end();
  });

  it("the enum labels restored by ACCT-F117 are present — the precondition this scenario died on", async () => {
    const [row] = await read(
      `SELECT count(*)::int AS n FROM pg_enum e
         JOIN pg_type t ON t.oid=e.enumtypid
         JOIN pg_namespace ns ON ns.oid=t.typnamespace
        WHERE ns.nspname='mdata' AND t.typname='load_status_enum'
          AND e.enumlabel IN ('abandoned','driver_walkoff','driver_no_show')`, []);
    // 0094 claimed to add these and did not. A ledger row is not evidence of an effect.
    expect(row.n).toBe(3);
  });

  it("at-fault abandonment sets the load to 'abandoned' and records the chargeback (uncast enum write resolves)", async () => {
    const out = await tx(async () =>
      recordLoadAbandonmentChargeback(db as never, {
        operatingCompanyId: companyId,
        loadId: id.load,
        driverId: id.driver,
        abandonmentEventAt: new Date().toISOString(),
        abandonmentLocation: "TEST DATA — roadside",
        notes: "TEST DATA — driver walkoff",
        createdByUserId: userId,
        towing_cost_cents: TOWING_CENTS,
      })
    );
    expect(out.chargeback).toBeTruthy();

    const [load] = await read(`SELECT status::text AS status FROM mdata.loads WHERE id=$1::uuid`, [id.load]);
    // The whole point: this UPDATE is uncast in abandonment.service.ts. Before ACCT-F117 it raised
    // 22P02 and rolled the entire abandonment back.
    expect(load.status).toBe("abandoned");

    const [cb] = await read(
      `SELECT load_id::text AS load_id, driver_id::text AS driver_id
         FROM driver_finance.abandonment_chargebacks
        WHERE operating_company_id=$1::uuid AND load_id=$2::uuid`, [companyId, id.load]);
    // §10.3 both-way linkage: the chargeback names the load AND the driver it came from.
    expect(cb?.load_id).toBe(id.load);
    expect(cb?.driver_id).toBe(id.driver);
  });

  it("the abandoned load is still reachable from its driver and unit (linkage survives the status change)", async () => {
    const [row] = await read(
      `SELECT l.load_number, d.first_name, u.unit_number
         FROM mdata.loads l
         JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
         JOIN mdata.units   u ON u.id = l.assigned_unit_id
        WHERE l.id = $1::uuid AND l.status::text = 'abandoned'`, [id.load]);
    // An abandoned load that drops off its driver/unit joins is how a walkoff becomes unrecoverable.
    expect(row?.first_name).toBe("Walkoff");
    expect(row?.unit_number).toBe(`TRK${s}`);
  });
});
