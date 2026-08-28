/**
 * EMPTY-POSTING-GATE-CLASS golden test (CC-2) — driver reimbursement → GL posting END-TO-END
 * (real Postgres). Per docs/lockdown/EMPTY-POSTING-GATE-CLASS-2026-08-28.md: "Golden tests (CC-2)
 * assert accounts + signs once per type. Leaves inherit." Traced from the live poster
 * (buildDriverReimbursementLines in posting-engine.service.ts) rather than assumed:
 *
 *   DR reimbursement_expense · CR resolved cash account (operating_bank role, when the
 *      reimbursement names no from_bank_account_id and the caller supplies no explicit
 *      credit_account_id — ACCT-F345's fail-closed disbursement default). SUM(dr) = SUM(cr).
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

describeIntegration("driver reimbursement → GL posting end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let isolated: IsolatedOperatingCompany;
  const suffix = randomUUID().slice(0, 6);
  const reimbExpenseAccountId = randomUUID();
  const operatingBankAccountId = randomUUID();
  const driverId = randomUUID();
  const userId = "00000000-0000-4000-8000-0000000000dd";
  const createdReimbursementIds: string[] = [];

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
    isolated = await createIsolatedOperatingCompany({ label: "driver-reimb-gl" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `driver-reimb-gl-${suffix}@test.local`]
      );
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status) VALUES ($1::uuid,$2::uuid,'Reimb','Driver',$3,'Active')`,
        [driverId, companyId, `95608${suffix.slice(0, 5)}`]
      );
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'Reimb Expense Test','Expense',true)`, [reimbExpenseAccountId, `E${suffix}`, companyId]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$3::uuid,$2,'Operating Bank Test','Asset',true)`, [operatingBankAccountId, `B${suffix}`, companyId]);
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'reimbursement_expense',$2::uuid,true)`,
        [companyId, reimbExpenseAccountId]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'operating_bank',$2::uuid,true)`,
        [companyId, operatingBankAccountId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='driver_reimbursement'`, [createdReimbursementIds]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='driver_reimbursement'`, [createdReimbursementIds]);
        await db.query(`DELETE FROM driver_finance.driver_reimbursements WHERE id = ANY($1::uuid[])`, [createdReimbursementIds]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[reimbExpenseAccountId, operatingBankAccountId]]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = $1::uuid`, [driverId]);
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  async function seedReimbursement(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.driver_reimbursements
           (id, operating_company_id, driver_id, reimbursement_type, amount_cents, reason, status, paid_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'lumper',$4,'TEST DATA golden test','paid',now())`,
        [id, companyId, driverId, amountCents]
      );
    });
    createdReimbursementIds.push(id);
    return id;
  }

  it("posts a BALANCED JE: DR reimbursement_expense, CR operating_bank (cash)", async () => {
    const id = await seedReimbursement(8_750);
    const result = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: "driver_reimbursement", source_transaction_id: id },
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
    console.log("EMPTY-POSTING-GATE-CLASS golden (driver reimbursement) posted JE:\n" + rows.map((r) => `  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_number}  $${(Number(r.amount_cents) / 100).toFixed(2)}`).join("\n"));

    const debits = rows.filter((r) => r.debit_or_credit === "debit");
    const credits = rows.filter((r) => r.debit_or_credit === "credit");

    expect(debits).toHaveLength(1);
    expect(debits[0].account_id).toBe(reimbExpenseAccountId); // DR reimbursement_expense
    expect(Number(debits[0].amount_cents)).toBe(8_750);

    expect(credits).toHaveLength(1);
    expect(credits[0].account_id).toBe(operatingBankAccountId); // CR operating_bank (cash)
    expect(Number(credits[0].amount_cents)).toBe(8_750);

    const totalDr = debits.reduce((s, r) => s + Number(r.amount_cents), 0);
    const totalCr = credits.reduce((s, r) => s + Number(r.amount_cents), 0);
    expect(totalDr).toBe(totalCr); // balanced
  });
});
