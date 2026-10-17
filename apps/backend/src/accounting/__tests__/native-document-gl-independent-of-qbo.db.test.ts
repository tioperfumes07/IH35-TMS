/**
 * R443.117 9a — QBO-origin subledger documents can post to the independent TMS GL.
 *
 * Real PostgreSQL + real posting engine. Every source carries QBO origin/id metadata; each poster
 * must persist balanced postings and return the same JE on retry. The enclosing transaction is
 * rolled back, so no test money survives. Never connect this suite to production or USMCA.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { postSourceTransactionInClientTx } from "../posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const localDbNameAllowlist = new Set(["ih35_bcf09_scope_proof", "ih35_verify", "ih35_9a_fresh_proof"]);
const amountCents = 12_345;
const actorId = "00000000-0000-4000-8000-0000000000ee";

describeIntegration("QBO-origin documents post to independent native GL (real local Postgres)", () => {
  let db: pg.Client;
  let company: IsolatedOperatingCompany;
  let txOpen = false;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const docNo = String((Number.parseInt(suffix.slice(0, 6), 16) % 90_000) + 10_000);
  const memoNo = docNo.slice(1);
  const ids = {
    customer: randomUUID(), vendor: randomUUID(),
    ar: randomUUID(), ap: randomUUID(), income: randomUUID(), expense: randomUUID(), item: randomUUID(),
    cash: randomUUID(), bankLedger: randomUUID(), bank: randomUUID(), bankTx: randomUUID(),
    invoice: randomUUID(), bill: randomUUID(), billPayment: randomUUID(), expenseDoc: randomUUID(),
    payment: randomUUID(), advance: randomUUID(), creditMemo: randomUUID(),
  };

  function assertApprovedLocalDatabase(): string {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    refuseProductionConnectionString(cs);
    const url = new URL(cs);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !localDbNameAllowlist.has(database)) {
      throw new Error("Refusing QBO GL regression test: only approved loopback or repository CI PostgreSQL databases are allowed");
    }
    return cs;
  }

  async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query(sql, params)).rows as T[];
  }

  async function seed(): Promise<void> {
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    txOpen = true;
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [company.companyId]);
    await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
    await db.query(
      `INSERT INTO identity.users (id,email,role,preferred_language)
       VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
      [actorId, `native-gl-${suffix}@test.local`]
    );
    const account = async (id: string, name: string, type: string, num: string) => db.query(
      `INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`, [id, company.companyId, num, name, type]
    );
    await account(ids.ar, "Test A/R", "Asset", `AR${suffix}`);
    await account(ids.ap, "Test A/P", "Liability", `AP${suffix}`);
    await account(ids.income, "Test Revenue", "Income", `IN${suffix}`);
    await account(ids.expense, "Test Expense", "Expense", `EX${suffix}`);
    await account(ids.cash, "Test Cash Clearing", "Asset", `CC${suffix}`);
    await account(ids.bankLedger, "Test Operating Bank", "Asset", `BK${suffix}`);
    await db.query(
      `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active)
       VALUES ($1::uuid,'ar_control',$2::uuid,true),($1::uuid,'ap_control',$3::uuid,true),
              ($1::uuid,'cash_clearing',$4::uuid,true),($1::uuid,'operating_bank',$5::uuid,true),
              ($1::uuid,'uncategorized_expense',$6::uuid,true)`,
      [company.companyId, ids.ar, ids.ap, ids.cash, ids.bankLedger, ids.expense]
    );
    await db.query(
      `INSERT INTO catalogs.items (id,operating_company_id,item_name,item_type,default_expense_account_id)
       VALUES ($1::uuid,$2::uuid,$3,'Service',$4::uuid)`,
      [ids.item, company.companyId, `QBO Expense Item ${suffix}`, ids.expense]
    );
    await db.query(`INSERT INTO mdata.customers (id,operating_company_id,customer_name,source_system) VALUES ($1::uuid,$2::uuid,$3,'qbo')`, [ids.customer, company.companyId, `QBO Customer ${suffix}`]);
    await db.query(`INSERT INTO mdata.vendors (id,operating_company_id,vendor_name,vendor_type,source_system) VALUES ($1::uuid,$2::uuid,$3,'other','qbo')`, [ids.vendor, company.companyId, `QBO Vendor ${suffix}`]);

    // Invoice: intentionally no load link, so delivery-revenue recognition remains the sole owner only when applicable.
    await db.query(
      `INSERT INTO accounting.invoices
        (id,operating_company_id,customer_id,display_id,invoice_type,issue_date,due_date,subtotal_cents,tax_cents,total_cents,status,source_system,qbo_invoice_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'manual',CURRENT_DATE,CURRENT_DATE,$5,0,$5,'draft','qbo',$6)`,
      [ids.invoice, company.companyId, ids.customer, `INV-2026-${docNo}`, amountCents, `QBO-INV-${suffix}`]
    );
    await db.query(
      `INSERT INTO accounting.invoice_lines (operating_company_id,invoice_id,line_type,account_id,description,unit_amount_cents,line_total_cents,display_order)
       VALUES ($1::uuid,$2::uuid,'other',$3::uuid,'QBO-origin invoice line',$4,$4,1)`,
      [company.companyId, ids.invoice, ids.income, amountCents]
    );
    await db.query(`UPDATE accounting.invoices SET status='sent' WHERE id=$1::uuid`, [ids.invoice]);

    await db.query(
      `INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number,source_system,qbo_bill_id,mdata_vendor_id)
       VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5,'qbo',$6,$7::uuid)`,
      [ids.bill, company.companyId, amountCents, amountCents / 100, `B-${suffix}`, `QBO-BILL-${suffix}`, ids.vendor]
    );
    await db.query(
      `INSERT INTO accounting.bill_lines (bill_id,line_sequence,amount,description,account_id)
       VALUES ($1::uuid,1,$2,'QBO-origin bill line',$3::uuid)`, [ids.bill, amountCents / 100, ids.expense]
    );
    await db.query(
      `INSERT INTO accounting.bill_payments (id,operating_company_id,bill_id,vendor_id,payment_date,amount_cents,amount,payment_method,qbo_bill_payment_id,source_system,status)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,$5,$6,'check',$7,'qbo','posted')`,
      [ids.billPayment, company.companyId, ids.bill, ids.vendor, amountCents, amountCents / 100, `QBO-BP-${suffix}`]
    );

    await db.query(
      `INSERT INTO accounting.expenses (id,operating_company_id,transaction_date,total_amount_cents,status,posting_status,payment_account_uuid,qbo_purchase_id)
       VALUES ($1::uuid,$2::uuid,CURRENT_DATE,$3,'posted','unposted',$4::uuid,$5)`,
      [ids.expenseDoc, company.companyId, amountCents, ids.cash, `QBO-PURCHASE-${suffix}`]
    );
    await db.query(
      `INSERT INTO accounting.expense_lines (expense_id,operating_company_id,line_sequence,amount_cents,amount,description,expense_account_uuid,item_id,quantity,rate_cents,unit_of_measure)
       VALUES ($1::uuid,$2::uuid,1,$3::bigint,$4::numeric,'QBO-origin expense line',$5::uuid,$6::uuid,1,$3::numeric,'each')`,
      [ids.expenseDoc, company.companyId, amountCents, amountCents / 100, ids.expense, ids.item]
    );

    await db.query(`INSERT INTO accounting.payments (id,operating_company_id,customer_id,display_id,payment_method,payment_date,amount_cents,deposited_to_account_id,source_system,qbo_payment_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'wire',CURRENT_DATE,$5,$6,'qbo',$7)`,
      [ids.payment, company.companyId, ids.customer, `PMT-2026-${docNo}`, amountCents, ids.cash, `QBO-PAY-${suffix}`]
    );
    await db.query(
      `INSERT INTO accounting.factoring_advances
        (id,operating_company_id,factoring_company_vendor_id,display_id,status,invoice_total_cents,advance_rate_pct,advance_amount_cents,reserve_pct,reserve_amount_cents,factor_fee_cents,advanced_at,source_system,qbo_advance_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',$5,100,$5,0,0,0,now(),'qbo',$6)`,
      [ids.advance, company.companyId, ids.vendor, `FA-${suffix}`, amountCents, `QBO-ADV-${suffix}`]
    );
    await db.query(`INSERT INTO banking.bank_accounts (id,operating_company_id,account_name,account_type,ledger_account_id,is_active,sync_status)
       VALUES ($1::uuid,$2::uuid,'Test bank','checking',$3::uuid,true,'active')`, [ids.bank, company.companyId, ids.bankLedger]);
    await db.query(`INSERT INTO banking.bank_transactions (id,bank_account_id,operating_company_id,transaction_date,amount_cents,is_credit,matched_factoring_advance_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,true,$5::uuid)`, [ids.bankTx, ids.bank, company.companyId, amountCents, ids.advance]);
    await db.query(`UPDATE accounting.payments SET source_bank_transaction_id=$1::uuid WHERE id=$2::uuid`, [ids.bankTx, ids.payment]);

    await db.query(
      `INSERT INTO accounting.credit_memos (id,operating_company_id,customer_id,display_id,status,reason,issue_date,amount_cents,account_id,source_system,qbo_credit_memo_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'issued','other',CURRENT_DATE,$5,$6::uuid,'qbo',$7)`,
      [ids.creditMemo, company.companyId, ids.customer, `CM-2026-${memoNo}`, amountCents, ids.income, `QBO-CM-${suffix}`]
    );
  }

  beforeAll(async () => {
    const cs = assertApprovedLocalDatabase(); // hard refusal precedes every fixture helper / DB mutation
    const safetyCheck = new pg.Client(buildPgClientConfig(cs));
    await safetyCheck.connect();
    try { await refuseProductionDatabase(safetyCheck); } finally { await safetyCheck.end(); }
    company = await createIsolatedOperatingCompany({ label: "native-qbo-gl" });
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await seed();
  });

  afterAll(async () => {
    if (db) {
      try {
        if (txOpen) await db.query("ROLLBACK");
      } finally { await db.end(); }
    }
    if (company) {
      const cs = assertApprovedLocalDatabase();
      const cleanup = new pg.Client(buildPgClientConfig(cs));
      try {
        await cleanup.connect();
        await refuseProductionDatabase(cleanup);
        await cleanup.query("SET ROLE ih35_app");
        await cleanup.query("BEGIN");
        await cleanup.query("SET LOCAL app.bypass_rls='lucia'");
        await deactivateIsolatedOperatingCompany(cleanup, company);
        await cleanup.query("COMMIT");
      } finally { await cleanup.end(); }
    }
  });

  async function provePosts(type: string, id: string): Promise<void> {
    const metadataQuery: Record<string, { sql: string; params: unknown[] }> = {
      invoice: { sql: `SELECT source_system AS source, qbo_invoice_id AS external_id FROM accounting.invoices WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      bill: { sql: `SELECT source_system AS source, qbo_bill_id AS external_id FROM accounting.bills WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      bill_payment: { sql: `SELECT source_system AS source, qbo_bill_payment_id AS external_id FROM accounting.bill_payments WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      expense: { sql: `SELECT 'qbo'::text AS source, qbo_purchase_id AS external_id FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      customer_payment: { sql: `SELECT source_system AS source, qbo_payment_id AS external_id FROM accounting.payments WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      customer_payment_deposit: { sql: `SELECT source_system AS source, qbo_payment_id AS external_id FROM accounting.payments WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      factoring_advance_deposit: { sql: `SELECT source_system AS source, qbo_advance_id AS external_id FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
      credit_memo: { sql: `SELECT source_system AS source, qbo_credit_memo_id AS external_id FROM accounting.credit_memos WHERE id=$1::uuid AND operating_company_id=$2::uuid`, params: [id, company.companyId] },
    };
    const metadata = metadataQuery[type];
    if (!metadata) throw new Error(`Missing QBO metadata assertion for source type ${type}`);
    const sourceRows = await query<{ source: string; external_id: string }>(metadata.sql, metadata.params);
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0].source).toBe("qbo");
    expect(sourceRows[0].external_id).toBeTruthy();
    const input = { operating_company_id: company.companyId, source_transaction_type: type as never, source_transaction_id: id };
    const first = await postSourceTransactionInClientTx(db, input, { userId: actorId });
    expect(first.result).toBe("posted");
    const rows = await query<{ journal_entry_uuid: string; debit_or_credit: string; amount_cents: string; source_transaction_id: string; source_transaction_type: string }>(
      `SELECT p.journal_entry_uuid::text,p.debit_or_credit,p.amount_cents::text,p.source_transaction_id,p.source_transaction_type
         FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id=$1::uuid AND p.journal_entry_uuid=$2::uuid
          AND p.source_transaction_type=$3 AND p.source_transaction_id=$4
        ORDER BY p.line_sequence`, [company.companyId, first.journal_entry_id, type, id]
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source_transaction_type === type && r.source_transaction_id === id)).toBe(true);
    const dr = rows.filter((r) => r.debit_or_credit === "debit").reduce((n, r) => n + Number(r.amount_cents), 0);
    const cr = rows.filter((r) => r.debit_or_credit === "credit").reduce((n, r) => n + Number(r.amount_cents), 0);
    expect(dr).toBe(amountCents);
    expect(cr).toBe(amountCents);
    const retry = await postSourceTransactionInClientTx(db, input, { userId: actorId });
    expect(retry.result).toBe("already_posted");
    expect(retry.journal_entry_id).toBe(first.journal_entry_id);
    const count = await query<{ count: string; lines: string }>(
      `SELECT count(DISTINCT journal_entry_uuid)::text AS count, count(*)::text AS lines FROM accounting.journal_entry_postings
        WHERE operating_company_id=$1::uuid AND source_transaction_type=$2 AND source_transaction_id=$3`, [company.companyId, type, id]
    );
    expect(Number(count[0].count)).toBe(1);
    expect(Number(count[0].lines)).toBe(2);
  }

  async function expectRefusal(type: string, id: string, code: string): Promise<void> {
    await db.query("SAVEPOINT expected_posting_refusal");
    let error: unknown;
    try {
      await postSourceTransactionInClientTx(
        db,
        { operating_company_id: company.companyId, source_transaction_type: type as never, source_transaction_id: id },
        { userId: actorId }
      );
    } catch (caught) { error = caught; }
    await db.query("ROLLBACK TO SAVEPOINT expected_posting_refusal");
    await db.query("RELEASE SAVEPOINT expected_posting_refusal");
    expect(error).toMatchObject({ code });
  }

  it("posts QBO-origin invoice and keeps void/draft eligibility gates", async () => {
    await provePosts("invoice", ids.invoice);
    const draftQboInvoice = randomUUID();
    await db.query(
      `INSERT INTO accounting.invoices (id,operating_company_id,customer_id,display_id,invoice_type,issue_date,due_date,subtotal_cents,tax_cents,total_cents,status,source_system,qbo_invoice_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'manual',CURRENT_DATE,CURRENT_DATE,$5,0,$5,'draft','qbo',$6)`,
      [draftQboInvoice, company.companyId, ids.customer, `INV-2026-${String((Number(docNo) % 90_000) + 10_000)}`, amountCents, `QBO-DRAFT-${suffix}`]
    );
    await expectRefusal("invoice", draftQboInvoice, "INVOICE_NOT_POSTING_ELIGIBLE");
    const voidQboInvoice = randomUUID();
    await db.query(
      `INSERT INTO accounting.invoices (id,operating_company_id,customer_id,display_id,invoice_type,issue_date,due_date,subtotal_cents,tax_cents,total_cents,status,voided_at,source_system,qbo_invoice_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'manual',CURRENT_DATE,CURRENT_DATE,$5,0,$5,'void',now(),'qbo',$6)`,
      [voidQboInvoice, company.companyId, ids.customer, `INV-2026-${String((Number(docNo) + 1) % 90_000 + 10_000)}`, amountCents, `QBO-VOID-${suffix}`]
    );
    await expectRefusal("invoice", voidQboInvoice, "INVOICE_NOT_POSTING_ELIGIBLE");
  });

  it("refuses QBO-origin bill payment until its bill's A/P has posted, then posts and retries once", async () => {
    await expectRefusal("bill_payment", ids.billPayment, "BILL_AP_NOT_POSTED");
    await provePosts("bill", ids.bill);
    await provePosts("bill_payment", ids.billPayment);
    const draft = randomUUID();
    await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number,source_system,qbo_bill_id) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'draft',$3,$4,$5,'qbo',$6)`, [draft, company.companyId, amountCents, amountCents / 100, `D-${suffix}`, `QBO-DRAFT-${suffix}`]);
    await expectRefusal("bill", draft, "BILL_NOT_POSTING_ELIGIBLE");
    const voided = randomUUID();
    await db.query(`INSERT INTO accounting.bills (id,operating_company_id,bill_date,status,amount_cents,total_amount,bill_number,source_system,qbo_bill_id,revoked_at,revoked_reason) VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'void',$3,$4,$5,'qbo',$6,now(),'fixture void')`, [voided, company.companyId, amountCents, amountCents / 100, `V-${suffix}`, `QBO-VOID-${suffix}`]);
    await expectRefusal("bill", voided, "BILL_NOT_POSTING_ELIGIBLE");
  });

  it("posts a QBO-origin expense", async () => {
    await provePosts("expense", ids.expenseDoc);
  });

  it("posts a QBO-origin customer payment", async () => {
    await provePosts("customer_payment", ids.payment);
  });

  it("posts a QBO-origin customer payment deposit sweep", async () => {
    await provePosts("customer_payment_deposit", ids.payment);
  });

  it("posts a QBO-origin factoring advance deposit sweep", async () => {
    await provePosts("factoring_advance_deposit", ids.advance);
  });

  it("posts a QBO-origin credit memo", async () => {
    await provePosts("credit_memo", ids.creditMemo);
  });

  it("scopes the actual lineage guard SQL and refuses historical NULL-company postings", async () => {
    const guard = await import(new URL("../../../../../scripts/verify-every-load-born-posting-carries-its-load.mjs", import.meta.url).href);
    const local = new pg.Client(buildPgClientConfig(assertApprovedLocalDatabase()));
    await local.connect();
    try {
      await refuseProductionDatabase(local);
      // The fixture takes the real posting table's columns (no data, no NOT NULL / defaults) so it never drifts from
      // what the guard reads: a hand-listed column set broke when 443.192 (#26930) taught the guard jep.reversed_by_line_id.
      await local.query(`CREATE TEMP TABLE lineage_scope_fixture AS
        SELECT * FROM accounting.journal_entry_postings WITH NO DATA`);
      const target = "5c854333-6ea5-4faa-af31-67cb272fef80";
      for (const opco of [target, randomUUID(), null]) {
        await local.query(`INSERT INTO pg_temp.lineage_scope_fixture
          (id,operating_company_id,source_transaction_type,source_transaction_id,load_id,created_at)
          VALUES ($1,$2,'expense',$3,$4,CASE WHEN $2::uuid IS NULL THEN '2000-01-01'::timestamptz ELSE now() END)`,
        [randomUUID(), opco, randomUUID(), randomUUID()]);
      }
      let sqlText = "";
      let bindings: unknown[] = [];
      const result = await guard.measure({ query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes("FROM _system._schema_migrations")) return { rows: [{ applied_at: new Date("2026-01-01") }] };
        if (sql.includes("FROM accounting.journal_entry_postings jep")) {
          sqlText = sql.replace("FROM accounting.journal_entry_postings jep", "FROM pg_temp.lineage_scope_fixture jep");
          bindings = params;
          return local.query(sqlText, params);
        }
        return local.query(sql, params);
      } });
      expect(bindings[1]).toBe(target);
      expect(result.mismatched).toHaveLength(1);
      expect(result.null_company).toBe(1);
      expect(guard.liveFailures({ mismatched: [], null_company: result.null_company })).toHaveLength(1);
      const noScope = sqlText.replace("(jep.operating_company_id = $2::uuid OR jep.operating_company_id IS NULL)", "($2::uuid IS NOT NULL)");
      expect(noScope).not.toBe(sqlText);
      expect((await local.query(noScope, bindings)).rows[0].mismatched).toHaveLength(2);
      const noNull = sqlText.replace(" OR jep.operating_company_id IS NULL", "");
      expect(noNull).not.toBe(sqlText);
      expect((await local.query(noNull, bindings)).rows[0].null_company).toBe(0);
    } finally {
      await local.query("ROLLBACK").catch(() => {});
      await local.end();
    }
  });
});
