/**
 * GAP-EXPENSES Phase 2 Step 3 — expense → GL posting (real Postgres).
 * Proves buildExpenseLines via postSourceTransaction:
 *   - a posted expense produces a BALANCED JE (SUM debit = SUM credit), DR expense / CR bank.
 *   - the orphan guard (no payment account AND no vendor) fails loud.
 * The endpoint-level flag/role/synthesis/void are covered by the on-branch verification.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction, PostingEngineError } from "../posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense → GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID();
  const driverId = randomUUID();
  const uncatAccountId = randomUUID();
  const cashAccountId = randomUUID();
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const createdExpenseIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    // some policies (e.g. chart_of_accounts_roles) key only on app.operating_company_id, not bypass
    if (companyId) await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  // read with RLS context (journal_entry_postings etc. are operating_company_id-scoped)
  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      // a real user for withCurrentUser(app.current_user_id)
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `gl-post-${suffix}@test.local`]
      );
      // posting CoA accounts + the uncategorized_expense role for this company
      await db.query(`INSERT INTO catalogs.accounts (id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2,'Uncat Test','Expense',true)`, [uncatAccountId, `T${suffix.slice(0,6)}`]);
      await db.query(`INSERT INTO catalogs.accounts (id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2,'Bank Test','Asset',true)`, [cashAccountId, `B${suffix.slice(0,6)}`]);
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'uncategorized_expense',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING`,
        [companyId, uncatAccountId]
      );
      await db.query(`INSERT INTO mdata.drivers (id, first_name, last_name, phone) VALUES ($1::uuid,'GL','Post',$2)`, [driverId, `+1002${suffix.slice(0,7)}`]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE account_id = ANY($1::uuid[])`, [[uncatAccountId, cashAccountId]]);
        await db.query(`DELETE FROM accounting.expense_lines WHERE expense_id = ANY($1::uuid[])`, [createdExpenseIds]);
        await db.query(`DELETE FROM accounting.expenses WHERE id = ANY($1::uuid[])`, [createdExpenseIds]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND role='uncategorized_expense'`, [companyId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id=$1::uuid`, [driverId]);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  async function seedExpense(opts: { paymentAccount: string | null; vendor: string | null; lines: number[] }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.expenses (id, operating_company_id, driver_uuid, transaction_date, total_amount_cents, status, posting_status, payment_account_uuid, vendor_uuid)
         VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,'posted','unposted',$5,$6)`,
        [id, companyId, driverId, opts.lines.reduce((a, b) => a + b, 0), opts.paymentAccount, opts.vendor]
      );
      let seq = 1;
      for (const c of opts.lines) {
        await db.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description) VALUES ($1::uuid,$2,$3,$4,'uncat')`,
          [id, seq++, c, c / 100]
        );
      }
    });
    createdExpenseIds.push(id);
    return id;
  }

  it("posts a balanced JE (DR uncategorized expense, CR bank); SUM(debit)=SUM(credit)", async () => {
    const id = await seedExpense({ paymentAccount: cashAccountId, vendor: null, lines: [3000, 2000] });
    const result = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: "expense", source_transaction_id: id },
      { userId }
    );
    expect(result.journal_entry_id).toBeTruthy();
    const sums = await scopedRead<{ dr: string; cr: string }>(
      `SELECT
         COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
         COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
       FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
      [result.journal_entry_id]
    );
    expect(Number(sums[0].dr)).toBe(5000);
    expect(Number(sums[0].cr)).toBe(5000); // balanced
    const credit = await scopedRead<{ account_id: string }>(
      `SELECT account_id::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='credit'`,
      [result.journal_entry_id]
    );
    expect(credit[0].account_id).toBe(cashAccountId); // cash-basis: CR bank
  });

  it("orphan guard: no payment account AND no vendor → fails loud (no orphan payable)", async () => {
    const id = await seedExpense({ paymentAccount: null, vendor: null, lines: [1000] });
    let threw = false;
    try {
      await postSourceTransaction(
        { operating_company_id: companyId, source_transaction_type: "expense", source_transaction_id: id },
        { userId }
      );
    } catch { threw = true; }
    // orphan guard fires (ACCOUNT_MAPPING_MISSING) → post rejects; the proof is NO journal entry was created.
    expect(threw).toBe(true);
    const posted = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entries je
       JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
       WHERE p.source_transaction_id = $1 AND p.source_transaction_type = 'expense'`,
      [id]
    );
    expect(Number(posted[0].c)).toBe(0); // no orphan JE posted
  });
});
