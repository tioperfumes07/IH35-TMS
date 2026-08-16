/**
 * LV-COA-AND-ITEMS-UNAUDITED — the Chart of Accounts and the three catalogs that back every
 * posting's account role, GL mapping, due-date math and segment carry the WORM audit trigger
 * (real Postgres).
 *
 * WHAT WAS BROKEN, measured on prod br-fancy-credit-akjnd07a 2026-08-15: `catalogs.accounts`,
 * `catalogs.items`, `catalogs.payment_terms` and `catalogs.classes` had ZERO audit triggers.
 * ACCT-F178 (202612350000) already audits every money-COLUMN table in accounting/driver_finance/
 * banking/factoring, but these four are reference rows with no money column, so that migration's
 * predicate correctly never reached them — a distinct gap. An account's role could be silently
 * reassigned, an item's GL mapping silently repointed, terms/class definitions silently edited,
 * with zero row in `audit.row_changes` and no trace of who or when.
 *
 * WHY A FIXED LIST INSTEAD OF A PREDICATE (unlike ACCT-F178's money-column predicate): there is no
 * single structural marker separating "the reference spine every poster resolves through" from
 * catalogs' other, lower-stakes lookup tables. This test's table list matches migration
 * 202612610000 exactly — the migration and this test are driven by the same named set so they
 * cannot drift apart.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/** Must match the VALUES list in migration 202612610000 exactly. */
const AUDITED_CATALOG_TABLES = [
  "catalogs.accounts",
  "catalogs.items",
  "catalogs.payment_terms",
  "catalogs.classes",
];

describeIntegration("LV-COA-AND-ITEMS-UNAUDITED — CoA + item/terms/class catalogs are WORM audited", () => {
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

  it("EVERY named catalog table carries the tg_audit_row trigger", async () => {
    const res = await db.query<{ tbl: string }>(
      `WITH audited AS (
         SELECT c.oid
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE p.proname = 'tg_audit_row' AND NOT t.tgisinternal
       )
       SELECT n.nspname || '.' || c.relname AS tbl
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'catalogs'
          AND c.relname = ANY($1::text[])
          AND c.oid NOT IN (SELECT oid FROM audited)
        ORDER BY 1`,
      [AUDITED_CATALOG_TABLES.map((t) => t.split(".")[1])]
    );

    const unaudited = res.rows.map((r) => r.tbl);
    expect(
      unaudited,
      `catalogs reference tables with NO audit.tg_audit_row trigger:\n  ${unaudited.join("\n  ")}\n` +
        `Attach the trigger in a migration (see 202612610000). An unaudited account role or item GL ` +
        `mapping can be silently reassigned with no WORM record.`
    ).toEqual([]);
  });

  it("an UPDATE on catalogs.accounts writes a WORM row with the changed field", async () => {
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const row = await db.query<{ id: string; notes: string | null }>(
      `SELECT id, notes FROM catalogs.accounts LIMIT 1`
    );
    if (row.rows.length === 0) return; // no seed rows in this CI fixture — nothing to mutate
    const id = row.rows[0]!.id;
    const marker = `LV-COA-AND-ITEMS-UNAUDITED-db-test-${Date.now()}`;
    await db.query(`UPDATE catalogs.accounts SET notes = $1 WHERE id = $2`, [marker, id]);

    const audit = await db.query<{ new_notes: string | null }>(
      `SELECT new_data->>'notes' AS new_notes
         FROM audit.row_changes
        WHERE schema_name = 'catalogs' AND table_name = 'accounts' AND row_pk = $1
        ORDER BY changed_at DESC LIMIT 1`,
      [id]
    );
    expect(audit.rows[0]?.new_notes).toBe(marker);
  });

  it("the trigger fires on DELETE too, not just INSERT/UPDATE", async () => {
    const res = await db.query<{ tgtype: number }>(
      `SELECT t.tgtype
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'catalogs' AND c.relname = 'accounts'
          AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal`
    );
    expect(res.rows.length).toBeGreaterThan(0);
    // pg_trigger.tgtype bit 3 (value 8) = fires on DELETE.
    expect(Number(res.rows[0]!.tgtype) & 8).toBe(8);
  });
});
