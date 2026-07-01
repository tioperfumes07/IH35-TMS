/**
 * GAP-EXPENSES browse (READ-ONLY) — GET /api/v1/expenses list query against real Postgres.
 *
 * Proves the shared `queryExpensesList` helper (behind the GET route):
 *   1. Is ENTITY-SCOPED — under a given operating_company_id it returns ONLY that entity's
 *      expenses; a second-entity expense never leaks in (explicit operating_company_id filter
 *      + accounting.expenses RLS both agree).
 *   2. Derives is_reconciled from a REAL bank.reconciliation_matches row
 *      (ledger_entry_kind='expense', added by 202607011600_bank_recon_expense_match_part2a.sql),
 *      exactly like the #1755 Bills/Bill-Payments precedent — an ACTIVE match
 *      (auto_matched|user_matched) → matched; a 'rejected' match → still unmatched.
 *   3. Performs ZERO writes — the accounting.expenses row count is unchanged across the query.
 *
 * Seeds directly via SQL under app.bypass_rls='lucia' (matches bills-reconciliation-status.db.test.ts),
 * then runs the list query under REAL RLS (SET app.operating_company_id, no bypass). CI-only.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad, getIntegrationWorkOrderSeedIds } from "../../../test-helpers/db-fixture.js";
import { queryExpensesList } from "../expenses.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("GAP-EXPENSES expenses list read-only (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let foreignCompanyId: string;
  let ownDriverId: string;
  let foreignDriverId: string;
  let ownBankTxnId: string;
  const suffix = randomUUID().slice(0, 8);

  // FORCE RLS is enabled on accounting.expenses + bank.reconciliation_matches; set BOTH the bypass
  // flag and the company scope so seed writes are permitted for the given scopeCompanyId.
  async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${scopeCompanyId}'`);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedExpense(scopeCompanyId: string, driverId: string, cents: number, memo: string): Promise<string> {
    const id = randomUUID();
    await bypass(scopeCompanyId, async () => {
      await db.query(
        `INSERT INTO accounting.expenses
           (id, operating_company_id, driver_uuid, transaction_date, total_amount_cents, status, memo)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, $4, 'posted', $5)`,
        [id, scopeCompanyId, driverId, cents, memo]
      );
    });
    return id;
  }

  async function seedExpenseMatch(scopeCompanyId: string, expenseId: string, matchState: "auto_matched" | "rejected"): Promise<void> {
    await bypass(scopeCompanyId, async () => {
      await db.query(
        `INSERT INTO bank.reconciliation_matches
           (operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id, match_state)
         VALUES ($1::uuid, $2::uuid, 'expense', $3::uuid, $4)`,
        [scopeCompanyId, ownBankTxnId, expenseId, matchState]
      );
    });
  }

  async function seedForeignDriver(scopeCompanyId: string): Promise<string> {
    return bypass(scopeCompanyId, async () => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (first_name, last_name, phone, email, operating_company_id)
         VALUES ($1, $2, $3, $4, $5::uuid) RETURNING id`,
        ["Foreign", `EXP-${suffix}`, `+15550009${suffix.slice(0, 4)}`, `exp-foreign-${suffix}@test.invalid`, scopeCompanyId]
      );
      return r.rows[0]!.id;
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    ownDriverId = (await getIntegrationWorkOrderSeedIds()).driverId;
    const second = await ensureSecondEntityLoad();
    foreignCompanyId = second.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    foreignDriverId = await seedForeignDriver(foreignCompanyId);

    // One bank account + transaction in the own entity — reconciliation_matches.bank_transaction_id is
    // a required FK into banking.bank_transactions.
    ownBankTxnId = await bypass(companyId, async () => {
      const acct = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_type)
         VALUES ($1::uuid, $2, 'checking') RETURNING id`,
        [companyId, `EXP-LIST own ${suffix}`]
      );
      const txn = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_transactions (bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, description)
         VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 5000, false, $3) RETURNING id`,
        [acct.rows[0]!.id, companyId, `EXP-LIST own tx ${suffix}`]
      );
      return txn.rows[0]!.id;
    });
  });

  afterAll(async () => {
    await db.end();
  });

  it("lists entity-scoped expenses, derives is_reconciled from a real match, and writes nothing", async () => {
    // Expense A (own): gets an ACTIVE expense match → expect matched.
    const expenseA = await seedExpense(companyId, ownDriverId, 12345, `EXP-LIST A ${suffix}`);
    // Expense B (own): gets ONLY a 'rejected' match → expect still unmatched.
    const expenseB = await seedExpense(companyId, ownDriverId, 6789, `EXP-LIST B ${suffix}`);
    // Expense C (FOREIGN entity): must never appear in the own-entity list.
    const expenseC = await seedExpense(foreignCompanyId, foreignDriverId, 4321, `EXP-LIST C ${suffix}`);

    await seedExpenseMatch(companyId, expenseA, "auto_matched");
    await seedExpenseMatch(companyId, expenseB, "rejected");

    // Snapshot the expenses row count for the own entity — the SELECT must not change it (0 writes).
    const countBefore = await bypass(companyId, async () => {
      const r = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid`,
        [companyId]
      );
      return Number(r.rows[0]!.n);
    });

    // Run the list query under REAL RLS (no bypass) — proves the entity scope end-to-end.
    await db.query("BEGIN");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    const rows = await queryExpensesList(db, companyId, { limit: 200, offset: 0 });
    await db.query("COMMIT");

    const rowA = rows.find((r) => r.id === expenseA);
    const rowB = rows.find((r) => r.id === expenseB);
    const rowC = rows.find((r) => r.id === expenseC);

    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    expect(rowC).toBeUndefined(); // cross-entity isolation

    expect(rowA!.is_reconciled).toBe(true);
    expect(rowB!.is_reconciled).toBe(false);

    // Real-column sanity: the header fields the list depends on are populated.
    expect(Number(rowA!.total_amount_cents)).toBe(12345);
    expect(rowA!.status).toBe("posted");
    expect(rowA!.driver_uuid).toBe(ownDriverId);

    const countAfter = await bypass(companyId, async () => {
      const r = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid`,
        [companyId]
      );
      return Number(r.rows[0]!.n);
    });
    expect(countAfter).toBe(countBefore); // ZERO writes — read-only
  });
});
