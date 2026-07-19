/**
 * Session-level advisory lock + save/restore for GLOBAL `catalogs.account_role_bindings`.
 *
 * That table is UNIQUE(role_key) — not per-company. Settlement suites that bind
 * `driver_pay_expense` / `cash_dip` / recovery roles under vitest `pool:"forks"` MUST share
 * this lock around the full lifespan: save → bind → post/tests → restore.
 *
 * Consumers (must use the same token):
 *   - settlement-bill-payment-posting.db.test.ts
 *   - settlement-gl-posting.db.test.ts
 *   - settlement-payrun-close.db.test.ts
 *
 * Restore is FAIL-LOUD: never catch/swallow. A failed restore leaves sibling suites without
 * resolvable role bindings — that must surface as a red suite, not a silent flake later.
 *
 * Distinct from:
 *   - COA-role serialize lock `4200000001` (legacy ar_control / cash_clearing)
 *   - cash-advance map lock `CASH_ADVANCE_MAP_TEST_LOCK_KEY` (…477001)
 *   - ensureIntegrationPrerequisites xact lock (…477000)
 *   - isolated-company insert xact lock (…477010)
 *
 * Test hygiene only — no product GL behavior change.
 */
import type pg from "pg";
import { GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY } from "./constants.js";

export { GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY };

export type SavedAccountRoleBinding = {
  role_key: string;
  account_id: string;
  operating_company_id: string | null;
  deactivated_at: Date | null;
};

/** Acquire session-level lock (held until release / connection end). Call in beforeAll BEFORE save/bind. */
export async function acquireGlobalAccountRoleBindingsLock(client: pg.Client): Promise<void> {
  await client.query("SELECT pg_advisory_lock($1::bigint)", [GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY]);
}

/** Release session-level lock. Call in afterAll finally AFTER restore (or on setup failure). */
export async function releaseGlobalAccountRoleBindingsLock(client: pg.Client): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1::bigint)", [GLOBAL_ACCOUNT_ROLE_BINDINGS_TEST_LOCK_KEY]);
}

/** Snapshot current GLOBAL bindings for the given role_keys (call under bypass_rls). */
export async function saveGlobalAccountRoleBindings(
  client: pg.Client,
  roleKeys: readonly string[]
): Promise<SavedAccountRoleBinding[]> {
  const prior = await client.query<{
    role_key: string;
    account_id: string;
    operating_company_id: string | null;
    deactivated_at: Date | null;
  }>(
    `SELECT role_key,
            account_id::text AS account_id,
            operating_company_id::text AS operating_company_id,
            deactivated_at
       FROM catalogs.account_role_bindings
      WHERE role_key = ANY($1::text[])`,
    [roleKeys as unknown as string[]]
  );
  return prior.rows;
}

/**
 * Restore GLOBAL bindings to the saved snapshot. FAIL-LOUD — do not wrap in empty catch.
 *
 * - Prior rows: upsert account_id / operating_company_id / deactivated_at
 * - Keys with no prior row that this suite bound under suiteCompanyId: deactivate those rows
 * - Keys with no prior and no suiteCompanyId: DELETE the binding row (test-only teardown of a
 *   fixture-created GLOBAL singleton; product code never deletes permanent financial records)
 */
export async function restoreGlobalAccountRoleBindings(
  client: pg.Client,
  roleKeys: readonly string[],
  prior: readonly SavedAccountRoleBinding[],
  suiteCompanyId?: string | null
): Promise<void> {
  for (const row of prior) {
    await client.query(
      `INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id, deactivated_at)
       VALUES ($1, $2::uuid, $3::uuid, $4)
       ON CONFLICT (role_key) DO UPDATE
         SET account_id = EXCLUDED.account_id,
             operating_company_id = EXCLUDED.operating_company_id,
             deactivated_at = EXCLUDED.deactivated_at`,
      [row.role_key, row.account_id, row.operating_company_id, row.deactivated_at]
    );
  }

  const priorKeys = new Set(prior.map((r) => r.role_key));
  const orphanKeys = roleKeys.filter((k) => !priorKeys.has(k));
  if (orphanKeys.length === 0) return;

  if (suiteCompanyId) {
    await client.query(
      `UPDATE catalogs.account_role_bindings
          SET deactivated_at = COALESCE(deactivated_at, now())
        WHERE role_key = ANY($1::text[])
          AND operating_company_id = $2::uuid`,
      [orphanKeys as unknown as string[], suiteCompanyId]
    );
    return;
  }

  await client.query(`DELETE FROM catalogs.account_role_bindings WHERE role_key = ANY($1::text[])`, [
    orphanKeys as unknown as string[],
  ]);
}
