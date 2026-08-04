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
 * Neither tsc nor a unit test could catch it: the SQL is a template string, so it is only ever
 * validated by actually running it. That is what this test does — it exercises the real query
 * against a migrated Postgres with a seeded OPEN invoice, so the ageing arithmetic is actually
 * evaluated (a customer with no open invoices short-circuits before the subtraction and would
 * NOT have caught the original bug).
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

      // An OPEN invoice inside the 120-day window: this is what forces the date-difference
      // arithmetic to actually evaluate. Without it the subscore short-circuits on open_cents<=0.
      // amount_open_cents is GENERATED ALWAYS AS (total_cents - amount_paid_cents) — it must NOT
      // appear in the column list. total_cents 100000 with amount_paid_cents 0 yields an open
      // balance of 100000, which is what keeps the subscore from short-circuiting.
      await db.query(
        `INSERT INTO accounting.invoices
           (operating_company_id, customer_id, display_id, status,
            issue_date, due_date, subtotal_cents, tax_cents, total_cents,
            amount_paid_cents)
         VALUES ($1::uuid, $2::uuid, $3, 'sent',
                 current_date - 30, current_date + 5, 100000, 0, 100000,
                 0)`,
        [companyId, customerId, `LV001-INV-${suffix}`],
      );

      // Fail loudly if the seed did not actually produce an OPEN invoice — otherwise the test
      // would pass vacuously by short-circuiting before the date arithmetic it exists to exercise.
      const seeded = await db.query<{ amount_open_cents: string }>(
        `SELECT amount_open_cents::text FROM accounting.invoices WHERE display_id = $1`,
        [`LV001-INV-${suffix}`],
      );
      if (Number(seeded.rows[0]?.amount_open_cents ?? 0) <= 0) {
        throw new Error(
          `LV-001 seed invalid: amount_open_cents=${seeded.rows[0]?.amount_open_cents} — the payment-behavior subscore would short-circuit and the test would not exercise the date subtraction`,
        );
      }
    });
  });

  afterAll(async () => {
    if (!db) return;
    await bypass(async () => {
      await db.query(`DELETE FROM accounting.invoices WHERE display_id = $1`, [`LV001-INV-${suffix}`]);
      await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("computes a payment-behavior subscore over an OPEN invoice without raising 42883", async () => {
    const result = await bypass(() =>
      computeRelationshipScore(db as never, {
        operating_company_id: companyId,
        customer_uuid: customerId,
      }),
    );

    // The assertion that matters: it did not throw. 42883 would have rejected above.
    expect(result).toBeTruthy();
    expect(typeof result.payment_behavior_subscore === "number" || result.payment_behavior_subscore === null).toBe(
      true,
    );
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
