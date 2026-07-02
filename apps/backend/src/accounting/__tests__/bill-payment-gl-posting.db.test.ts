/**
 * CHAIN-04 (BLOCK-02) — bill-payment → GL posting GAP-CLOSURE, END-TO-END (real Postgres).
 * Proves the three closed gaps in buildBillPaymentLines / the flag-gated entrypoint:
 *   GAP #1 flag — BILL_PAYMENT_GL_POSTING_ENABLED (default OFF): postBillPaymentGlIfEnabled NO-OPs
 *          when OFF; posts when a per-entity override turns it ON.
 *   GAP #2 bank leg — the CR posts to the REAL bank via banking.bank_accounts.ledger_account_id (NOT
 *          undeposited_funds/cash_clearing); fail-closed when the chosen bank has no ledger_account_id.
 *   GAP #3 accrual sequencing — the poster REFUSES (BILL_AP_NOT_POSTED, zero rows) when the bill's
 *          A/P leg was never posted (CHAIN-03), so A/P can never go negative.
 * Plus: ineligible (voided) payment and idempotent re-post.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available; the literal posted JE
 * is console.logged for the CI artifact.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction, PostingEngineError } from "../posting-engine.service.js";
import { postBillPaymentGlIfEnabled } from "../bill-payment-gl.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("CHAIN-04 bill-payment → GL gap-closure end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const fuelAccountId = randomUUID();
  const apAccountId = randomUUID();
  const bankGlAccountId = randomUUID(); // catalogs.accounts cash/bank GL account (the ledger_account_id target)
  const bankAccountId = randomUUID(); // banking.bank_accounts row WITH ledger_account_id
  const bankNoLedgerId = randomUUID(); // banking.bank_accounts row WITHOUT ledger_account_id (fail-closed)
  const userId = "00000000-0000-4000-8000-0000000000c4";
  const fuelCode = `FUEL-${suffix}`;
  const createdBillIds: string[] = [];
  const createdPaymentIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  const liveRole = async (role: string): Promise<string> => {
    const r = await scopedRead<{ account_id: string }>(
      `SELECT account_id::text AS account_id FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true ORDER BY updated_at DESC LIMIT 1`,
      [companyId, role]
    );
    const id = r[0]?.account_id;
    if (!id) throw new Error(`no mapped ${role} role for company ${companyId}`);
    return id;
  };

  async function seedBill(lines: { amount_cents: number; category_kind?: string; category_code?: string }[]): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      const total = lines.reduce((a, b) => a + b.amount_cents, 0);
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, bill_date, status, amount_cents, total_amount, bill_number)
         VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`,
        [id, companyId, total, total / 100, `BP-BILL-${suffix}-${createdBillIds.length + 1}`]
      );
      let seq = 1;
      for (const l of lines) {
        await db.query(
          `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, category_kind, category_code)
           VALUES ($1::uuid,$2,$3,$4,$5,$6)`,
          [id, seq++, l.amount_cents / 100, "line", l.category_kind ?? null, l.category_code ?? null]
        );
      }
    });
    createdBillIds.push(id);
    return id;
  }

  async function seedPayment(opts: {
    billId: string;
    amountCents: number;
    fromBankAccountId: string | null;
    status?: string;
  }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bill_payments
           (id, operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method,
            from_bank_account_id, status, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,'ach',$6,$7,$8::uuid)`,
        [id, companyId, opts.billId, opts.amountCents, opts.amountCents / 100, opts.fromBankAccountId, opts.status ?? "posted", userId]
      );
    });
    createdPaymentIds.push(id);
    return id;
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `bill-payment-gl-${suffix}@test.local`]
      );
      // company membership so withCompanyScope (the flag-gated entrypoint) resolves for this user.
      await db.query(
        `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, companyId]
      );
      // start from a clean flag state (no override) so the default (OFF) governs the flag-OFF test.
      await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='BILL_PAYMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'Fuel Test','Expense',true)`, [fuelAccountId, `F${suffix}`, companyId]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'AP Test','Liability',true)`, [apAccountId, `P${suffix}`, companyId]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'Bank GL Test','Asset',true)`, [bankGlAccountId, `B${suffix}`, companyId]);
      // ap_control role (rely on live if already seeded by BLOCK-00 migration).
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ap_control',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING`,
        [companyId, apAccountId]
      );
      // expense_category_account_map: (fuel, <unique code>) → fuel account (so the bill posts to A/P).
      await db.query(
        `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'fuel',$2,$3::uuid,'debit',true)`,
        [companyId, fuelCode, fuelAccountId]
      );
      // bank account WITH the bank→GL bridge set to our test bank GL account.
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active)
         VALUES ($1::uuid,$2::uuid,'Test Operating Bank',$3::uuid,true)`,
        [bankAccountId, companyId, bankGlAccountId]
      );
      // bank account WITHOUT a ledger_account_id (fail-closed path).
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active)
         VALUES ($1::uuid,$2::uuid,'Unmapped Bank',NULL,true)`,
        [bankNoLedgerId, companyId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='BILL_PAYMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`, [[...createdBillIds, ...createdPaymentIds]]);
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type IN ('bill','bill_payment')`, [[...createdBillIds, ...createdPaymentIds]]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`, [[...createdBillIds, ...createdPaymentIds]]);
        await db.query(`DELETE FROM accounting.bill_payments WHERE id = ANY($1::uuid[])`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = ANY($1::uuid[])`, [[bankAccountId, bankNoLedgerId]]);
        await db.query(`DELETE FROM accounting.expense_category_account_map WHERE operating_company_id=$1::uuid AND account_id=$2::uuid`, [companyId, fuelAccountId]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND account_id=$2::uuid`, [companyId, apAccountId]);
        await db.query(`DELETE FROM org.user_company_access WHERE user_id=$1::uuid AND company_id=$2::uuid`, [userId, companyId]);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  async function jeLineCount(paymentId: string): Promise<number> {
    const r = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE source_transaction_id=$1 AND source_transaction_type='bill_payment'`,
      [paymentId]
    );
    return Number(r[0].c);
  }

  async function setFlagOverride(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
         VALUES ('BILL_PAYMENT_GL_POSTING_ENABLED',$1::uuid,$2,$3::uuid)
         ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [companyId, enabled, userId]
      );
    });
  }

  it("GAP #1 — flag OFF (default): entrypoint NO-OPs, nothing posts", async () => {
    // No override seeded → default_enabled=false → posting_disabled, zero JE.
    const billId = await seedBill([{ amount_cents: 25_000, category_kind: "fuel", category_code: fuelCode }]);
    await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: billId }, { userId });
    const paymentId = await seedPayment({ billId, amountCents: 25_000, fromBankAccountId: bankAccountId });

    const outcome = await postBillPaymentGlIfEnabled(companyId, paymentId, { userId });
    expect(outcome.posted).toBe(false);
    expect((outcome as { reason: string }).reason).toBe("posting_disabled");
    expect(await jeLineCount(paymentId)).toBe(0);
  });

  it("GAP #1 ON + GAP #2 — flag ON + bill A/P posted → balanced DR ap_control / CR REAL bank (ledger_account_id)", async () => {
    const billId = await seedBill([{ amount_cents: 120_000, category_kind: "fuel", category_code: fuelCode }]);
    await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: billId }, { userId });
    const paymentId = await seedPayment({ billId, amountCents: 120_000, fromBankAccountId: bankAccountId });

    await setFlagOverride(true);
    const outcome = await postBillPaymentGlIfEnabled(companyId, paymentId, { userId });
    expect(outcome.posted).toBe(true);

    const rows = await scopedRead<{ account_id: string; account_number: string; account_name: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT p.account_id::text AS account_id, a.account_number, a.account_name, p.debit_or_credit, p.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.source_transaction_id=$1 AND p.source_transaction_type='bill_payment'
        ORDER BY p.line_sequence ASC`,
      [paymentId]
    );
    // eslint-disable-next-line no-console
    console.log("CHAIN-04 posted bill-payment JE:\n" + rows.map((r) => `  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_number} ${r.account_name}  $${(Number(r.amount_cents) / 100).toFixed(2)}`).join("\n"));

    const liveAp = await liveRole("ap_control");
    const debits = rows.filter((r) => r.debit_or_credit === "debit");
    const credits = rows.filter((r) => r.debit_or_credit === "credit");
    expect(debits).toHaveLength(1);
    expect(credits).toHaveLength(1);
    expect(debits[0].account_id).toBe(liveAp); // DR the live ap_control
    expect(Number(debits[0].amount_cents)).toBe(120_000);
    expect(credits[0].account_id).toBe(bankGlAccountId); // CR the REAL bank ledger_account_id — NOT undeposited_funds
    expect(Number(credits[0].amount_cents)).toBe(120_000);
    const totalDr = debits.reduce((s, r) => s + Number(r.amount_cents), 0);
    const totalCr = credits.reduce((s, r) => s + Number(r.amount_cents), 0);
    expect(totalDr).toBe(totalCr); // balanced

    // idempotent re-post → already_posted; still exactly ONE batch + 2 lines.
    const again = await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill_payment", source_transaction_id: paymentId }, { userId });
    expect(again.result).toBe("already_posted");
    expect(await jeLineCount(paymentId)).toBe(2);
    const batches = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.posting_batches WHERE source_transaction_id=$1 AND source_transaction_type='bill_payment'`,
      [paymentId]
    );
    expect(Number(batches[0].c)).toBe(1);
  });

  it("GAP #3 — bill A/P NOT posted → BLOCKED (BILL_AP_NOT_POSTED), zero rows, no negative A/P", async () => {
    const billId = await seedBill([{ amount_cents: 50_000, category_kind: "fuel", category_code: fuelCode }]);
    // deliberately DO NOT post the bill's A/P leg.
    const paymentId = await seedPayment({ billId, amountCents: 50_000, fromBankAccountId: bankAccountId });

    let caught: unknown = null;
    try {
      await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill_payment", source_transaction_id: paymentId }, { userId });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PostingEngineError);
    expect((caught as PostingEngineError).code).toBe("BILL_AP_NOT_POSTED");
    expect(await jeLineCount(paymentId)).toBe(0);
  });

  it("GAP #2 fail-closed — bill posted but bank has no ledger_account_id → ACCOUNT_MAPPING_MISSING, zero rows", async () => {
    const billId = await seedBill([{ amount_cents: 30_000, category_kind: "fuel", category_code: fuelCode }]);
    await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: billId }, { userId });
    const paymentId = await seedPayment({ billId, amountCents: 30_000, fromBankAccountId: bankNoLedgerId });

    let caught: unknown = null;
    try {
      await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill_payment", source_transaction_id: paymentId }, { userId });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PostingEngineError);
    expect((caught as PostingEngineError).code).toBe("ACCOUNT_MAPPING_MISSING");
    expect(await jeLineCount(paymentId)).toBe(0);
  });

  it("fail-closed — ineligible (voided) payment → PAYMENT_NOT_POSTING_ELIGIBLE, zero rows", async () => {
    const billId = await seedBill([{ amount_cents: 10_000, category_kind: "fuel", category_code: fuelCode }]);
    await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: billId }, { userId });
    const paymentId = await seedPayment({ billId, amountCents: 10_000, fromBankAccountId: bankAccountId, status: "void" });

    let caught: unknown = null;
    try {
      await postSourceTransaction({ operating_company_id: companyId, source_transaction_type: "bill_payment", source_transaction_id: paymentId }, { userId });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PostingEngineError);
    expect((caught as PostingEngineError).code).toBe("PAYMENT_NOT_POSTING_ELIGIBLE");
    expect(await jeLineCount(paymentId)).toBe(0);
  });
});
