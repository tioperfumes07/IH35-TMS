// ROUND 394 RULING 1 — a driver cash advance is a RECEIVABLE on the driver's OWN 1245 sub-account.
//
// Disbursement DEBITS it and pay-run close CREDITS the same account; there is no shared cash_advance /
// advance_recovery account on either side. The account is resolved through the driver-keyed bridge
// (driver_finance.driver_advance_accounts) and checked against the role table: the bridge's account must
// be a postable, active, same-entity child of the account bound to the advance_recovery role (1245 Driver
// Cash Advances Receivable). Never resolved by number or name (365.1). An unbound driver FAILS CLOSED.
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { provisionDriverAdvanceSubAccount, upsertDriverAdvanceAccountLink } from "../accounting/driver-subaccount-provision.service.js";

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

/**
 * ROUND 389.3 RULING 2 — make sure the driver has his own advance sub-account (1245-00-nnn, nnn his one driver
 * number) and its link, the way hire does, then resolve it with the same fail-closed rules as posting. Called where
 * an advance is created (that path knows the actor), so a driver hired before the writer was fixed is provisioned on
 * his first advance instead of being refused.
 */
export async function ensureDriverAdvanceSubAccount(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; actorUserId: string }
): Promise<string> {
  const existing = await resolveDriverAdvanceSubAccountOptional(client, input.operatingCompanyId, input.driverId);
  if (existing) return existing;
  const d = await client.query<{ first_name: string | null; last_name: string | null }>(
    `SELECT first_name, last_name FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [input.driverId, input.operatingCompanyId]
  );
  const driverName = `${d.rows[0]?.first_name ?? ""} ${d.rows[0]?.last_name ?? ""}`.trim();
  if (!driverName) {
    throw new DriverAdvanceAccountError("DRIVER_ADVANCE_ACCOUNT_MISSING", `Driver ${input.driverId} has no name to provision a Cash-Advance sub-account under`);
  }
  const provisioned = await provisionDriverAdvanceSubAccount(client as never, {
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    driverName,
    actorUserId: input.actorUserId,
  });
  if (provisioned.accountId) {
    await upsertDriverAdvanceAccountLink(client as never, {
      operatingCompanyId: input.operatingCompanyId,
      driverId: input.driverId,
      coaAccountId: provisioned.accountId,
      actorUserId: input.actorUserId,
    });
  }
  return resolveDriverAdvanceSubAccount(client, input.operatingCompanyId, input.driverId);
}
