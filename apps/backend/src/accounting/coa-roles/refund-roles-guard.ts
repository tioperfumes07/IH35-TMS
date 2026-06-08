/**
 * Block F Decision C — active-carrier COA role guard.
 *
 * The unearned-premium refund (insurance policy cancellation) posts via
 * createJournalEntry() against two COA roles: ap_control (debit) and
 * expense_default (credit). If an ACTIVE operating carrier has not mapped both
 * roles, the refund cannot post and falls back to a durable obligation.
 *
 * This module finds active operating carriers that are missing either role. It
 * is consumed by:
 *   - scripts/verify-coa-roles.mjs (CI guard)
 *   - the app startup check (warn/error log) in index.ts
 *
 * Per-carrier scoping (SET app.operating_company_id) is used so the query is
 * correct under RLS whether the caller connects as the table owner or as
 * ih35_app.
 */

export const REFUND_REQUIRED_COA_ROLES = ["ap_control", "expense_default"] as const;
export type RefundCoaRole = (typeof REFUND_REQUIRED_COA_ROLES)[number];

export type CarrierCoaGap = {
  operating_company_id: string;
  code: string | null;
  missing_roles: RefundCoaRole[];
};

type GuardClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * Returns one entry per ACTIVE operating carrier that is missing an active
 * ap_control and/or expense_default chart_of_accounts_roles mapping.
 *
 * The caller must run this inside a transaction (the per-carrier
 * set_config(..., true) is transaction-local).
 */
export async function findActiveCarriersMissingRefundRoles(client: GuardClient): Promise<CarrierCoaGap[]> {
  const carriersRes = await client.query<{ id: string; code: string | null }>(
    `
      SELECT id::text, code
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
        AND company_type = 'operating_carrier'
      ORDER BY code
    `
  );

  const gaps: CarrierCoaGap[] = [];
  for (const carrier of carriersRes.rows) {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [carrier.id]);
    const rolesRes = await client.query<{ role: string }>(
      `
        SELECT role
        FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id = $1::uuid
          AND is_active = true
          AND role = ANY($2::text[])
      `,
      [carrier.id, [...REFUND_REQUIRED_COA_ROLES]]
    );
    const found = new Set(rolesRes.rows.map((row) => row.role));
    const missing = REFUND_REQUIRED_COA_ROLES.filter((role) => !found.has(role));
    if (missing.length > 0) {
      gaps.push({ operating_company_id: carrier.id, code: carrier.code, missing_roles: missing });
    }
  }
  return gaps;
}

type StartupDeps = {
  withLuciaBypass: <T>(fn: (client: GuardClient) => Promise<T>) => Promise<T>;
  logWarn: (obj: Record<string, unknown>, msg: string) => void;
  logError: (obj: Record<string, unknown>, msg: string) => void;
};

/**
 * Startup guard: warn/error-logs (never throws) when an active carrier is
 * missing the refund COA roles. Refund posting still falls back to a durable
 * obligation at runtime; this surfaces the misconfiguration loudly in logs.
 */
export async function runRefundCoaRolesStartupCheck(deps: StartupDeps): Promise<CarrierCoaGap[]> {
  try {
    const gaps = await deps.withLuciaBypass((client) => findActiveCarriersMissingRefundRoles(client));
    if (gaps.length > 0) {
      deps.logError(
        {
          subsystem: "insurance_refund_coa_guard",
          unmapped_carriers: gaps,
          required_roles: [...REFUND_REQUIRED_COA_ROLES],
        },
        "[STARTUP] CRITICAL: active carrier(s) missing ap_control/expense_default COA roles — insurance cancellation refunds will fall back to pending obligations instead of posting"
      );
    } else {
      deps.logWarn(
        { subsystem: "insurance_refund_coa_guard" },
        "[STARTUP] refund COA roles guard OK — all active carriers map ap_control + expense_default"
      );
    }
    return gaps;
  } catch (error) {
    // Best-effort: never block boot on the guard itself.
    deps.logError(
      { subsystem: "insurance_refund_coa_guard", err: error },
      "[STARTUP] refund COA roles guard check failed to run (non-fatal)"
    );
    return [];
  }
}
