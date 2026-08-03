/**
 * GUARD (DB-backed, ratcheting) — ACCT-F99: no ACTIVE expense-category mapping may declare a
 * posting_side that contradicts the normal balance of the account it maps to.
 *
 * THE DEFECT THIS COMES FROM (verified live on prod br-fancy-credit-akjnd07a, 2026-08-03):
 *   USMCA escrow/escrow -> catalogs.accounts 2100 "Driver Escrow - Held in Trust" (Liability),
 *   posting_side = 'debit'. TRANSP and TRK both map escrow to a Liability with 'credit'. Driver escrow
 *   is a liability (locked decision `driver-escrow-is-liability`; 00_LOCKED_DECISIONS §9.4 — a draw
 *   DEBITS the liability, therefore a withholding CREDITS it). USMCA was the outlier and it was wrong.
 *
 *   Root cause: the USMCA seed migration 202611190000 built all 16 mappings from one VALUES list and
 *   inserted a CONSTANT `'debit'`. Every row in that list is debit-normal EXCEPT escrow, so escrow —
 *   and only escrow — came out inverted. A per-row side (what the TRANSP/TRK seeds do) would not have.
 *
 * WHY A DB TEST AND NOT A STATIC GREP. The sibling static guard
 * scripts/verify-entity-expense-category-map-complete.mjs (ACCT-F98) says so itself: "The DATA
 * assertion ... needs a DB and belongs to GUARD's live pass — stated here rather than faked with a
 * green static check." That honest deferral is precisely why this class went unguarded. A static
 * scan cannot know an account's type: the seed migration names accounts by account_number, and the
 * type lives in catalogs.accounts. Only a migrated database can join the two. This is that assertion.
 *
 * RATCHETING / AUTO-DISCOVERING. It does not carry a list of known-bad rows. It joins the WHOLE table
 * to catalogs.accounts and fails on ANY active contradiction — the one above, or one nobody has
 * written yet. There is nothing to keep in sync.
 *
 * TWO WAYS THIS GUARD COULD FAIL OPEN, BOTH CLOSED HERE:
 *
 *  1. RLS FALSE-EMPTY. accounting.* and catalogs.* are FORCE-RLS. If the bypass does not take, every
 *     query returns zero rows and "zero violations" is a vacuous pass — the exact fake-green this
 *     project forbids. So the test FIRST asserts a completeness discriminator on BOTH tables:
 *     rows VISIBLE vs the planner's n_live_tup estimate. That comparison — not a bare `> 0` — is what
 *     separates "RLS masked the table" (live_tup > 0 but nothing visible: FAIL) from "the table is
 *     genuinely empty" (both zero: nothing to check, and said out loud rather than banked as green).
 *     A `> 0` floor would be wrong in both directions: it passes while RLS masks 91 of 92 rows, and it
 *     fails a legitimately bare fresh database.
 *
 *  2. AN UNRECOGNISED account_type. Skipping a type it does not know would silently disable the check
 *     for exactly the rows most likely to be novel. So the type -> normal-balance table below is
 *     CLOSED over the 8 values that exist on prod, and an unknown type is a FAILURE, not a skip. A new
 *     account type must be classified here deliberately.
 *
 * SCOPE — is_active = true only, and that is deliberate. resolveAccountForCategory() reads
 * `WHERE is_active = true`, so the active set is the operative surface. Deactivated rows are the
 * historical record under void-not-delete and are NOT rewritten to look correct. (Prod carries one:
 * TRK insurance/insurance -> QBO-7, which under TRK resolves to an Income "Refunds-Allowances"
 * account. It is superseded by TRK-QBO-7 "Vehicle Insurance Expenses" and deactivated. Its mapping is
 * semantically wrong, not merely mis-sided; "fixing" its side would make a wrong row look coherent.
 * Reactivating it would make it active and this guard would fire — which is the correct behaviour.)
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/**
 * account_type -> normal balance. CLOSED over the 8 values present on prod
 * (verified 2026-08-03: Asset 777, CostOfGoodsSold 82, Equity 16, Expense 218, Income 39,
 * Liability 231, OtherExpense 74, OtherIncome 4 — catalogs.accounts 1441/1441 visible).
 * An account_type absent from this table is a FAILURE below, never a skip.
 */
