/**
 * Live-audit defect guards F1 + F3 (real Postgres). 2026-06-27.
 *
 * F3 — every view in user schemas must be security_invoker=true (else it bypasses the caller's RLS =
 *      cross-tenant leak). Migration 202606271500 enforces it; this asserts none regress.
 * F1 — the runtime role `ih35_app` must be able to SELECT the app-queried tables that 500'd in prod for
 *      lack of a grant (safety.accident_reports, owner.todays_attention_snapshot). Migration 202606271510
 *      restores the grants; this asserts the privilege is present.
 *
 * Harness mirrors accounting/__tests__/bill-expense-lines-rls.db.test.ts.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("live-defect guards F1 + F3 (real schema)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("F3: no user-schema view lacks security_invoker=true", async () => {
    const res = await db.query<{ view: string }>(
      `SELECT n.nspname || '.' || c.relname AS view
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'v'
          AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'`
    );
    expect(res.rows.map((r) => r.view)).toEqual([]); // any view here = RLS-bypass regression
  });

  it("F1: ih35_app can SELECT the tables that 500'd in prod", async () => {
    for (const tbl of ["safety.accident_reports", "owner.todays_attention_snapshot"]) {
      // skip if the table doesn't exist on this CI DB (prod-only drift); only assert privilege when present
      const exists = await db.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [tbl]);
      if (!exists.rows[0]?.ok) continue;
      const priv = await db.query<{ can: boolean }>(
        `SELECT has_table_privilege('ih35_app', $1, 'SELECT') AS can`,
        [tbl]
      );
      expect(priv.rows[0]?.can, `ih35_app must SELECT ${tbl}`).toBe(true);
    }
  });
});
