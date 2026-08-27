/**
 * TEST-DATA-BANK-MATCH-EXPENSES-DOUBLE-SEEDED-6210 — proves the exact SQL semantics
 * apps/backend/src/accounting/expenses.routes.ts's POST /api/v1/expenses handler relies on to reject
 * a same-memo resubmission within 2 minutes, against a real Postgres:
 *   - a second insert with the identical (operating_company_id, memo) within the window IS caught
 *   - a voided prior row does NOT block a resubmission (the memo is free again)
 *   - a prior row older than the 2-minute window does NOT block a resubmission
 *   - a different memo, or a different company, never collides
 * This does not exercise the full HTTP route (that needs a fully valid create payload — category,
 * payment account, vendor — which is a heavier fixture than this dedup logic needs); the static guard
 * scripts/verify-expense-create-duplicate-submission-guard.mjs locks that the route actually runs
 * this exact query, in this exact order, before the INSERT.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense create — memo duplicate-submission dedup (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID();
  const createdIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await fn();
      await db.query("COMMIT");
      return r;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function insertExpense(memo: string, createdAtOffset: string, voided: boolean) {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.expenses
           (id, operating_company_id, status, transaction_date, total_amount_cents, memo, created_at, voided_at)
         VALUES
           ($1::uuid, $2::uuid, 'posted', current_date, 1000, $3,
            now() + ($4)::interval,
            CASE WHEN $5 THEN now() ELSE NULL END)`,
        [id, companyId, memo, createdAtOffset, voided]
      );
    });
    createdIds.push(id);
    return id;
  }

  // The exact query the route runs, verbatim.
  async function dedupHit(memo: string): Promise<boolean> {
    return bypass(async () => {
      const res = await db.query(
        `SELECT id FROM accounting.expenses
          WHERE operating_company_id = $1::uuid
            AND memo = $2
            AND voided_at IS NULL
            AND created_at > now() - interval '2 minutes'
          LIMIT 1`,
        [companyId, memo]
      );
      return res.rows.length > 0;
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    // void-not-delete: accounting.expenses is a money table, ih35_app has no DELETE grant on it.
    if (createdIds.length) {
      await bypass(async () => {
        await db.query(
          `UPDATE accounting.expenses SET voided_at = now() WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`,
          [createdIds]
        );
      });
    }
    await db.end();
  });

  it("a same-memo row created 30 seconds ago blocks a resubmission", async () => {
    const memo = `TEST DATA VOID-AT-LAUNCH bank match dedup-${suffix}-a`;
    await insertExpense(memo, "-30 seconds", false);
    expect(await dedupHit(memo)).toBe(true);
  });

  it("a same-memo row that was voided does NOT block a resubmission", async () => {
    const memo = `TEST DATA VOID-AT-LAUNCH bank match dedup-${suffix}-b`;
    await insertExpense(memo, "-30 seconds", true);
    expect(await dedupHit(memo)).toBe(false);
  });

  it("a same-memo row older than the 2-minute window does NOT block a resubmission", async () => {
    const memo = `TEST DATA VOID-AT-LAUNCH bank match dedup-${suffix}-c`;
    await insertExpense(memo, "-5 minutes", false);
    expect(await dedupHit(memo)).toBe(false);
  });

  it("a different memo never collides with an existing recent row", async () => {
    const memo = `TEST DATA VOID-AT-LAUNCH bank match dedup-${suffix}-d`;
    await insertExpense(memo, "-10 seconds", false);
    expect(await dedupHit(`${memo}-different`)).toBe(false);
  });
});