export const NORMAL_BALANCE_BY_ACCOUNT_TYPE: Readonly<Record<string, "debit" | "credit">> = Object.freeze({
  Asset: "debit",
  CostOfGoodsSold: "debit",
  Expense: "debit",
  OtherExpense: "debit",
  Equity: "credit",
  Income: "credit",
  Liability: "credit",
  OtherIncome: "credit",
});

interface MappingRow {
  opco: string;
  mapping: string;
  account_number: string | null;
  account_name: string | null;
  account_type: string;
  posting_side: string;
}

/**
 * Pure classifier, exported so the shape is unit-testable without a database.
 * Returns one human-readable problem per offending row. An unrecognised account_type is a problem.
 */
export function findCoherenceViolations(rows: readonly MappingRow[]): string[] {
  const problems: string[] = [];
  for (const r of rows) {
    const expected = NORMAL_BALANCE_BY_ACCOUNT_TYPE[r.account_type];
    if (expected === undefined) {
      problems.push(
        `${r.opco} ${r.mapping} -> ${r.account_number ?? "(no number)"} has account_type '${r.account_type}', ` +
          `which this guard does not classify. Add it to NORMAL_BALANCE_BY_ACCOUNT_TYPE deliberately — ` +
          `an unclassified type must never silently skip the coherence check.`
      );
      continue;
    }
    if (r.posting_side !== expected) {
      problems.push(
        `${r.opco} ${r.mapping} -> ${r.account_number ?? "(no number)"} "${r.account_name ?? ""}" ` +
          `is account_type '${r.account_type}' (normal balance ${expected}) but is mapped ` +
          `posting_side='${r.posting_side}'. A mapping must never contradict its account's normal balance.`
      );
    }
  }
  return problems;
}

