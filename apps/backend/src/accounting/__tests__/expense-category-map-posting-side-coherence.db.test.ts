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
 *     project forbids. So the test FIRST asserts a completeness discriminator (visible == n_live_tup,
 *     and > 0) on BOTH tables. If it cannot see the data, it FAILS rather than passing on emptiness.
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
    db = new pg.Client(buildPgClientConfig());
    await db.connect();
    // FORCE-RLS bypass must be its OWN statement — folded into a CTE it silently does not take.
    await db.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
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
    // > 0 first: on an empty database "zero violations" would be meaningless, and this guard would be
    // reporting green while asserting nothing at all.
    expect(Number(r.map_visible), "no expense_category_account_map rows visible — RLS bypass did not take, or the map was never seeded; either way this guard cannot assert anything").toBeGreaterThan(0);
    expect(Number(r.acct_visible), "no catalogs.accounts rows visible — RLS bypass did not take").toBeGreaterThan(0);
    // n_live_tup is an estimate refreshed by ANALYZE, so allow a small drift rather than demanding
    // exact equality — the point is to catch RLS masking most of the table, not statistics lag.
    expect(
      Number(r.map_visible) >= Number(r.map_live) * 0.9,
      `expense_category_account_map: only ${r.map_visible} of ~${r.map_live} rows visible — RLS is masking rows, so a "no violations" result would be false`
    ).toBe(true);
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

    expect(rows.length, "joined zero active mappings — the guard would assert nothing").toBeGreaterThan(0);

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

    expect(rows.length, "no entity carries a maintenance/maintenance anchor — nothing was asserted").toBeGreaterThan(0);

    const gaps = rows.filter((r) => r.missing.length > 0).map((r) => `${r.opco} is missing maintenance/{${r.missing.join(", ")}}`);
    expect(
      gaps,
      gaps.length
        ? `maintenance sub-code coverage is incomplete — each of these fails loud at post time:\n  - ${gaps.join("\n  - ")}`
        : ""
    ).toEqual([]);
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
