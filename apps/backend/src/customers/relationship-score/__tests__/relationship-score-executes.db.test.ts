/**
 * LV-001 — the relationship-score query must EXECUTE against a real Postgres.
 *
 * guard-allow:extract-date-diff-negative-control — this docblock quotes the defective SQL verbatim.
 * The shipped defect was `EXTRACT(DAY FROM (current_date - i.issue_date))` in
 * computePaymentBehaviorSubscore. `accounting.invoices.issue_date` is DATE, and in PostgreSQL
 * `date - date` yields an INTEGER day count (not an interval), so EXTRACT() over it raised
 * SQLSTATE 42883 "function pg_catalog.extract(unknown, integer) does not exist" and 500'd
 * GET /api/v1/customers/:uuid/relationship-score for EVERY customer in BOTH entities.
 *
 * WHY NO INVOICE IS SEEDED. 42883 is a function-resolution error raised at PLAN time, not per row.
 * Verified directly on the prod branch: the pre-fix SQL still raises 42883 when the predicate
 * matches ZERO rows. So an empty result set is sufficient to catch the defect, and seeding an
 * invoice would only add coupling to three unrelated schema rules (amount_open_cents is GENERATED
 * ALWAYS, display_id must match ^INV-[0-9]{4}-[0-9]{5}$, status is a CHECK enum) without adding
 * any detection power. The arithmetic itself was exercised against real prod rows during the
 * LV-001 investigation (weighted_days 30960000 over open_cents 880000).
 *
 * Neither tsc nor a unit test could catch this: the SQL is a template string, so it is only ever
 * validated by actually running it.
 *
 * Static sibling guard (catches the class repo-wide): scripts/verify-no-extract-over-date-difference.mjs
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { computeRelationshipScore } from "../scorer.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("LV-001 relationship-score query executes (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;
  const suffix = randomUUID().slice(0, 8);

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      const cust = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (operating_company_id, customer_name)
         VALUES ($1::uuid, $2) RETURNING id::text AS id`,
        [companyId, `LV001-CUST-${suffix}`],
      );
      customerId = cust.rows[0].id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    await bypass(async () => {
      await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("computes a relationship score without raising 42883", async () => {
    const result = await bypass(() =>
      computeRelationshipScore(db as never, {
        operating_company_id: companyId,
        customer_uuid: customerId,
      }),
    );

    // The assertion that matters: it did not throw. 42883 would have rejected above, because
    // function resolution happens at plan time regardless of how many rows match.
    expect(result).toBeTruthy();
    expect(typeof result.overall_score).toBe("number");
  });

  it("re-running the exact pre-fix SQL still raises 42883 (proves the fix is what changed it)", async () => {
    await expect(
      bypass(() =>
        // guard-allow:extract-date-diff-negative-control — this SQL is intentionally the DEFECT.
        // It must stay verbatim: it is the negative control proving the fix is what changed it.
        db.query(
          `SELECT COALESCE(SUM(
             GREATEST(EXTRACT(DAY FROM (current_date - i.issue_date)), 0) * i.amount_open_cents
           ), 0) FROM accounting.invoices i WHERE i.customer_id = $1::uuid`,
          [customerId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42883" });
  });
});