describeIntegration("ACCT-F99 expense-category map posting_side coherence (real Postgres)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    // buildPgClientConfig() with no argument defaults to localhost:5432 and fails ECONNREFUSED in CI —
    // the migrated database is reached through DATABASE_DIRECT_URL / DATABASE_URL, as every other
    // *.db.test.ts in this repo does.
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // FORCE-RLS bypass must be its OWN statement — folded into a CTE it silently does not take.
    //
    // It must also be SESSION-scoped here, not transaction-local. set_config(..., true) is local to the
    // enclosing transaction, and node-postgres autocommits each query, so a `true` set in beforeAll is
    // already gone by the first it() — the reads would return zero rows and "no violations" would be a
    // vacuous pass. This exact trap produced a false visible=0 against n_live_tup=92 while verifying
    // this fix on prod. The completeness discriminator below is the backstop that catches it either way.
    await db.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  });

  afterAll(async () => {
    await db?.end();
  });

  it("can actually see both tables (completeness discriminator — a false-empty must not pass)", async () => {
    const { rows } = await db.query<{
      map_visible: string;
      map_live: string;
      acct_visible: string;
      acct_live: string;
    }>(`
      SELECT (SELECT count(*) FROM accounting.expense_category_account_map)::text AS map_visible,
             (SELECT COALESCE(n_live_tup,0) FROM pg_stat_user_tables
               WHERE schemaname='accounting' AND relname='expense_category_account_map')::text AS map_live,
             (SELECT count(*) FROM catalogs.accounts)::text AS acct_visible,
             (SELECT COALESCE(n_live_tup,0) FROM pg_stat_user_tables
               WHERE schemaname='catalogs' AND relname='accounts')::text AS acct_live
    `);
    const r = rows[0];

    // The failure mode being defended against is RLS MASKING: rows exist but are invisible, so every
    // violation query returns nothing and the suite reports green while asserting nothing.
    //
    // The discriminator is therefore "visible vs n_live_tup", NOT "visible > 0". A bare `> 0` would be
    // wrong in both directions: it passes when RLS masks 91 of 92 rows, and it fails a legitimately
    // empty table. Comparing against the planner's row estimate distinguishes "masked" from "empty" —
    // masked means live_tup > 0 while visible is ~0, and that is the case that must fail.
    //
    // n_live_tup is an estimate refreshed by ANALYZE, so a tolerance is used rather than equality.
    for (const [label, visible, live] of [
      ["accounting.expense_category_account_map", Number(r.map_visible), Number(r.map_live)],
      ["catalogs.accounts", Number(r.acct_visible), Number(r.acct_live)],
    ] as const) {
      if (live > 0) {
        expect(
          visible >= live * 0.9,
          `${label}: only ${visible} of ~${live} rows visible — the RLS bypass did not take, so a "no violations" result from this suite would be FALSE, not proof`
        ).toBe(true);
      }
    }

    // A genuinely empty map (fresh database, seeds skipped because their target accounts were absent)
    // is not a masking failure and must not be reported as one — but it does mean the coherence
    // assertions below verify nothing, so say so loudly rather than banking a silent green.
    if (Number(r.map_live) === 0) {
      console.warn(
        "[ACCT-F99] expense_category_account_map is EMPTY on this database — the coherence assertions " +
          "below are vacuous here. This is expected only on a bare fresh database whose seed migrations " +
          "skipped for missing accounts; on prod it would be a serious finding."
      );
    }
  });

  it("no ACTIVE mapping contradicts its account's normal balance", async () => {
    const { rows } = await db.query<MappingRow>(`
      SELECT COALESCE(c.code, m.operating_company_id::text) AS opco,
             m.category_kind || '/' || m.category_code        AS mapping,
             a.account_number,
             a.account_name,
             a.account_type,
             m.posting_side
        FROM accounting.expense_category_account_map m
        JOIN catalogs.accounts a ON a.id = m.account_id
        LEFT JOIN org.companies c ON c.id = m.operating_company_id
       WHERE m.is_active = true
       ORDER BY 1, 2
    `);

    // No length floor here: test 1 already distinguishes "RLS masked the table" (which FAILS) from
    // "the table is genuinely empty" (which cannot be a violation). Re-asserting a floor here would
    // fail a legitimately bare fresh database while adding no protection against masking.
    const problems = findCoherenceViolations(rows);
    expect(
      problems,
      problems.length
        ? `expense_category_account_map posting_side is incoherent:\n  - ${problems.join("\n  - ")}`
        : ""
    ).toEqual([]);
  });

  /**
   * ACCT-F99b — coverage, asserted where it can actually be true.
   *
   * maintenance-posting/poster.service.ts can emit 9 maintenance sub-codes, and
   * resolveAccountForCategory matches (kind, code) EXACTLY — an unmapped pair is
   * CATEGORY_MAPPING_MISSING, fail-loud. Prod carried all 10 pairs per entity, but a union grep over
   * every file in db/migrations found only 'maintenance'/'maintenance': the other nine were created
   * out-of-band, so a fresh CI database, a DR rebuild, or a newly onboarded entity silently lacked
   * them. Migration 202611280000 makes them reproducible; this proves it on a real database.
   *
   * Entity-discovering, not entity-listed: any company carrying the anchor must carry the sub-codes,
   * so a future entity is covered the moment it appears — there is no list to keep in sync.
   */
  it("every entity with a maintenance anchor carries all 9 maintenance sub-codes", async () => {
    const SUBCODES = ["tires", "brakes", "engine", "dot", "pm_preventive", "body", "electrical", "ac", "misc"];
    const { rows } = await db.query<{ opco: string; missing: string[] }>(
      `
      SELECT COALESCE(c.code, anchor.operating_company_id::text) AS opco,
             ARRAY(
               SELECT s.code FROM unnest($1::text[]) AS s(code)
                WHERE NOT EXISTS (
                  SELECT 1 FROM accounting.expense_category_account_map m
                   WHERE m.operating_company_id = anchor.operating_company_id
                     AND m.category_kind = 'maintenance'
                     AND m.category_code = s.code
                     AND m.is_active = true
                )
             ) AS missing
        FROM (
          SELECT DISTINCT m.operating_company_id
            FROM accounting.expense_category_account_map m
           WHERE m.category_kind = 'maintenance'
             AND m.category_code = 'maintenance'
             AND m.is_active = true
        ) AS anchor
        LEFT JOIN org.companies c ON c.id = anchor.operating_company_id
       ORDER BY 1
      `,
      [SUBCODES]
    );

    // As above: an empty result means no entity carries an anchor yet (bare fresh database), which is
    // not a coverage gap. Masking is caught by the discriminator in test 1.
    const gaps = rows.filter((r) => r.missing.length > 0).map((r) => `${r.opco} is missing maintenance/{${r.missing.join(", ")}}`);
    expect(
      gaps,
      gaps.length
        ? `maintenance sub-code coverage is incomplete — each of these fails loud at post time:\n  - ${gaps.join("\n  - ")}`
        : ""
    ).toEqual([]);
  });

  /**
   * ACCT-F100 — the invariant above is only durable if the DATABASE enforces it. Migration
   * 202611290000 adds a BEFORE INSERT/UPDATE trigger that DERIVES posting_side from the mapped
   * account's normal balance, so an incoherent row stops being expressible by any writer — the seed
   * migrations, the CRUD API, or a manual psql session. This asserts the trigger is installed AND
   * that it actually normalises, because a trigger that exists but no longer fires is worse than none.
   */
  it("the database DERIVES posting_side — an incoherent write is normalised, not stored", async () => {
    const { rows: trg } = await db.query<{ n: string }>(`
      SELECT count(*)::text AS n FROM pg_trigger
       WHERE tgrelid = 'accounting.expense_category_account_map'::regclass
         AND tgname = 'trg_derive_expense_category_posting_side'
         AND NOT tgisinternal
    `);
    expect(Number(trg[0].n), "trg_derive_expense_category_posting_side is missing — posting_side can drift again").toBe(1);

    // Behavioural proof, rolled back: force the exact ACCT-F99 defect (debit on a Liability) and a
    // NULL (the API path after ACCT-F100) and assert the database corrects both.
    await db.query("BEGIN");
    try {
      await db.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
      const { rows } = await db.query<{ category_code: string; account_type: string; posting_side: string }>(`
        WITH liability AS (
          SELECT m.operating_company_id, m.account_id
            FROM accounting.expense_category_account_map m
            JOIN catalogs.accounts a ON a.id = m.account_id
           WHERE a.account_type = 'Liability' AND m.is_active = true
           LIMIT 1
        ), ins AS (
          INSERT INTO accounting.expense_category_account_map
            (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
          SELECT operating_company_id, 'escrow', 'zz_acct_f100_probe', account_id, 'debit', true FROM liability
          RETURNING account_id, category_code, posting_side
        )
        SELECT ins.category_code, a.account_type, ins.posting_side
          FROM ins JOIN catalogs.accounts a ON a.id = ins.account_id
      `);
      // Skip rather than assert nothing if this database carries no Liability mapping at all.
      if (rows.length > 0) {
        expect(
          rows[0].posting_side,
          `wrote posting_side='debit' against a ${rows[0].account_type} account and the database KEPT it — the derive trigger is not firing`
        ).toBe("credit");
      }
    } finally {
      await db.query("ROLLBACK");
      // ROLLBACK discards the session GUC set inside the transaction; restore it for later tests.
      await db.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
    }
  });

  it("every active mapping still resolves to a real account (no orphans)", async () => {
    const { rows } = await db.query<{ orphans: string }>(`
      SELECT count(*)::text AS orphans
        FROM accounting.expense_category_account_map m
        LEFT JOIN catalogs.accounts a ON a.id = m.account_id
       WHERE m.is_active = true AND a.id IS NULL
    `);
    expect(Number(rows[0].orphans), "active mappings point at accounts that do not exist").toBe(0);
  });
});
