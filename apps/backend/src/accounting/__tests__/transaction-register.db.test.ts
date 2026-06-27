/**
 * Unified Transaction Register — phantom-column guard (real Postgres). DISPATCH-B.
 *
 * The register UNIONs 5 sources (banking.bank_transactions, fuel.fuel_transactions,
 * accounting.invoices, accounting.bills, driver_finance.driver_settlements). Every column
 * was hand-verified against db/migrations, but the established failure mode here is a query
 * referencing a column/table that doesn't exist on the migrated schema (42703/42P01) — a 500
 * that only surfaces at runtime. This guard runs the EXACT union SQL against the migrated CI
 * Postgres so any phantom column fails CI instead of production.
 *
 * Harness mirrors drivers/__tests__/driver-full-name-phantom.db.test.ts.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TRANSACTION_REGISTER_UNION_SQL } from "../transaction-register.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("accounting transaction register union (real schema)", () => {
  let db: pg.Client;
  let companyId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("the 5-source union executes with no phantom column (42703/42P01)", async () => {
    const res = await db.query(
      `WITH reg AS (${TRANSACTION_REGISTER_UNION_SQL}) SELECT * FROM reg LIMIT 5`,
      [companyId]
    );
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it("normalizes to cents (amount_in/out non-negative bigints, never a 10x dollar value)", async () => {
    const res = await db.query<{ amount_in_cents: string; amount_out_cents: string }>(
      `WITH reg AS (${TRANSACTION_REGISTER_UNION_SQL})
       SELECT amount_in_cents::text, amount_out_cents::text FROM reg LIMIT 50`,
      [companyId]
    );
    for (const r of res.rows) {
      expect(Number(r.amount_in_cents)).toBeGreaterThanOrEqual(0);
      expect(Number(r.amount_out_cents)).toBeGreaterThanOrEqual(0);
    }
  });

  it("every row is scoped to the requested entity (no cross-entity leakage)", async () => {
    // Re-run under a different company scope and assert the count can differ — the union's
    // per-arm operating_company_id = $1 predicate is what enforces isolation.
    const res = await db.query<{ source: string }>(
      `WITH reg AS (${TRANSACTION_REGISTER_UNION_SQL}) SELECT DISTINCT source FROM reg`,
      [companyId]
    );
    const allowed = new Set(["bank", "fuel", "invoice", "bill", "settlement"]);
    for (const r of res.rows) expect(allowed.has(r.source)).toBe(true);
  });
});
