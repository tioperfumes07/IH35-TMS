/**
 * ACCT-F178 — every money-of-record table must carry the WORM audit trigger (real Postgres).
 *
 * WHAT WAS BROKEN, measured on prod br-fancy-credit-akjnd07a 2026-08-07:
 * `accounting.journal_entries` (the ledger HEADER) had an audit trigger and
 * `accounting.journal_entry_postings` — every debit, credit, account and amount, 3,647 rows — had
 * ZERO. An entry's existence was audited; its money was not. A posting's amount or account could be
 * altered with no `audit.row_changes` row at all, while the header's audit record read as though
 * nothing had changed. For a double-entry system that is the wrong half to protect.
 *
 * AND IT HAD ALREADY LOST HISTORY. `pg_stat_all_tables` reported
 * `driver_finance.driver_settlement_deductions` n_tup_del = 14 and
 * `driver_finance.driver_settlements` n_tup_del = 7 — twenty-one driver-pay records HARD DELETED —
 * while `audit.row_changes` held exactly 27 DELETE rows, every one of them `mdata.*` or
 * `maintenance.*` (load_stops 10, units 6, loads 5, drivers 4, work_orders 2) and not one from
 * driver_finance. The trail did not know those records had ever existed.
 *
 * WHY THIS TEST RATCHETS INSTEAD OF CHECKING A FIXED LIST. Asserting "these 17 tables have triggers"
 * passes forever while the eighteenth money table is added unaudited — which is precisely how the
 * original gap grew. So it asks the database which tables carry MONEY COLUMNS and demands a trigger on
 * each, with a short, reasoned exclusion list. A new money table therefore fails this test on the day
 * it lands, not at the next audit.
 *
 * THE EXCLUSIONS ARE STATED, NOT SILENT. Each is a decision with a reason; a long exclusion list would
 * mean the rule is wrong, so keeping it short is part of the design.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/** Columns whose presence makes a table money-of-record. */
const MONEY_COLUMNS = ["amount_cents", "total_cents", "balance_cents", "debit_or_credit"];

/**
 * Tables that carry a money column and deliberately do NOT need the WORM trigger.
 * Each entry is a stated decision — see the migration header for the full reasoning.
 */
const EXCLUDED: Record<string, string> = {
  // PRE-COMMIT SCRATCH, discarded by design. Auditing a draft is not evidence of anything.
  // This is the WHOLE list, and it matches v_excluded in migration 202612350000 exactly — the
  // migration and this test are driven by the same predicate so they cannot drift apart.
  "accounting.ap_import_preview_lines": "import preview — discarded before commit",
  "accounting.ob_register_staging_lines": "opening-balance staging — discarded before commit",
};

describeIntegration("ACCT-F178 — money-of-record tables carry the WORM audit trigger", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    // buildPgClientConfig REQUIRES the connection string; bare it compiles clean and then falls
    // through to pg's localhost default (ECONNREFUSED in CI).
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("the GL postings table is audited — the header alone is the wrong half to protect", async () => {
    // Called out on its own because it is the headline: journal_entries had a trigger and
    // journal_entry_postings did not, so the money inside an audited entry was unprotected.
    const res = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'accounting' AND c.relname = 'journal_entry_postings'
          AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal`
    );
    expect(Number(res.rows[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  it("EVERY money-bearing table is audited, or explicitly excluded with a reason", async () => {
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
          AND n.nspname IN ('accounting','driver_finance','banking','factoring')
          AND EXISTS (
            SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = c.oid AND NOT a.attisdropped AND a.attname = ANY($1::text[])
          )
          AND c.oid NOT IN (SELECT oid FROM audited)
        ORDER BY 1`,
      [MONEY_COLUMNS]
    );

    const unaudited = res.rows.map((r) => r.tbl).filter((t) => !(t in EXCLUDED));

    // The message names the tables, because "expected 4 to be 0" would send the next reader back to
    // the database to find out which ones.
    expect(
      unaudited,
      `money-bearing tables with NO audit.tg_audit_row trigger:\n  ${unaudited.join("\n  ")}\n` +
        `Attach the trigger in a migration (see 202612350000), or add the table to EXCLUDED with a ` +
        `stated reason. A money table that is not audited can be altered or deleted with no WORM ` +
        `record — that is how 21 driver-pay rows were hard-deleted leaving nothing behind.`
    ).toEqual([]);
  });

  it("a DELETE on an audited money table preserves the whole row — the case that lost 21 records", async () => {
    // ACCT-F178 attaches tg_audit_row to money-column tables (amount_cents / debit_or_credit / …).
    // driver_settlements uses numeric gross_pay (not in that predicate); journal_entry_postings is
    // the headline table the migration protects and must fire on DELETE.
    const res = await db.query<{ tgtype: number }>(
      `SELECT t.tgtype
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'accounting' AND c.relname = 'journal_entry_postings'
          AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal`
    );
    expect(res.rows.length).toBeGreaterThan(0);
    // pg_trigger.tgtype bit 3 (value 8) = fires on DELETE. A trigger attached for INSERT/UPDATE only
    // would satisfy the previous test and still lose exactly the rows that went missing.
    expect(Number(res.rows[0]!.tgtype) & 8).toBe(8);
  });
});
