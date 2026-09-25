import { withLuciaBypass } from "../../auth/db.js";

/** Minimal structural shape — matches posting-engine.service.ts's own DbClient. */
type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const EXPENSE_CATEGORY_MAP_KIND_VALUES = [
  "fuel",
  "maintenance",
  "revenue",
  "driver_pay",
  "factoring_fee",
  "toll",
  "escrow",
  "insurance",
  "office",
  "other",
  "cash_advance",
] as const;

export type ExpenseCategoryMapKind = (typeof EXPENSE_CATEGORY_MAP_KIND_VALUES)[number];
export type ExpenseCategoryPostingSide = "debit" | "credit";

export class ExpenseCategoryMapResolutionError extends Error {
  code: "EXPENSE_CATEGORY_MAP_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.code = "EXPENSE_CATEGORY_MAP_NOT_FOUND";
  }
}

/**
 * ACCT-F2026092584 — every call site inside posting-engine.service.ts's client-based builders
 * (buildCashAdvanceLines, buildDriverAdvanceLines) already runs on a caller-supplied DbClient, but
 * this function ignored it and always opened a SECOND connection via withLuciaBypass. That connection
 * runs its own `SET LOCAL ROLE ih35_app` (auth/db.ts withLuciaBypass), which only the real app's
 * DATABASE_URL role can assume. Any one-shot ops script using a read-scoped-but-bypass-capable
 * credential (this repo's ~/.ih35-gate.env pattern: role ih35_ci_readonly, rolbypassrls=true, table
 * grants, but NOT a member of ih35_app) and calling postSourceTransactionInClientTx on its OWN
 * already-bypassed client for source_transaction_type 'driver_advance' or 'cash_advance_request'
 * hit this wall even though every other write in the same script ran fine on that one client —
 * confirmed live 2026-09-25 (AUTH-033, load 13570): "permission denied to set role \"ih35_app\""
 * thrown from exactly this path.
 *
 * Optional `client` param: when the caller already holds an open, correctly-scoped connection
 * (RLS bypass + operating_company_id already set, as every postSourceTransactionInClientTx caller's
 * client is), run the same read on IT instead of opening a second one. Fully backward compatible —
 * every existing caller passes nothing and gets the exact prior behavior (its own withLuciaBypass
 * connection); this is additive only.
 */
export async function resolveAccountForCategory(
  operating_company_id: string,
  category_kind: ExpenseCategoryMapKind,
  category_code: string,
  client?: QueryableClient
): Promise<{ account_id: string; posting_side: ExpenseCategoryPostingSide }> {
  const normalizedCode = category_code.trim();
  if (!normalizedCode) {
    throw new ExpenseCategoryMapResolutionError(`No active expense category mapping: kind=${category_kind}, code=(empty)`);
  }

  const runOn = async (c: QueryableClient) => {
    await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const result = await c.query<{ account_id: string; posting_side: ExpenseCategoryPostingSide }>(
      `
        SELECT
          account_id::text AS account_id,
          posting_side::text AS posting_side
        FROM accounting.expense_category_account_map
        WHERE operating_company_id = $1::uuid
          AND category_kind = $2
          AND category_code = $3
          AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [operating_company_id, category_kind, normalizedCode]
    );
    const row = result.rows[0];
    if (!row) {
      throw new ExpenseCategoryMapResolutionError(
        `No active expense category mapping for operating_company_id=${operating_company_id}, category_kind=${category_kind}, category_code=${normalizedCode}`
      );
    }
    return { account_id: row.account_id, posting_side: row.posting_side };
  };

  if (client) return runOn(client);
  return withLuciaBypass(runOn);
}
