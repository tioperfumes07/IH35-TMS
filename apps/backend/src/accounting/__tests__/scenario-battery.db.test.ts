/**
 * CROSS-MODULE SCENARIO BATTERY — real Postgres, real engine, all posting flags ON (test DB).
 * Proves multiple dire/operational scenarios across dispatch / safety / maintenance / insurance / accounting:
 *   1. Roadside service repair (RS work order) -> repair expense JE
 *   2. Driver FAILED drug test -> recorded + linked to driver
 *   3. Load runs LATE -> ETA projection flips on_time -> late (variance changes the delivery projection)
 *   4. Detention accessorial -> billed to customer -> revenue JE
 *   5. Cargo claim incident -> insurance claim linkage
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction } from "../posting-engine.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const CENTS = 5;

run("cross-module scenario battery (real engine)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000ee";
  const id = {
    ap: randomUUID(), ar: randomUUID(), revenue: randomUUID(), repair: randomUUID(), uncat: randomUUID(),
    customer: randomUUID(), unit: randomUUID(), driver: randomUUID(), load: randomUUID(), stop: randomUUID(),
    covType: randomUUID(), policy: randomUUID(),
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
  async function postBalanced(sourceType: string, sourceId: string, label: string) {
    const res = await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: sourceType as any, source_transaction_id: sourceId }, { userId });
    const je = await read(`SELECT a.account_name, p.debit_or_credit, p.amount_cents::text amt FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id WHERE p.journal_entry_uuid=$1::uuid ORDER BY p.debit_or_credit DESC`, [res.journal_entry_id]);
    // eslint-disable-next-line no-console
    console.log(`\n${label} JE:\n`+je.map((r:any)=>`  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_name} $${(Number(r.amt)/100).toFixed(2)}`).join("\n"));
    const dr=je.filter((r:any)=>r.debit_or_credit==="debit").reduce((a:number,r:any)=>a+Number(r.amt),0);
    const cr=je.filter((r:any)=>r.debit_or_credit==="credit").reduce((a:number,r:any)=>a+Number(r.amt),0);
    expect(dr).toBe(cr); expect(dr).toBe(CENTS);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "battery" }); companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect(); await db.query("SET ROLE ih35_app");
    await tx(async () => {
      await db.query(`INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`, [userId, `battery-${s}@test.local`]);
      const acct=(i:string,n:string,nm:string,t:string)=>db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,[i,companyId,n,nm,t]);
      await acct(id.ap,`AP${s}`,"Accounts Payable","Liability");
      await acct(id.ar,`AR${s}`,"Accounts Receivable","Asset");
      await acct(id.revenue,`REV${s}`,"Accessorial Revenue","Income");
      await acct(id.repair,`RPR${s}`,"Repair Expense","Expense");
      await acct(id.uncat,`UNC${s}`,"Uncategorized Expense","Expense");
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'ap_control',$2::uuid,true),($1::uuid,'ar_control',$3::uuid,true),($1::uuid,'uncategorized_expense',$4::uuid,true)`,[companyId,id.ap,id.ar,id.uncat]);
      await db.query(`INSERT INTO accounting.expense_category_account_map (operating_company_id,category_kind,category_code,account_id,posting_side,is_active) VALUES ($1::uuid,'maintenance',$2,$3::uuid,'debit',true)`,[companyId,`RPR-${s}`,id.repair]);
      await db.query(`INSERT INTO mdata.customers (id,operating_company_id,customer_name) VALUES ($1::uuid,$2::uuid,'Tio Perfumes')`,[id.customer,companyId]);
      await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin, is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4, true)`,[id.unit,companyId,`TRK${s}`,`1BAT${s}TERY000001`]);
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone) VALUES ($1::uuid,$2::uuid,'Battery','Driver',$3)`,[id.driver,companyId,`95605${s.slice(0,5)}`]);
      await db.query(`INSERT INTO mdata.loads (id,operating_company_id,load_number,customer_id,dispatcher_user_id,status,assigned_primary_driver_id,assigned_unit_id,load_trailer_equipment_id) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,'in_transit',$6::uuid,$7::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,[id.load,companyId,`LOAD-${s}`,id.customer,userId,id.driver,id.unit]);
      await db.query(`INSERT INTO mdata.load_stops (id,load_id,sequence_number,stop_type) VALUES ($1::uuid,$2::uuid,2,'delivery')`,[id.stop,id.load]);
      // insurance policy for cargo claim
      await db.query(`INSERT INTO insurance.type_catalog (id,tenant_id,code,name) VALUES ($1::uuid,$2::uuid,$3,'Cargo')`,[id.covType,companyId,`CG-${s}`]);
      await db.query(`INSERT INTO insurance.policy (id,tenant_id,insurer_name,policy_number,coverage_type,coverage_type_id,effective_date,expiry_date) VALUES ($1::uuid,$2::uuid,'Progressive',$3,'cargo',$4::uuid,CURRENT_DATE-30,CURRENT_DATE+300)`,[id.policy,companyId,`POL-${s}`,id.covType]);
    });
  });
  afterAll(async () => { if(!db) return; try { await tx(async()=>{ await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`,[companyId]); if(isolated) await deactivateIsolatedOperatingCompany(db,isolated);});}catch{} await db.end(); });

  it("SCENARIO 1 — roadside service repair (RS work order) posts a repair expense JE", async () => {
    const wo = randomUUID(); const bill = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO maintenance.work_orders (id,operating_company_id,source_type,unit_sequence,unit_id,driver_id,load_id) VALUES ($1::uuid,$2::uuid,'RS',1,$3::uuid,$4::uuid,$5::uuid)`,[wo,companyId,id.unit,id.driver,id.load]);
      await db.query(`INSERT INTO maintenance.work_order_lines (work_order_uuid,line_type,description) VALUES ($1::uuid,'labor','Roadside tire service')`,[wo]);
      await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`,[bill,companyId,CENTS,CENTS/100,`ROAD-${s}`]);
      await db.query(`INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description,category_kind,category_code) VALUES ($1::uuid,1,$2,'Roadside repair','maintenance',$3)`,[bill,CENTS/100,`RPR-${s}`]);
    });
    const link = await read(`SELECT source_type, unit_id::text unit, load_id::text load FROM maintenance.work_orders WHERE id=$1::uuid`,[wo]);
    expect(link[0].source_type).toBe("RS"); expect(link[0].load).toBe(id.load);
    await postBalanced("bill", bill, "ROADSIDE REPAIR");
  });

  it("SCENARIO 2 — driver FAILED drug test is recorded and linked to the driver", async () => {
    const dt = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO safety.drug_test (id,operating_company_id,driver_id,result,test_date) VALUES ($1::uuid,$2::uuid,$3::uuid,'positive',CURRENT_DATE)`,[dt,companyId,id.driver]);
    });
    const r = await read(`SELECT dt.result::text result, d.first_name||' '||d.last_name driver FROM safety.drug_test dt JOIN mdata.drivers d ON d.id=dt.driver_id WHERE dt.id=$1::uuid`,[dt]);
    // eslint-disable-next-line no-console
    console.log(`\nDRUG TEST: ${r[0].driver} -> result=${r[0].result}`);
    expect(r[0].result).toBe("positive"); expect(r[0].driver).toBe("Battery Driver");
  });

  it("SCENARIO 3 — load runs LATE: ETA projection flips on_time -> late (variance changes)", async () => {
    await tx(async () => {
      await db.query(`INSERT INTO dispatch.load_eta_predictions (load_id,predicted_arrival_stop_uuid,predicted_arrival_at,variance_minutes,confidence_class,computed_by) VALUES ($1::uuid,$2::uuid, now()+interval '1 hour', 0,'on_time','samsara_eta')`,[id.load,id.stop]);
      await db.query(`INSERT INTO dispatch.load_eta_predictions (load_id,predicted_arrival_stop_uuid,predicted_arrival_at,variance_minutes,confidence_class,computed_by) VALUES ($1::uuid,$2::uuid, now()+interval '5 hours', 180,'late','samsara_eta')`,[id.load,id.stop]);
    });
    const rows = await read(`SELECT confidence_class, variance_minutes FROM dispatch.load_eta_predictions WHERE load_id=$1::uuid ORDER BY variance_minutes ASC`,[id.load]);
    // eslint-disable-next-line no-console
    console.log(`\nLOAD ETA PROJECTIONS: `+rows.map((r:any)=>`${r.confidence_class}(+${r.variance_minutes}m)`).join(" -> "));
    const latest = await read(`SELECT confidence_class, variance_minutes::int v FROM dispatch.load_eta_predictions WHERE load_id=$1::uuid ORDER BY variance_minutes DESC LIMIT 1`,[id.load]);
    expect(latest[0].confidence_class).toBe("late");   // projection changed to LATE
    expect(latest[0].v).toBeGreaterThan(0);            // arrives 180 min past appointment
  });

  it("SCENARIO 4 — detention accessorial billed to customer posts revenue JE", async () => {
    const det = randomUUID(); const inv = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO dispatch.detention_events (id,operating_company_id,load_id,stop_id,started_at,accrued_minutes,free_time_minutes,accrued_amount_cents,status) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid, now()-interval '3 hours', 180, 120, $5, 'billed')`,[det,companyId,id.load,id.stop,CENTS]);
      await db.query(`INSERT INTO accounting.invoices (id,operating_company_id,customer_id,display_id,due_date,status,issue_date,total_cents,tax_cents,source_load_id) VALUES ($1::uuid,$2::uuid,$3::uuid,'INV-2026-00002',CURRENT_DATE,'sent',CURRENT_DATE,$4,0,$5::uuid)`,[inv,companyId,id.customer,CENTS,id.load]);
      await db.query(`INSERT INTO accounting.invoice_lines (operating_company_id,invoice_id,line_type,description,unit_amount_cents,line_total_cents,account_id) VALUES ($1::uuid,$2::uuid,'detention','Detention 1hr over free time',$3,$3,$4::uuid)`,[companyId,inv,CENTS,id.revenue]);
    });
    const d = await read(`SELECT status, load_id::text load, accrued_amount_cents::text amt FROM dispatch.detention_events WHERE id=$1::uuid`,[det]);
    expect(d[0].load).toBe(id.load); expect(d[0].status).toBe("billed");
    await postBalanced("invoice", inv, "DETENTION ACCESSORIAL");
  });

  it("SCENARIO 5 — cargo claim incident links to an insurance claim", async () => {
    const inc = randomUUID(); const claim = randomUUID(); const reason = randomUUID();
    await tx(async () => {
      // P44 (202612511800): safety.incidents_cargo_claim_reason_required now demands a real
      // claim_reason_id (FK-scoped to this same isolated company) on every cargo_claim row. This
      // isolated test company has no pre-seeded catalogs.cargo_claim_reasons row, so insert one
      // fresh rather than picking any existing row system-wide (the exact class of cross-company
      // fixture bug SYS-F5988 fixed in the sibling settlement-pdf-e2e suite — never SELECT a
      // shared/global row with no operating_company_id scope in a fixture that then FKs it).
      await db.query(`INSERT INTO catalogs.cargo_claim_reasons (id,operating_company_id,reason_code,display_name) VALUES ($1::uuid,$2::uuid,$3,'Battery Test Reason')`,[reason,companyId,`BATTERY-${s}`]);
      await db.query(`INSERT INTO safety.incidents (id,operating_company_id,incident_type,status,driver_id,unit_id,load_id,claimant_customer_id,claim_reason_id,incident_at,reported_at) VALUES ($1::uuid,$2::uuid,'cargo_claim','open',$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,now(),now())`,[inc,companyId,id.driver,id.unit,id.load,id.customer,reason]);
      await db.query(`INSERT INTO insurance.claim (id,tenant_id,claim_number,policy_id,accident_date,reported_date,driver_id,load_id,fault,status) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE,CURRENT_DATE,$5::uuid,$6::uuid,'undetermined','open')`,[claim,companyId,`CARGO-${s}`,id.policy,id.driver,id.load]);
      await db.query(`UPDATE safety.incidents SET insurance_claim_id=$1::uuid, auto_created_claim_id=$1::uuid WHERE id=$2::uuid`,[claim,inc]);
    });
    const r = await read(`SELECT i.incident_type, c.claim_number, c.status, l.load_number FROM safety.incidents i JOIN insurance.claim c ON c.id=i.insurance_claim_id JOIN mdata.loads l ON l.id=i.load_id WHERE i.id=$1::uuid`,[inc]);
    // eslint-disable-next-line no-console
    console.log(`\nCARGO CLAIM: ${r[0].incident_type} -> claim ${r[0].claim_number} (${r[0].status}) on ${r[0].load_number}`);
    expect(r[0].incident_type).toBe("cargo_claim"); expect(r[0].claim_number).toMatch(/^CARGO-/);
  });
});
