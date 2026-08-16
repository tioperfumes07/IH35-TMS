/**
 * ACCT-F5325 — the void-not-delete GRANT layer is not undermined by the implicit PUBLIC role on
 * driver_finance / banking (real Postgres).
 *
 * WHAT WAS BROKEN, measured on prod 2026-08-16: a narrow `GRANT SELECT, INSERT, UPDATE` to
 * `ih35_app` (deliberately no DELETE) was cosmetic on both schemas — PostgreSQL's implicit PUBLIC
 * role independently carried DELETE on 34/37 driver_finance tables and all 12/12 banking tables,
 * and every role (ih35_app included) is automatically a member of PUBLIC. Three tables
 * (`banking.intercompany_entity_pairs`, `banking.intercompany_transfer_groups`,
 * `banking.transaction_categories`) had NEITHER the trigger nor a clean grant — genuinely
 * deletable by the runtime role with zero backstop.
 *
 * WHY THIS TEST RATCHETS INSTEAD OF CHECKING A FIXED LIST: a predicate over every table in both
 * schemas, so a table added next month is covered the day it lands, not at the next audit — same
 * reasoning ACCT-F178's own db.test documents for its predicate.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F5325 — driver_finance / banking DELETE is refused for real, not just on paper", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("EVERY table in driver_finance and banking refuses ih35_app DELETE via has_table_privilege", async () => {
    const res = await db.query<{ tbl: string }>(
      `SELECT n.nspname || '.' || c.relname AS tbl
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('driver_finance', 'banking')
          AND c.relkind = 'r'
          AND has_table_privilege('ih35_app', n.nspname || '.' || c.relname, 'DELETE')
        ORDER BY 1`
    );
    expect(
      res.rows.map((r) => r.tbl),
      "tables where ih35_app can DELETE (via PUBLIC or a direct grant) — the void-not-delete GRANT " +
        "layer is leaking; see migration 202612650000 for the fix pattern (REVOKE ... FROM PUBLIC + " +
        "REVOKE ... FROM ih35_app for any direct grant)"
    ).toEqual([]);
  });

  it("the 3 previously-unprotected banking tables now also carry the trigger backstop", async () => {
    const res = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'banking'
          AND c.relname IN ('intercompany_entity_pairs', 'intercompany_transfer_groups', 'transaction_categories')
          AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal`
    );
    expect(Number(res.rows[0]?.n ?? 0)).toBe(3);
  });
});
