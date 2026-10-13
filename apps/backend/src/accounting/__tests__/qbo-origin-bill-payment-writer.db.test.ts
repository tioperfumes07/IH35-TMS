/** R443.117 9b — QBO bills must use the native bill-payment writer and stay atomic. */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { payBillInClientTx } from "../bills.service.js";
import { postSourceTransactionInClientTx } from "../posting-engine.service.js";
import { applyVendorBillPaymentBatch } from "../vendor-bill-payments.routes.js";
import { registerApPaymentApplicationRoutes } from "../../ap/payment-application.routes.js";
import { UNPOSTED_CASH_SQL } from "../../../../../scripts/verify-no-bill-payment-without-postings.mjs";

// The AP route's transaction callback is adapted to this suite's already-open real DB transaction.
// Only auth/company-scope wiring is replaced; route SQL, feature-flag lookup, posting engine, and bank
// updates remain real. This prevents withCurrentUser from committing test money outside the savepoint.
const apRouteScope = vi.hoisted(() => ({ client: null as { query: (sql: string, params?: unknown[]) => Promise<unknown> } | null }));
vi.mock("../shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared.js")>();
  return {
    ...actual,
    withCompanyScope: async (_userId: string, operatingCompanyId: string, fn: (client: never) => Promise<unknown>) => {
      const client = apRouteScope.client;
      if (!client) throw new Error("AP-route test adapter is missing its scoped DB client");
      await client.query("SELECT set_config('app.operating_company_id',$1::text,true)", [operatingCompanyId]);
      return fn(client as never);
    },
  };
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const approvedDatabases = new Set(["ih35_9a_fresh_proof", "ih35_9b_fresh_proof", "ih35_verify", "ih35_bcf09_scope_proof"]);
const actorId = "00000000-0000-4000-8000-00000000009b";
const amountCents = 12_345;

