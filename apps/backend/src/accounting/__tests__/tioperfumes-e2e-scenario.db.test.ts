/**
 * TIO PERFUMES END-TO-END SCENARIO — real Postgres, real posting engine.
 * Builds the full operational narrative (customer, vendor, truck, driver, delivered load) and posts
 * the money legs through postSourceTransaction, asserting BALANCED journal entries at $0.05 each:
 *   LEG 1 — Invoice the delivered Tio Perfumes load  -> DR A/R $0.05  · CR Revenue $0.05
 *   LEG 2 — Bill from Tio Perfumes (vendor)          -> DR Expense $0.05 · CR A/P $0.05
 *   LEG 3 — DOT fine (company-paid, as a bill)       -> DR Fine Expense $0.05 · CR A/P $0.05
 * Every leg is posted by the REAL engine and read back from accounting.journal_entry_postings.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction } from "../posting-engine.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const CENTS = 5; // $0.05

run("Tio Perfumes end-to-end money scenario (real engine)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000cc";
  const ids = {
    ar: randomUUID(), revenue: randomUUID(), ap: randomUUID(), expense: randomUUID(),
    uncat: randomUUID(), fine: randomUUID(),
    customer: randomUUID(), vendor: randomUUID(), unit: randomUUID(), driver: randomUUID(), load: randomUUID(),
  };

  async function tx(fn: () => Promise<void>) {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); } catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function read<T=Record<string,unknown>>(sql: string, p: unknown[]): Promise<T[]> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, p); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function acct(id: string, num: string, name: string, type: string) {
    await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
      [id, companyId, num, name, type]);
  }
  async function role(r: string, accId: string) {
    await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,$2,$3::uuid,true)`, [companyId, r, accId]);
  }

  async function postAndRead(sourceType: string, sourceId: string) {
    const res = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: sourceType as any, source_transaction_id: sourceId },
      { userId }
    );
    const rows = await read<{account_name:string;debit_or_credit:string;amount_cents:string}>(
      `SELECT a.account_name, p.debit_or_credit, p.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
        WHERE p.journal_entry_uuid=$1::uuid ORDER BY p.debit_or_credit DESC`, [res.journal_entry_id]);
    // eslint-disable-next-line no-console
    console.log(`\nTIO-PERFUMES ${sourceType.toUpperCase()} JE:\n` + rows.map(r=>`  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_name}  $${(Number(r.amount_cents)/100).toFixed(2)}`).join("\n"));
    const dr = rows.filter(r=>r.debit_or_credit==="debit").reduce((a,r)=>a+Number(r.amount_cents),0);
    const cr = rows.filter(r=>r.debit_or_credit==="credit").reduce((a,r)=>a+Number(r.amount_cents),0);
    expect(dr).toBe(cr);      // BALANCED
    expect(dr).toBe(CENTS);   // $0.05
    return rows;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "tioperfumes" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    db = new pg.Client(buildPgClientConfig(cs)); await db.connect(); await db.query("SET ROLE ih35_app");
    await tx(async () => {
      await db.query(`INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`, [userId, `tio-${s}@test.local`]);
      // Chart of accounts + roles
      await acct(ids.ar, `AR${s}`, "Accounts Receivable", "Asset");
      await acct(ids.revenue, `REV${s}`, "Line Haul Revenue", "Income");
      await acct(ids.ap, `AP${s}`, "Accounts Payable", "Liability");
      await acct(ids.expense, `EXP${s}`, "Expense", "Expense");
      await acct(ids.uncat, `UNC${s}`, "Uncategorized Expense", "Expense");
      await acct(ids.fine, `FINE${s}`, "DOT Fine Expense", "Expense");
      await role("ar_control", ids.ar);
      await role("ap_control", ids.ap);
      await role("uncategorized_expense", ids.uncat);
      // Operational narrative — Tio Perfumes as CUSTOMER and VENDOR, a truck, a driver, a delivered load
      await db.query(`INSERT INTO mdata.customers (id,operating_company_id,customer_name) VALUES ($1::uuid,$2::uuid,'Tio Perfumes')`, [ids.customer, companyId]);
      await db.query(`INSERT INTO mdata.vendors (id,operating_company_id,vendor_name,vendor_type) VALUES ($1::uuid,$2::uuid,'Tio Perfumes','Other')`, [ids.vendor, companyId]);
      await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin, is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4, true)`, [ids.unit, companyId, `TRK${s}`, `1TIO${s}PERFUMES0001`]);
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone) VALUES ($1::uuid,$2::uuid,'Tio','Driver',$3)`, [ids.driver, companyId, `95605${s.slice(0,5)}`]);
      await db.query(`INSERT INTO mdata.loads (id,operating_company_id,load_number,customer_id,dispatcher_user_id,status,assigned_primary_driver_id,assigned_unit_id,load_trailer_equipment_id) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,'delivered',$6::uuid,$7::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [ids.load, companyId, `LOAD-${s}`, ids.customer, userId, ids.driver, ids.unit]);
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

  it("LEG 1 — invoices the delivered Tio Perfumes load: DR A/R / CR Revenue $0.05", async () => {
    const invId = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO accounting.invoices (id,operating_company_id,customer_id,display_id,due_date,status,issue_date,total_cents,tax_cents,source_load_id) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,'sent',CURRENT_DATE,$5,0,$6::uuid)`,
        [invId, companyId, ids.customer, `INV-2026-00001`, CENTS, ids.load]);
      await db.query(`INSERT INTO accounting.invoice_lines (operating_company_id,invoice_id,line_type,description,unit_amount_cents,line_total_cents,account_id) VALUES ($1::uuid,$2::uuid,'linehaul','Tio Perfumes load',$3,$3,$4::uuid)`,
        [companyId, invId, CENTS, ids.revenue]);
    });
    await postAndRead("invoice", invId);
  });

  it("LEG 2 — bill from Tio Perfumes (vendor): DR Expense / CR A/P $0.05", async () => {
    const billId = randomUUID();
    await tx(async () => {
      await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number,vendor_id) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5,$6::uuid)`,
        [billId, companyId, CENTS, CENTS/100, `TIOBILL-${s}`, ids.vendor]);
      await db.query(`INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description) VALUES ($1::uuid,1,$2,'Tio Perfumes services')`, [billId, CENTS/100]);
    });
    await postAndRead("bill", billId);
  });

  it("LEG 3 — DOT fine (company-paid, as a bill): DR Fine Expense / CR A/P $0.05", async () => {
    const fineBillId = randomUUID();
    await tx(async () => {
      // map an explicit fine category to the DOT Fine Expense account for THIS company
      await db.query(`INSERT INTO accounting.expense_category_account_map (operating_company_id,category_kind,category_code,account_id,posting_side,is_active) VALUES ($1::uuid,'other',$2,$3::uuid,'debit',true)`,
        [companyId, `DOTFINE-${s}`, ids.fine]);
      await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`,
        [fineBillId, companyId, CENTS, CENTS/100, `DOTFINE-${s}`]);
      await db.query(`INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description,category_kind,category_code) VALUES ($1::uuid,1,$2,'DOT fine','other',$3)`, [fineBillId, CENTS/100, `DOTFINE-${s}`]);
    });
    await postAndRead("bill", fineBillId);
  });
});
