/**
 * EMPTY-POSTING-GATE-CLASS golden test (CC-2) — customer payment → GL posting END-TO-END
 * (real Postgres). Per docs/lockdown/EMPTY-POSTING-GATE-CLASS-2026-08-28.md: "Golden tests (CC-2)
 * assert accounts + signs once per type. Leaves inherit." Traced from the live poster
 * (buildCustomerPaymentLines in posting-engine.service.ts) rather than assumed:
 *
 *   DR resolved cash/deposit account (undeposited_funds role, when deposited_to_account_id is
 *      unset/"ops_checking") · CR ar_control. SUM(dr) = SUM(cr).
 *
 * Same real-Postgres pattern as bill-gl-posting.db.test.ts / expense-gl-posting.db.test.ts. Runs
 * only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction } from "../posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer payment → GL posting end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  const suffix = randomUUID().slice(0, 6);
  const arAccountId = randomUUID();
  const undepositedAccountId = randomUUID();
  const customerId = randomUUID();
  const userId = "00000000-0000-4000-8000-0000000000cc";
  const createdPaymentIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "customer-payment-gl" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `customer-payment-gl-${suffix}@test.local`]
      );
      await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [
        customerId,
        companyId,
        `TEST DATA Customer Payment GL ${suffix}`,
      ]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'AR Test','Asset',true)`, [arAccountId, `R${suffix}`, companyId]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'Undeposited Test','Asset',true)`, [undepositedAccountId, `D${suffix}`, companyId]);
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ar_control',$2::uuid,true)`,
        [companyId, arAccountId]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'undeposited_funds',$2::uuid,true)`,
        [companyId, undepositedAccountId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='customer_payment'`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='customer_payment'`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.payments WHERE id = ANY($1::uuid[])`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[arAccountId, undepositedAccountId]]);
        await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  async function seedPayment(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.payments (id, operating_company_id, customer_id, display_id, payment_method, payment_date, amount_cents)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'check',CURRENT_DATE,$5)`,
        [id, companyId, customerId, `PMT-${suffix}-${createdPaymentIds.length + 1}`, amountCents]
      );
    });
    createdPaymentIds.push(id);
    return id;
  }

  it("posts a BALANCED JE: DR undeposited_funds (cash), CR ar_control", async () => {
    const id = await seedPayment(42_500);
    const result = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: "customer_payment", source_transaction_id: id },
      { userId }
    );
    expect(result.journal_entry_id).toBeTruthy();

    const rows = await scopedRead<{ account_id: string; account_number: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT p.account_id::text AS account_id, a.account_number, p.debit_or_credit, p.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.journal_entry_uuid = $1::uuid
        ORDER BY p.debit_or_credit DESC, p.line_sequence ASC`,
      [result.journal_entry_id]
    );
    // eslint-disable-next-line no-console
    console.log("EMPTY-POSTING-GATE-CLASS golden (customer payment) posted JE:\n" + rows.map((r) => `  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_number}  $${(Number(r.amount_cents) / 100).toFixed(2)}`).join("\n"));

    const debits = rows.filter((r) => r.debit_or_credit === "debit");
    const credits = rows.filter((r) => r.debit_or_credit === "credit");

    expect(debits).toHaveLength(1);
    expect(debits[0].account_id).toBe(undepositedAccountId); // DR undeposited_funds (cash side)
    expect(Number(debits[0].amount_cents)).toBe(42_500);

    expect(credits).toHaveLength(1);
    expect(credits[0].account_id).toBe(arAccountId); // CR ar_control
    expect(Number(credits[0].amount_cents)).toBe(42_500);

    const totalDr = debits.reduce((s, r) => s + Number(r.amount_cents), 0);
    const totalCr = credits.reduce((s, r) => s + Number(r.amount_cents), 0);
    expect(totalDr).toBe(totalCr); // balanced
  });
});
