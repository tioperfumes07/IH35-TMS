/**
 * INTERNAL FINE -> AUTO-DEDUCT FROM DRIVER PAY (real Postgres, real apply function).
 * Proves: an internal fine becomes an auto-deduction policy that AUTO-deducts up to a per-settlement CAP
 * (max_per_settlement_cents) — it does NOT ask each time. A 10¢ fine with a 5¢ cap deducts exactly 5¢ this
 * settlement and rolls the remaining 5¢ to the next settlement.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { applyAutoDeductionsToSettlement } from "../../settlements/auto-deductions/apply.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

run("internal fine auto-deducts from driver pay up to the per-settlement cap", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000ff";
  const id = { driver: randomUUID(), settlement: randomUUID(), policy: randomUUID() };

  async function tx(fn: () => Promise<void>) {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); } catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "int-fine" }); companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect(); await db.query("SET ROLE ih35_app");
    await tx(async () => {
      await db.query(`INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`, [userId, `intfine-${s}@test.local`]);
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone) VALUES ($1::uuid,$2::uuid,'Fined','Driver',$3)`, [id.driver, companyId, `95605${s.slice(0,5)}`]);
      await db.query(`INSERT INTO driver_finance.driver_settlements (id,operating_company_id,display_id,driver_id,period_start,period_end,status,approval_status) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'open','needs_review')`, [id.settlement, companyId, `SET-${s}`, id.driver]);
      // SETL-PICK-01: auto_deduction_policies.deduction_type FK → catalogs.driver_deduction_types (opco, code).
      // Isolated companies are not covered by the one-time seed loop — plant the catalog row first.
      await db.query(
        `INSERT INTO catalogs.driver_deduction_types
           (operating_company_id, code, display_name, description,
            may_draw_escrow, default_recovery_rail, survives_separation, is_active)
         VALUES ($1::uuid, 'fine', 'Internal fine', 'DOT/internal fine for auto-deduct tests',
                 true, 'settlement', true, true)
         ON CONFLICT (operating_company_id, code) DO NOTHING`,
        [companyId],
      );
      // an internal FINE of $0.10, capped at $0.05 per settlement (owner sets the cap = "how much to reduce")
      await db.query(`INSERT INTO driver_finance.auto_deduction_policies (id,operating_company_id,driver_id,deduction_type,total_owed_cents,deducted_so_far_cents,max_per_settlement_cents,status,created_by_user_id,memo) VALUES ($1::uuid,$2::uuid,$3::uuid,'fine',10,0,5,'active',$4::uuid,'DOT internal fine')`, [id.policy, companyId, id.driver, userId]);
    });
  });
  afterAll(async () => { if(!db) return; try { await tx(async()=>{ await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`,[companyId]); if(isolated) await deactivateIsolatedOperatingCompany(db,isolated);});}catch{} await db.end(); });

  it("deducts exactly the 5c cap this settlement; 5c rolls forward (auto, not asked)", async () => {
    let result: any;
    await tx(async () => {
      result = await applyAutoDeductionsToSettlement(db, { settlementId: id.settlement, driverId: id.driver, operatingCompanyId: companyId, actorUserId: userId });
    });
    // eslint-disable-next-line no-console
    console.log(`\nINTERNAL FINE AUTO-DEDUCT: total_materialized=$${(result.total_materialized_cents/100).toFixed(2)} (cap $0.05 of a $0.10 fine)`);
    expect(result.schema_ready).toBe(true);
    expect(result.total_materialized_cents).toBe(5);          // deducted the CAP, auto
    expect(result.materialized).toHaveLength(1);

    const rows = await (async()=>{ await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'"); await db.query("SELECT set_config('app.operating_company_id', $1::text, true)",[companyId]); const r=await db.query(`SELECT deducted_so_far_cents::int d, total_owed_cents::int t, status FROM driver_finance.auto_deduction_policies WHERE id=$1::uuid`,[id.policy]); await db.query("COMMIT"); return r.rows; })();
    expect(rows[0].d).toBe(5);                                  // policy advanced by the cap
    expect(rows[0].t - rows[0].d).toBe(5);                      // 5c remaining rolls to next settlement
    // the sub-ledger deduction row exists and is policy-linked
    const ded = await (async()=>{ await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'"); await db.query("SELECT set_config('app.operating_company_id', $1::text, true)",[companyId]); const r=await db.query(`SELECT amount_cents::int a, deduction_type FROM driver_finance.driver_settlement_deductions WHERE source_auto_deduction_policy_id=$1::uuid`,[id.policy]); await db.query("COMMIT"); return r.rows; })();
    expect(ded[0].a).toBe(5); expect(ded[0].deduction_type).toBe("fine");
  });
});