describeIntegration("QBO-origin bill payment writer (real local PostgreSQL)", () => {
  let db: pg.Client;
  let company: IsolatedOperatingCompany;
  let txOpen = false;
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const ids = { vendor: randomUUID(), expense: randomUUID(), ap: randomUUID(), bankGl: randomUUID(), bank: randomUUID(), bill: randomUUID(), unpostedBill: randomUUID(), batchBill: randomUUID(), batchUnpostedBill: randomUUID(), routeBill: randomUUID(), routeUnpostedBill: randomUUID() };
  let testSavepointOpen = false;
  let apPaymentHandler: ((req: Record<string, unknown>, reply: { code: (status: number) => unknown; send: (payload: unknown) => unknown }) => Promise<unknown>) | null = null;

  function approvedLocalConnection(): string {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    refuseProductionConnectionString(cs);
    const url = new URL(cs);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !approvedDatabases.has(database)) {
      throw new Error("Refusing bill-payment writer proof: only approved loopback PostgreSQL databases are allowed");
    }
    return cs;
  }

  async function query<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    return (await db.query(sql, values)).rows as T[];
  }

  async function seed(): Promise<void> {
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    txOpen = true;
    await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id',$1::text,true)", [company.companyId]);
    await db.query(`INSERT INTO mdata.vendors(id,operating_company_id,vendor_name,vendor_type,source_system) VALUES($1::uuid,$2::uuid,$3,'other','qbo')`, [ids.vendor, company.companyId, `QBO vendor ${suffix}`]);
    const account = (id: string, name: string, type: string, number: string) => db.query(
      `INSERT INTO catalogs.accounts(id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES($1::uuid,$2::uuid,$3,$4,$5,true)`,
      [id, company.companyId, number, name, type]
    );
    await account(ids.expense, "Bill writer expense", "Expense", `EX${suffix}`);
    await account(ids.ap, "Bill writer AP", "Liability", `AP${suffix}`);
    await account(ids.bankGl, "Bill writer bank GL", "Asset", `BK${suffix}`);
    await db.query(`INSERT INTO accounting.chart_of_accounts_roles(operating_company_id,role,account_id,is_active) VALUES($1::uuid,'ap_control',$2::uuid,true)`, [company.companyId, ids.ap]);
    await db.query(`INSERT INTO accounting.expense_category_account_map(operating_company_id,category_kind,category_code,account_id,posting_side,is_active) VALUES($1::uuid,'other',$2,$3::uuid,'debit',true)`, [company.companyId, `OTHER-${suffix}`, ids.expense]);
    await db.query(`INSERT INTO banking.bank_accounts(id,operating_company_id,account_name,account_type,ledger_account_id,current_balance_cents,is_active,sync_status) VALUES($1::uuid,$2::uuid,'Writer test bank','checking',$3::uuid,100000,true,'active')`, [ids.bank, company.companyId, ids.bankGl]);
    const bill = (id: string, status: string, external: string) => db.query(
      `INSERT INTO accounting.bills(id,operating_company_id,vendor_id,bill_date,status,amount_cents,total_amount,bill_number,source_system,qbo_bill_id,mdata_vendor_id)
       VALUES($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,$6,$7,'qbo',$8,$3::uuid)`,
      [id, company.companyId, ids.vendor, status, amountCents, amountCents / 100, `B-${suffix}-${external}`, external]
    );
    await bill(ids.bill, "unpaid", `QBO-BILL-${suffix}`);
    await bill(ids.unpostedBill, "unpaid", `QBO-UNPOSTED-${suffix}`);
    await bill(ids.batchBill, "unpaid", `QBO-BATCH-${suffix}`);
    await bill(ids.batchUnpostedBill, "unpaid", `QBO-BATCH-UNPOSTED-${suffix}`);
    await bill(ids.routeBill, "unpaid", `QBO-ROUTE-${suffix}`);
    await bill(ids.routeUnpostedBill, "unpaid", `QBO-ROUTE-UNPOSTED-${suffix}`);
    for (const billId of [ids.bill, ids.unpostedBill, ids.batchBill, ids.batchUnpostedBill, ids.routeBill, ids.routeUnpostedBill]) {
      await db.query(`INSERT INTO accounting.bill_lines(bill_id,line_sequence,amount,description,account_id) VALUES($1::uuid,1,$2,'QBO bill writer line',$3::uuid)`, [billId, amountCents / 100, ids.expense]);
    }
  }

  beforeAll(async () => {
    const cs = approvedLocalConnection();
    const safety = new pg.Client(buildPgClientConfig(cs));
    await safety.connect();
    try { await refuseProductionDatabase(safety); } finally { await safety.end(); }
    company = await createIsolatedOperatingCompany({ label: "qbo-bill-writer" });
    // payBillInClientTx resolves this override through the application pool, so the actor and flag
    // must be committed before the caller-owned money transaction starts.
    const bootstrap = new pg.Client(buildPgClientConfig(cs));
    await bootstrap.connect();
    try {
      await refuseProductionDatabase(bootstrap);
      await bootstrap.query("SET ROLE ih35_app");
      await bootstrap.query("BEGIN");
      await bootstrap.query("SET LOCAL app.bypass_rls='lucia'");
      await bootstrap.query("SET LOCAL app.allow_owner_bootstrap='1'");
      await bootstrap.query(`INSERT INTO identity.users(id,email,role,preferred_language) VALUES($1::uuid,$2,'Owner','en') ON CONFLICT(id) DO NOTHING`, [actorId, `bill-writer-${suffix}@test.local`]);
      await bootstrap.query(`INSERT INTO lib.feature_flag_overrides(flag_key,operating_company_id,user_uuid,enabled,set_by_user_uuid) VALUES('BILL_PAYMENT_GL_POSTING_ENABLED',$1::uuid,$2::uuid,true,$2::uuid) ON CONFLICT (flag_key,user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled=true`, [company.companyId, actorId]);
      await bootstrap.query("COMMIT");
    } finally { await bootstrap.end(); }
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await seed();
    apRouteScope.client = db as unknown as typeof apRouteScope.client;
    await registerApPaymentApplicationRoutes({
      post: (...args: unknown[]) => { apPaymentHandler = args[2] as typeof apPaymentHandler; },
    } as never);
  });

  afterAll(async () => {
    apRouteScope.client = null;
    if (db) {
      try { if (txOpen) await db.query("ROLLBACK"); }
      finally { await db.end(); }
    }
    if (company) {
      const cleanup = new pg.Client(buildPgClientConfig(approvedLocalConnection()));
      try {
        await cleanup.connect();
        await refuseProductionDatabase(cleanup);
        await cleanup.query("SET ROLE ih35_app");
        await cleanup.query("BEGIN");
        await cleanup.query("SET LOCAL app.bypass_rls='lucia'");
        await cleanup.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='BILL_PAYMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid AND user_uuid=$2::uuid`, [company.companyId, actorId]);
        await cleanup.query(`DELETE FROM identity.users WHERE id=$1::uuid AND email=$2`, [actorId, `bill-writer-${suffix}@test.local`]);
        await deactivateIsolatedOperatingCompany(cleanup, company);
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK");
        throw error;
      } finally { await cleanup.end(); }
    }
  });

  beforeEach(async () => {
    await db.query("SAVEPOINT isolated_test");
    testSavepointOpen = true;
  });

  afterEach(async () => {
    if (testSavepointOpen) {
      await db.query("ROLLBACK TO SAVEPOINT isolated_test");
      await db.query("RELEASE SAVEPOINT isolated_test");
      testSavepointOpen = false;
    }
  });

  it("creates a QBO bill payment, GL and bank-cache decrement atomically", async () => {
    const postedBill = await postSourceTransactionInClientTx(db, { operating_company_id: company.companyId, source_transaction_type: "bill", source_transaction_id: ids.bill }, { userId: actorId });
    expect(postedBill.result).toBe("posted");
    const before = (await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance;
    const payment = await payBillInClientTx(db as unknown as pg.PoolClient, { operatingCompanyId: company.companyId, billId: ids.bill, paymentDate: new Date().toISOString().slice(0, 10), amountCents, paymentMethod: "ach", fromBankAccountId: ids.bank }, actorId);
    const lines = await query<{ side: string; cents: string }>(`SELECT debit_or_credit AS side,amount_cents::text AS cents FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_type='bill_payment' AND source_transaction_id=$2 ORDER BY line_sequence`, [company.companyId, payment.id]);
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    expect(lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    const after = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    expect(after).toBe(Number(before) - amountCents);
    const retry = await postSourceTransactionInClientTx(db, { operating_company_id: company.companyId, source_transaction_type: "bill_payment", source_transaction_id: payment.id }, { userId: actorId });
    expect(retry.result).toBe("already_posted");
    expect((await query(`SELECT id FROM accounting.journal_entry_postings WHERE source_transaction_type='bill_payment' AND source_transaction_id=$1`, [payment.id])).length).toBe(2);
  });

  it("settlementDeductionNoncash creates no standalone cash JE", async () => {
    const noncashBill = await query<{ id: string }>(`INSERT INTO accounting.bills(id,operating_company_id,vendor_id,bill_date,status,amount_cents,total_amount,bill_number,source_system,qbo_bill_id,mdata_vendor_id) VALUES($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,'unpaid',$4,$5,$6,'qbo',$7,$3::uuid) RETURNING id::text`, [randomUUID(), company.companyId, ids.vendor, amountCents, amountCents / 100, `NC-${suffix}`, `QBO-NC-${suffix}`]);
    const noncashId = noncashBill[0]!.id;
    await db.query(`INSERT INTO accounting.bill_lines(bill_id,line_sequence,amount,description,account_id) VALUES($1::uuid,1,$2,'noncash QBO bill',$3::uuid)`, [noncashId, amountCents / 100, ids.expense]);
    await postSourceTransactionInClientTx(db, { operating_company_id: company.companyId, source_transaction_type: "bill", source_transaction_id: noncashId }, { userId: actorId });
    const noncash = await payBillInClientTx(db as unknown as pg.PoolClient, { operatingCompanyId: company.companyId, billId: noncashId, paymentDate: new Date().toISOString().slice(0, 10), amountCents, paymentMethod: "ach", settlementDeductionNoncash: true }, actorId);
    expect(noncash.gl_posting).toMatchObject({ posted: false, reason: "settlement_noncash_application" });
    expect((await query(`SELECT id FROM accounting.journal_entry_postings WHERE source_transaction_type='bill_payment' AND source_transaction_id=$1`, [noncash.id]))).toHaveLength(0);
  });

  it("batch writer creates a native QBO bill-payment JE and bank decrement", async () => {
    const billPost = await postSourceTransactionInClientTx(db, { operating_company_id: company.companyId, source_transaction_type: "bill", source_transaction_id: ids.batchBill }, { userId: actorId });
    expect(billPost.result).toBe("posted");
    const before = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    const result = await applyVendorBillPaymentBatch(db, company.companyId, ids.vendor, actorId, {
      paid_at: new Date().toISOString().slice(0, 10),
      amount_cents: amountCents,
      payment_method: "ach",
      bank_account_id: ids.bank,
      applications: [{ bill_id: ids.batchBill, amount_cents: amountCents }],
    });
    expect(result.code).toBe(201);
    if (result.code !== 201) throw new Error(`batch payment failed: ${result.error}`);
    const paymentId = result.data.bill_payment_ids[0]!;
    const lines = await query<{ side: string; cents: string }>(`SELECT debit_or_credit AS side,amount_cents::text AS cents FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_type='bill_payment' AND source_transaction_id=$2 ORDER BY line_sequence`, [company.companyId, paymentId]);
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    expect(lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    const after = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    expect(after).toBe(before - amountCents);
  });

  it("rolls back an unposted QBO bill payment and bank-cache change when the writer refuses it", async () => {
    const before = (await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance;
    let error: unknown;
    try {
      await payBillInClientTx(db as unknown as pg.PoolClient, { operatingCompanyId: company.companyId, billId: ids.unpostedBill, paymentDate: new Date().toISOString().slice(0, 10), amountCents, paymentMethod: "ach", fromBankAccountId: ids.bank }, actorId);
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: "BILL_AP_NOT_POSTED" });
    // The failed writer aborts the current transaction; recover its per-test savepoint before
    // asserting that neither row nor bank-cache mutation survived.
    await db.query("ROLLBACK TO SAVEPOINT isolated_test");
    await db.query("RELEASE SAVEPOINT isolated_test");
    testSavepointOpen = false;
    expect((await query(`SELECT id FROM accounting.bill_payments WHERE bill_id=$1::uuid`, [ids.unpostedBill]))).toHaveLength(0);
    const after = (await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance;
    expect(after).toBe(before);
  });

  it("batch writer rolls back an unposted QBO bill payment and bank-cache change", async () => {
    const before = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    let error: unknown;
    try {
      await applyVendorBillPaymentBatch(db, company.companyId, ids.vendor, actorId, {
        paid_at: new Date().toISOString().slice(0, 10),
        amount_cents: amountCents,
        payment_method: "ach",
        bank_account_id: ids.bank,
        applications: [{ bill_id: ids.batchUnpostedBill, amount_cents: amountCents }],
      });
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: "BILL_AP_NOT_POSTED" });
    await db.query("ROLLBACK TO SAVEPOINT isolated_test");
    await db.query("RELEASE SAVEPOINT isolated_test");
    testSavepointOpen = false;
    expect((await query(`SELECT id FROM accounting.bill_payments WHERE bill_id=$1::uuid`, [ids.batchUnpostedBill]))).toHaveLength(0);
    expect(Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance)).toBe(before);
  });

  it("AP payment-application route posts a QBO bill payment and decrements bank balance", async () => {
    const billPost = await postSourceTransactionInClientTx(db, { operating_company_id: company.companyId, source_transaction_type: "bill", source_transaction_id: ids.routeBill }, { userId: actorId });
    expect(billPost.result).toBe("posted");
    const before = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    const replyState: { status?: number; payload?: unknown } = {};
    const reply = {
      code(status: number) { replyState.status = status; return this; },
      send(payload: unknown) { replyState.payload = payload; return payload; },
    };
    if (!apPaymentHandler) throw new Error("AP bill-payment route handler was not registered");
    await apPaymentHandler({
      user: { uuid: actorId, email: null, role: "Owner" },
      session: { id: `test-${suffix}` },
      query: { operating_company_id: company.companyId },
      body: {
        vendor_id: ids.vendor,
        paid_at: new Date().toISOString().slice(0, 10),
        amount_cents: amountCents,
        payment_method: "ach",
        bank_account_id: ids.bank,
        applications: [{ bill_id: ids.routeBill, amount_cents: amountCents }],
      },
    }, reply);
    expect(replyState.status).toBe(201);
    const payload = replyState.payload as { bill_payment_ids: string[] };
    const paymentId = payload.bill_payment_ids[0]!;
    const lines = await query<{ side: string; cents: string }>(`SELECT debit_or_credit AS side,amount_cents::text AS cents FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_type='bill_payment' AND source_transaction_id=$2 ORDER BY line_sequence`, [company.companyId, paymentId]);
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.side === "debit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    expect(lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + Number(line.cents), 0)).toBe(amountCents);
    expect(Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance)).toBe(before - amountCents);
  });

  it("AP payment-application route rolls back an unposted QBO bill payment and bank balance", async () => {
    const before = Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance);
    if (!apPaymentHandler) throw new Error("AP bill-payment route handler was not registered");
    let error: unknown;
    try {
      await apPaymentHandler({
        user: { uuid: actorId, email: null, role: "Owner" },
        session: { id: `test-${suffix}` },
        query: { operating_company_id: company.companyId },
        body: {
          vendor_id: ids.vendor,
          paid_at: new Date().toISOString().slice(0, 10),
          amount_cents: amountCents,
          payment_method: "ach",
          bank_account_id: ids.bank,
          applications: [{ bill_id: ids.routeUnpostedBill, amount_cents: amountCents }],
        },
      }, { code: () => ({ send: () => undefined }), send: () => undefined });
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: "BILL_AP_NOT_POSTED" });
    await db.query("ROLLBACK TO SAVEPOINT isolated_test");
    await db.query("RELEASE SAVEPOINT isolated_test");
    testSavepointOpen = false;
    expect((await query(`SELECT id FROM accounting.bill_payments WHERE bill_id=$1::uuid`, [ids.routeUnpostedBill]))).toHaveLength(0);
    expect(Number((await query<{ balance: string }>(`SELECT current_balance_cents::text AS balance FROM banking.bank_accounts WHERE id=$1::uuid`, [ids.bank]))[0]!.balance)).toBe(before);
  });

  it("unposted-cash guard counts QBO + NULL-company gaps, but not other-company or posted rows", async () => {
    const scopedCompanyId = randomUUID();
    const unrelatedCompanyId = randomUUID();
    const postedQboId = randomUUID();
    const unpostedQboId = randomUUID();
    const otherCompanyId = randomUUID();
    const nullCompanyVoidId = randomUUID();
    await db.query(`CREATE TEMP TABLE test_bill_payments (
      id uuid PRIMARY KEY, operating_company_id uuid, source_system text,
      settlement_deduction_noncash boolean, voided_at timestamptz, revoked_at timestamptz,
      status text, is_sample_data boolean
    )`);
    await db.query(`CREATE TEMP TABLE test_journal_entry_postings (
      operating_company_id uuid, source_transaction_type text, source_transaction_id text
    )`);
    await db.query(
      `INSERT INTO pg_temp.test_bill_payments(id,operating_company_id,source_system,settlement_deduction_noncash,status,is_sample_data)
       VALUES ($1::uuid,$5::uuid,'qbo',false,'posted',false),
              ($2::uuid,$5::uuid,'qbo',false,'posted',false),
              ($3::uuid,$6::uuid,'qbo',false,'posted',false),
              ($4::uuid,NULL,'qbo',false,'void',false)`,
      [postedQboId, unpostedQboId, otherCompanyId, nullCompanyVoidId, scopedCompanyId, unrelatedCompanyId]
    );
    await db.query(
      `INSERT INTO pg_temp.test_journal_entry_postings(operating_company_id,source_transaction_type,source_transaction_id)
       VALUES ($1::uuid,'bill_payment',$2)`, [scopedCompanyId, postedQboId]
    );
    const sql = UNPOSTED_CASH_SQL
      .replaceAll("accounting.bill_payments", "pg_temp.test_bill_payments")
      .replaceAll("accounting.journal_entry_postings", "pg_temp.test_journal_entry_postings");
    const countFor = async (statement: string, params: unknown[] = [scopedCompanyId]) => Number((await db.query<{ n: number }>(statement, params)).rows[0]!.n);
    expect(await countFor(sql)).toBe(2); // target-company unposted QBO + NULL-company voided row fail-closed.

    const unscoped = sql.replace(
      "WHERE (bp.operating_company_id = $1::uuid OR bp.operating_company_id IS NULL)",
      "WHERE true"
    );
    expect(await countFor(unscoped, [])).toBe(3); // the unrelated company's unposted QBO payment is now exposed.

    const qboExemptAgain = sql.replace(
      "NOT COALESCE(bp.settlement_deduction_noncash, false)",
      "NOT COALESCE(bp.settlement_deduction_noncash, false)\n       AND lower(COALESCE(bp.source_system, '')) <> 'qbo'"
    );
    expect(await countFor(qboExemptAgain)).toBe(1); // restoring a QBO skip hides the target QBO gap.
  });
});
