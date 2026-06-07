/**
 * TIER 1 TRUST — Block 5: Double-Entry Balance Trigger DB Integration Test
 *
 * Exercises the REAL constraint trigger trg_check_journal_entry_balanced
 * against a live Postgres instance. Mock-based tests in posting-engine.service.test.ts
 * never call the actual trigger — this suite provides the missing negative proof.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a Postgres service is available.
 * Locally: set DATABASE_URL=postgres://... and set GITHUB_ACTIONS=true to run.
 *
 * Trigger under test:
 *   CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balanced
 *   AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
 *   DEFERRABLE INITIALLY DEFERRED
 *   FOR EACH ROW EXECUTE FUNCTION accounting.ensure_journal_entry_balanced();
 *
 * Trigger fires at COMMIT (deferred), so both INSERT statements within a
 * transaction are written before the balance check runs.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";

// Only runs in environments with a real Postgres (CI). Remove the `skipIf` to
// run locally when DATABASE_URL points to a seeded dev DB.
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("double-entry balance trigger (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let accountId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");

    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    // Resolve a real account_id from the seeded chart of accounts (USMCA seed).
    // Bypass RLS so we can read any account regardless of operating_company_id.
    await db.query("SET ROLE ih35_app");
    await db.query("SET app.bypass_rls = 'lucia'");
    await db.query(`SET app.operating_company_id = '${companyId}'`);

    const acctRes = await db.query<{ id: string }>(
      `SELECT id FROM catalogs.accounts WHERE active = true LIMIT 1`
    );
    if (!acctRes.rows[0]?.id) {
      throw new Error(
        "No active account found in catalogs.accounts — ensure USMCA chart-of-accounts seed migration has run"
      );
    }
    accountId = acctRes.rows[0].id;
  });

  afterEach(async () => {
    // Best-effort cleanup — errors here are intentional (transaction already rolled back).
    await db.query("ROLLBACK").catch(() => {});
  });

  it("allows a balanced journal entry to commit", async () => {
    const jeId = randomUUID();

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);

    await db.query(
      `
      INSERT INTO accounting.journal_entries
        (id, operating_company_id, entry_date, memo, source, created_by_user_id)
      VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 'Block 5 balance test — balanced', 'manual', $3::uuid)
      `,
      [jeId, companyId, TEST_OWNER_USER_ID]
    );

    // Debit 500 cents
    await db.query(
      `
      INSERT INTO accounting.journal_entry_postings
        (id, operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'debit', 500)
      `,
      [randomUUID(), companyId, jeId, accountId]
    );

    // Credit 500 cents — entry is balanced
    await db.query(
      `
      INSERT INTO accounting.journal_entry_postings
        (id, operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 2, $4::uuid, 'credit', 500)
      `,
      [randomUUID(), companyId, jeId, accountId]
    );

    // COMMIT must succeed — trigger fires here (DEFERRED) and sees debits == credits
    await expect(db.query("COMMIT")).resolves.not.toThrow();
  });

  it("rejects an unbalanced journal entry at commit with SQLSTATE 23514", async () => {
    const jeId = randomUUID();

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);

    await db.query(
      `
      INSERT INTO accounting.journal_entries
        (id, operating_company_id, entry_date, memo, source, created_by_user_id)
      VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 'Block 5 balance test — UNBALANCED', 'manual', $3::uuid)
      `,
      [jeId, companyId, TEST_OWNER_USER_ID]
    );

    // Debit 1000 cents
    await db.query(
      `
      INSERT INTO accounting.journal_entry_postings
        (id, operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'debit', 1000)
      `,
      [randomUUID(), companyId, jeId, accountId]
    );

    // Credit only 600 cents — intentionally unbalanced (debits 1000 ≠ credits 600)
    await db.query(
      `
      INSERT INTO accounting.journal_entry_postings
        (id, operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 2, $4::uuid, 'credit', 600)
      `,
      [randomUUID(), companyId, jeId, accountId]
    );

    // COMMIT must fail — deferred trigger fires here and detects imbalance
    let caughtError: Error & { code?: string } | undefined;
    try {
      await db.query("COMMIT");
    } catch (err) {
      caughtError = err as Error & { code?: string };
    }

    expect(caughtError, "Expected COMMIT to fail on unbalanced entry").toBeDefined();
    expect(caughtError?.code).toBe("23514"); // check_violation — SQLSTATE for ensure_journal_entry_balanced

    // Verify the unbalanced entry was NOT persisted
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const checkRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM accounting.journal_entries WHERE id = $1::uuid`,
      [jeId]
    );
    await db.query("ROLLBACK");
    expect(checkRes.rows[0]?.count).toBe("0");
  });
});
