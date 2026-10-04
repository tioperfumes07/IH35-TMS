// ROUND 394 RULING 1 — a driver cash advance is a RECEIVABLE on the driver's OWN 1245 sub-account.
//
// Disbursement DEBITS it and pay-run close CREDITS the same account; there is no shared cash_advance /
// advance_recovery account on either side. The account is resolved through the driver-keyed bridge
// (driver_finance.driver_advance_accounts) and checked against the role table: the bridge's account must
// be a postable, active, same-entity child of the account bound to the advance_recovery role (1245 Driver
// Cash Advances Receivable). Never resolved by number or name (365.1). An unbound driver FAILS CLOSED.
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverAdvanceAccountErrorCode = "DRIVER_ADVANCE_PARENT_UNBOUND" | "DRIVER_ADVANCE_ACCOUNT_MISSING";

export class DriverAdvanceAccountError extends Error {
  constructor(
    public readonly code: DriverAdvanceAccountErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DriverAdvanceAccountError";
  }
}

/** The role-bound 1245 parent, or null when the entity has no advance_recovery binding. */
export async function resolveDriverAdvanceParentAccount(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  return resolveRoleAccountOptional(client as never, operatingCompanyId, "advance_recovery");
}

/** The driver's own advance sub-account under the role-bound parent, or null. */
export async function resolveDriverAdvanceSubAccountOptional(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<string | null> {
  const parentId = await resolveDriverAdvanceParentAccount(client, operatingCompanyId);
  if (!parentId) return null;
  const res = await client.query<{ account_id: string }>(
    `
      SELECT daa.coa_account_id::text AS account_id
      FROM driver_finance.driver_advance_accounts daa
      JOIN catalogs.accounts a ON a.id = daa.coa_account_id
      WHERE daa.operating_company_id = $1::uuid
        AND daa.driver_id = $2::uuid
        AND daa.is_active = true
        AND a.operating_company_id = $1::uuid
        AND a.parent_account_id = $3::uuid
        AND a.is_postable = true
        AND a.deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, driverId, parentId]
  );
  return res.rows[0]?.account_id ?? null;
}

/** Same as the optional form, but throws a named error instead of returning null. */
export async function resolveDriverAdvanceSubAccount(client: DbClient, operatingCompanyId: string, driverId: string): Promise<string> {
  const parentId = await resolveDriverAdvanceParentAccount(client, operatingCompanyId);
  if (!parentId) {
    throw new DriverAdvanceAccountError(
      "DRIVER_ADVANCE_PARENT_UNBOUND",
      `No active 'advance_recovery' role binding (Driver Cash Advances Receivable) for company ${operatingCompanyId}`
    );
  }
  const own = await resolveDriverAdvanceSubAccountOptional(client, operatingCompanyId, driverId);
  if (!own) {
    throw new DriverAdvanceAccountError(
      "DRIVER_ADVANCE_ACCOUNT_MISSING",
      `Driver ${driverId} has no own Cash-Advance sub-account under the advance_recovery parent (driver_finance.driver_advance_accounts)`
    );
  }
  return own;
}
