/**
 * DIRE ACCIDENT SCENARIO — full cross-module linkage, real Postgres.
 * A Tio Perfumes load, driver AT FAULT in an accident:
 *   accident report (+ police report #) -> insurance policy + claim (driver_responsible, $0.05 deductible)
 *   -> legal matter -> accident work order (source_type AC) -> driver liability + settlement deduction
 *   -> repair posts a BALANCED expense JE.
 * Proves the LINKAGE resolves both-way across safety / insurance / legal / maintenance / driver-finance,
 * and that the repair money leg posts through the real engine.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerSafetyRoutes } from "../../safety/safety.routes.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction } from "../posting-engine.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const CENTS = 5;

run("dire accident scenario — full linkage (real engine)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany; let app: FastifyInstance;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000dd";
  const id = {
    ap: randomUUID(), repair: randomUUID(), uncat: randomUUID(),
    customer: randomUUID(), unit: randomUUID(), driver: randomUUID(), load: randomUUID(),
    covType: randomUUID(), policy: randomUUID(), accident: randomUUID(), claim: randomUUID(),
    matter: randomUUID(), wo: randomUUID(), liability: randomUUID(),
  };
  async function tx(fn: () => Promise<void>) {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); } catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function read<T=any>(sql: string, p: unknown[]): Promise<T[]> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, p); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "dire-accident" });
    companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect(); await db.query("SET ROLE ih35_app");
    await tx(async () => {
      await db.query(`INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`, [userId, `dire-${s}@test.local`]);
      // COA + roles + a repair-expense category map
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Accounts Payable','Liability',true)`, [id.ap, companyId, `AP${s}`]);
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Accident Repair Expense','Expense',true)`, [id.repair, companyId, `RPR${s}`]);
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Uncategorized Expense','Expense',true)`, [id.uncat, companyId, `UNC${s}`]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'ap_control',$2::uuid,true)`, [companyId, id.ap]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'uncategorized_expense',$2::uuid,true)`, [companyId, id.uncat]);
      await db.query(`INSERT INTO accounting.expense_category_account_map (operating_company_id,category_kind,category_code,account_id,posting_side,is_active) VALUES ($1::uuid,'maintenance',$2,$3::uuid,'debit',true)`, [companyId, `RPR-${s}`, id.repair]);
      // operational: Tio Perfumes customer, unit, driver, delivered load
      await db.query(`INSERT INTO mdata.customers (id,operating_company_id,customer_name) VALUES ($1::uuid,$2::uuid,'Tio Perfumes')`, [id.customer, companyId]);
      await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin, is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4, true)`, [id.unit, companyId, `TRK${s}`, `1DIRE${s}ACCIDENT01`]);
      // status Active is REQUIRED, not decoration: the real spawn-liability route refuses a driver
      // whose status is not 'active' (safety.routes.ts driver_inactive guard).
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone,status) VALUES ($1::uuid,$2::uuid,'AtFault','Driver',$3,'Active')`, [id.driver, companyId, `95605${s.slice(0,5)}`]);
      await db.query(`INSERT INTO mdata.loads (id,operating_company_id,load_number,customer_id,dispatcher_user_id,status,assigned_primary_driver_id,assigned_unit_id,load_trailer_equipment_id) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,'delivered',$6::uuid,$7::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`, [id.load, companyId, `LOAD-${s}`, id.customer, userId, id.driver, id.unit]);
      // insurance coverage type + policy
      await db.query(`INSERT INTO insurance.type_catalog (id,tenant_id,code,name) VALUES ($1::uuid,$2::uuid,$3,'Auto Liability')`, [id.covType, companyId, `AL-${s}`]);
      await db.query(`INSERT INTO insurance.policy (id,tenant_id,insurer_name,policy_number,coverage_type,coverage_type_id,effective_date,expiry_date) VALUES ($1::uuid,$2::uuid,'Progressive',$3,'auto_liability',$4::uuid,CURRENT_DATE - 30, CURRENT_DATE + 300)`, [id.policy, companyId, `POL-${s}`, id.covType]);
      // ACCIDENT REPORT — driver at fault, police report #
      await db.query(`INSERT INTO safety.accident_reports (id,operating_company_id,driver_id,unit_id,load_id,at_fault,police_report_number,accident_at,report_date) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'yes',$6,now(),CURRENT_DATE)`, [id.accident, companyId, id.driver, id.unit, id.load, `PR-${s}-DOT`]);
      // INSURANCE CLAIM — links accident, driver responsible, $0.05 deductible
      await db.query(`INSERT INTO insurance.claim (id,tenant_id,claim_number,policy_id,accident_date,reported_date,accident_report_id,driver_id,driver_responsible,fault,load_id,deductible_cents,status) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE,CURRENT_DATE,$5::uuid,$6::uuid,true,'company',$7::uuid,$8,'open')`, [id.claim, companyId, `CLM-${s}`, id.policy, id.accident, id.driver, id.load, CENTS]);
      await db.query(`UPDATE safety.accident_reports SET insurance_claim_id=$1::uuid, insurance_claim_number=$2 WHERE id=$3::uuid`, [id.claim, `CLM-${s}`, id.accident]);
      // LEGAL MATTER — links the claim, driver, unit
      await db.query(`INSERT INTO legal.matters (id,operating_company_id,matter_number,type,status,insurance_claim_id,related_driver_id,unit_id,amount_claimed_against_us) VALUES ($1::uuid,$2::uuid,$3,'claim','open',$4::uuid,$5::uuid,$6::uuid,$7)`, [id.matter, companyId, `MAT-${s}`, id.claim, id.driver, id.unit, CENTS/100]);
      // ACCIDENT WORK ORDER (source_type AC) — links unit, driver, claim, load
      await db.query(`INSERT INTO maintenance.work_orders (id,operating_company_id,source_type,unit_sequence,unit_id,driver_id,insurance_claim_id,load_id) VALUES ($1::uuid,$2::uuid,'AC',1,$3::uuid,$4::uuid,$5::uuid,$6::uuid)`, [id.wo, companyId, id.unit, id.driver, id.claim, id.load]);
      await db.query(`INSERT INTO maintenance.work_order_lines (work_order_uuid,line_type,description) VALUES ($1::uuid,'labor','Accident repair labor')`, [id.wo]);
      // DRIVER CHARGE — cost lines only. The liability and the settlement deduction are NOT inserted
      // here on purpose: they are produced by the REAL route in the spawn-liability test below. The
      // route sums safety.accident_cost_lines for the amount, so this is the only input it needs.
      await db.query(`INSERT INTO safety.accident_cost_lines (operating_company_id,accident_id,section,description,amount_cents,sort_order) VALUES ($1::uuid,$2::uuid,'A','Accident deductible charged to at-fault driver',$3,1)`, [companyId, id.accident, CENTS]);
    });

    app = await createIntegrationApp(registerSafetyRoutes);
  });

  afterAll(async () => {
    if (!db) return;
    try { await tx(async () => {
      await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
      if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
    }); } catch { /* best effort */ }
    await app?.close().catch(() => {});
    await db.end();
  });

  // Runs FIRST: the linkage test below now asserts rows this route produces, not fixtures.
  it("the REAL spawn-liability route charges the at-fault driver (no hand-inserted liability)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/accidents/${id.accident}/spawn-liability?operating_company_id=${companyId}`,
      // TEST_OWNER_USER_ID, not the local fixture userId: the route runs under withCompanyScope,
      // which needs a user that actually holds org.user_company_access. The local id is only a
      // created_by stamp and gets a 403 here.
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
    });
    expect(res.statusCode).toBeLessThan(300);

    const [liability] = await read(`
      SELECT type, origin, origin_id::text AS origin_id, status, requires_acknowledgment,
             (original_amount * 100)::bigint::text AS original_amount_cents
        FROM driver_finance.driver_liabilities
       WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid`, [companyId, id.driver]);
    expect(liability).toBeTruthy();
    expect(liability.type).toBe("accident_damage");
    expect(liability.origin).toBe("safety_accident");
    expect(liability.origin_id).toBe(id.accident);
    expect(liability.status).toBe("pending_recovery");
    // requires_acknowledgment is FALSE, and that is the CORRECT state, not a weakening.
    // legal/signed-finance-handoff.service.ts carries the owner lock (2026-07-04/05): the signed HIRE
    // CONTRACT authorizes settlement deductions and there is NO per-charge driver e-sign — building
    // one is explicitly forbidden. Gating here on a driver signature stranded every at-fault recovery
    // in pending_acknowledgment waiting for a tap the company never requests.
    // The authorization control did not disappear, it sits on the COMPANY side where the lock puts
    // it: blueprint MUST 3.4.2(d)(e) user sign-off with a digital signature on file at settlement
    // prep, plus maker != checker (F13). Those are asserted by the settlement suites, not here.
    expect(liability.requires_acknowledgment).toBe(false);
    expect(Number(liability.original_amount_cents)).toBe(CENTS);

    const [ded] = await read(`
      SELECT deduction_type, amount_cents::text AS amount_cents, status
        FROM driver_finance.driver_settlement_deductions
       WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid`, [companyId, id.driver]);
    expect(ded).toBeTruthy();
    expect(ded.deduction_type).toBe("damage");
    expect(Number(ded.amount_cents)).toBe(CENTS);
  });

  it("FULL LINKAGE resolves both-way across safety/insurance/legal/maintenance/driver-finance", async () => {
    const rows = await read(`
      SELECT ar.police_report_number, ar.at_fault,
             c.claim_number, c.driver_responsible, c.deductible_cents::text AS deductible_cents,
             p.policy_number, m.matter_number, m.type AS matter_type,
             wo.source_type AS wo_source, dl.type AS liability_type, dsd.deduction_type,
             d.first_name||' '||d.last_name AS driver, u.unit_number, l.load_number
        FROM safety.accident_reports ar
        JOIN insurance.claim c   ON c.id = ar.insurance_claim_id AND c.accident_report_id = ar.id
        JOIN insurance.policy p  ON p.id = c.policy_id
        JOIN legal.matters m     ON m.insurance_claim_id = c.id
        JOIN maintenance.work_orders wo ON wo.insurance_claim_id = c.id
        JOIN driver_finance.driver_liabilities dl ON dl.driver_id = ar.driver_id AND dl.type='accident_damage'
        JOIN driver_finance.driver_settlement_deductions dsd ON dsd.driver_id = ar.driver_id AND dsd.deduction_type='damage'
        JOIN mdata.drivers d ON d.id = ar.driver_id
        JOIN mdata.units u   ON u.id = ar.unit_id
        JOIN mdata.loads l   ON l.id = ar.load_id
       WHERE ar.id = $1::uuid`, [id.accident]);
    // eslint-disable-next-line no-console
    console.log("\nDIRE ACCIDENT — FULL LINKAGE:\n" + JSON.stringify(rows[0], null, 2));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.at_fault).toBe("yes");
    expect(r.driver_responsible).toBe(true);
    expect(r.police_report_number).toMatch(/^PR-/);
    expect(r.wo_source).toBe("AC");           // accident-caused work order
    expect(Number(r.deductible_cents)).toBe(CENTS);
    expect(r.matter_type).toBe("claim");
    expect(r.liability_type).toBe("accident_damage");
    expect(r.deduction_type).toBe("damage");
  });

  it("the accident repair posts a BALANCED expense JE ($0.05)", async () => {
    const billId = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`, [billId, companyId, CENTS, CENTS/100, `REPAIR-${s}`]);
      await db.query(`INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description,category_kind,category_code) VALUES ($1::uuid,1,$2,'Accident repair','maintenance',$3)`, [billId, CENTS/100, `RPR-${s}`]);
    });
    const res = await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: billId }, { userId });
    const je = await read(`SELECT a.account_name, p.debit_or_credit, p.amount_cents::text AS amount_cents FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.journal_entry_uuid=$1::uuid ORDER BY p.debit_or_credit DESC`, [res.journal_entry_id]);
    // eslint-disable-next-line no-console
    console.log("\nACCIDENT REPAIR JE:\n" + je.map((r:any)=>`  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_name}  $${(Number(r.amount_cents)/100).toFixed(2)}`).join("\n"));
    const dr = je.filter((r:any)=>r.debit_or_credit==="debit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    const cr = je.filter((r:any)=>r.debit_or_credit==="credit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    expect(dr).toBe(cr); expect(dr).toBe(CENTS);

    // SOURCE LINKAGE — a balanced JE is only half the bar. An entry that does not name the
    // transaction that caused it is untraceable in an audit: the money is right and nobody can say
    // WHY. The linkage is NOT a column on journal_entries (it has none); it is the
    // accounting.transaction_source_links spine, keyed per POSTING, which the shared poster writes.
    const links = await read(
      `SELECT DISTINCT tsl.linked_object_type, tsl.linked_object_id::text AS linked_object_id
         FROM accounting.transaction_source_links tsl
         JOIN accounting.journal_entry_postings p ON p.id = tsl.journal_entry_posting_id
        WHERE p.journal_entry_uuid = $1::uuid`, [res.journal_entry_id]);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l:any)=>l.linked_object_type==="bill" && l.linked_object_id===billId)).toBe(true);
  });
});
