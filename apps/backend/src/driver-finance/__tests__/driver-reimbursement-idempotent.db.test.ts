/**
 * LEAD 443.120 B (Codex BCF-10) — real Postgres: paying a driver reimbursement decrements the bank-balance
 * cache ONCE per reimbursement id. A retry of the same pay request (the service deliberately lets an
 * already-paid reimbursement through so a missing GL leg can be filled) used to subtract the amount from
 * banking.bank_accounts.current_balance_cents a second time, while the idempotent poster correctly wrote
 * one journal entry. The decrement now follows the poster's own idempotency verdict.
 * Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// The service opens its own transactions through withCurrentUser; route every one of them onto the single
// rolled-back fixture transaction so the real service code runs against real SQL and leaves nothing behind.
const shared: { client: pg.Client | null } = { client: null };
vi.mock("../../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/db.js")>();
  return {
    ...actual,
    withCurrentUser: async (_uuid: string, cb: (c: unknown) => unknown) => cb(shared.client),
  };
});

describeIntegration("driver reimbursement pay-out is idempotent on the reimbursement id (443.120 B / BCF-10, real Postgres)", () => {
  let db: pg.Client;
  let companyId = "";

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    shared.client = db;
    // The company row is the one committed fixture (isolated namespace, deactivated in afterAll); everything else rolls back.
    companyId = (await createIsolatedOperatingCompany({ codePrefix: "RIB", legalNamePrefix: "Reimb idempotent" })).companyId;
  });

  afterAll(async () => {
    shared.client = null;
    if (companyId && db) {
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await deactivateIsolatedOperatingCompany(db, companyId);
        await db.query("COMMIT");
      } catch (err) {
        // A failed teardown must surface, never be swallowed (verify-aggregate-savepoints).
        await db.query("ROLLBACK");
        throw err;
      }
    }
    await db?.end();
  });

  it("two pay calls for one reimbursement -> bank cache decremented once, one journal entry", async () => {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const acct = async (name: string, type: string, num: string) =>
        (await one(
          `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, $2, $3, $4, true) RETURNING id::text AS id`,
          [companyId, name, type, num]
        )).id;
      const expense = await acct("RIB Reimbursements", "Expense", "97501");
      const bankGl = await acct("RIB Checking", "Asset", "97502");
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'reimbursement_expense', $2, true)`,
        [companyId, expense]
      );
      const bank = (await one(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, current_balance_cents, ledger_account_id)
         VALUES ($1, 'RIB checking', 100000, $2) RETURNING id::text AS id`,
        [companyId, bankGl]
      )).id;
      const driver = (await one(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Rib', 'Driver', '5555550175') RETURNING id::text AS id`,
        [companyId]
      )).id;
      const reimb = (await one(
        `INSERT INTO driver_finance.driver_reimbursements
           (operating_company_id, driver_id, reimbursement_type, amount_cents, reason, pay_mode, status, from_bank_account_id, created_by_user_id)
         VALUES ($1, $2, 'toll', 2500, 'RIB toll', 'immediate', 'pending', $3, $4) RETURNING id::text AS id`,
        [companyId, driver, bank, TEST_OWNER_USER_ID]
      )).id;
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid) VALUES ('REIMBURSEMENT_GL_POSTING_ENABLED', $1, true, $2)`,
        [companyId, TEST_OWNER_USER_ID]
      );

      const { payDriverReimbursementImmediately } = await import("../driver-reimbursement.service.js");
      const first = await payDriverReimbursementImmediately(TEST_OWNER_USER_ID, "Owner", companyId, { reimbursement_id: reimb });
      const second = await payDriverReimbursementImmediately(TEST_OWNER_USER_ID, "Owner", companyId, { reimbursement_id: reimb });

      expect(first).toMatchObject({ ok: true, posted: true });
      expect(second).toMatchObject({ ok: true, posted: true });
      expect((second as { journalEntryId: string | null }).journalEntryId).toBe((first as { journalEntryId: string | null }).journalEntryId);

      const bal = await one<{ c: string }>(`SELECT current_balance_cents::text AS c FROM banking.bank_accounts WHERE id = $1`, [bank]);
      expect(Number(bal.c)).toBe(100000 - 2500); // once, not twice
      const jes = await one<{ n: string }>(
        `SELECT count(DISTINCT journal_entry_uuid)::text AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1 AND account_id = $2`,
        [companyId, expense]
      );
      expect(Number(jes.n)).toBe(1);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
