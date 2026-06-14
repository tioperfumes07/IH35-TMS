// DRIVER-SUBACCOUNT-AUTO-PROVISION: on driver-profile creation, auto-create the per-driver named
// sub-accounts under the canonical parents in catalogs.accounts.
//
// Both sides: the ASSET sub-account (under "Driver Cash Advance") and the LIABILITY/escrow sub-account
// (under "Damage Claim Escrow" — STOP-DECISION #1 locked: unprefixed, year-agnostic).
//
// PORTABLE: parents resolved by the stable business key (account_name + type + top-level), NEVER by
// hardcoded UUID (the B1-seed lesson). catalogs.accounts is a single global chart (no
// operating_company_id) = effectively the TRANSP chart; resolution returns the canonical parent or
// null (a no-op for companies whose chart lacks it, e.g. TRK).
// IDEMPOTENT: never double-creates — checks by (account_name, parent_account_id) first.

import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const DRIVER_ADVANCE_PARENT_NAME = "Driver Cash Advance";
// STOP-DECISION #1 LOCKED: per-driver escrow nests under the UNPREFIXED, year-agnostic parent
// "Damage Claim Escrow" (QBO-1150040187, Liability) — NOT "2026-Damage Claim Escrow" — so a driver's
// escrow persists across years without annual re-parenting.
export const DRIVER_ESCROW_PARENT_NAME = "Damage Claim Escrow";

export type ProvisionResult =
  | { created: true; accountId: string; accountName: string }
  | { created: false; reason: "parent_not_found" | "already_exists"; accountId?: string };

/** Resolve the canonical top-level parent by NAME + type (stable key, never a hardcoded UUID). */
export async function resolveCanonicalParentAccount(
  client: DbClient,
  args: { accountName: string; accountType: string }
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND account_type = $2
        AND parent_account_id IS NULL
        AND deactivated_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [args.accountName, args.accountType]
  );
  return res.rows[0]?.id ?? null;
}

/** "Driver Cash Advance- <Driver Name>" — matches the live precedent format exactly. */
export function driverAdvanceSubAccountName(driverName: string): string {
  return `${DRIVER_ADVANCE_PARENT_NAME}- ${driverName.trim()}`;
}

/** "Damage Claim Escrow- <Driver Name>" — same "<parent>- <Name>" format as the asset side. */
export function driverEscrowSubAccountName(driverName: string): string {
  return `${DRIVER_ESCROW_PARENT_NAME}- ${driverName.trim()}`;
}

/**
 * Create the per-driver ASSET sub-account "Driver Cash Advance- <Name>" nested under the canonical
 * "Driver Cash Advance" parent. Idempotent + portable. Returns a result (does NOT throw for a missing
 * parent — that's a graceful no-op for charts without it). account_number/qbo_account_id are left NULL
 * (assigned when the account syncs to QBO). is_postable=true (per the live precedent).
 */
export async function provisionDriverAdvanceSubAccount(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; driverName: string; actorUserId: string }
): Promise<ProvisionResult> {
  const name = driverAdvanceSubAccountName(input.driverName);

  const parentId = await resolveCanonicalParentAccount(client, {
    accountName: DRIVER_ADVANCE_PARENT_NAME,
    accountType: "Asset",
  });
  if (!parentId) return { created: false, reason: "parent_not_found" };

  // Idempotency: same name under the same parent already present.
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND parent_account_id = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [name, parentId]
  );
  if (existing.rows[0]) return { created: false, reason: "already_exists", accountId: existing.rows[0].id };

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.accounts (
        account_number, account_name, account_type, account_subtype, parent_account_id,
        qbo_account_id, is_postable, currency_code,
        notes, created_by_user_id, updated_by_user_id
      ) VALUES (
        NULL, $1, 'Asset', NULL, $2::uuid,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid
      )
      RETURNING id::text
    `,
    [name, parentId, `Auto-provisioned driver advance sub-account (driver ${input.driverId})`, input.actorUserId]
  );
  const accountId = ins.rows[0]!.id;

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "catalogs.accounts.created",
    {
      resource_type: "catalogs.accounts",
      resource_id: accountId,
      operating_company_id: input.operatingCompanyId,
      account_name: name,
      account_type: "Asset",
      parent_account_id: parentId,
      auto_provisioned: true,
      driver_id: input.driverId,
    },
    "info",
    "DRIVER-SUBACCOUNT-AUTO-PROVISION"
  );

  return { created: true, accountId, accountName: name };
}

/**
 * Create the per-driver LIABILITY sub-account "Damage Claim Escrow- <Name>" nested under the canonical
 * "Damage Claim Escrow" parent (STOP-DECISION #1: unprefixed, year-agnostic). Mirrors the asset side:
 * idempotent, portable (parent resolved by NAME + type, never a hardcoded UUID), best-effort (a missing
 * parent — e.g. TRK's chart — is a graceful no-op). account_number/qbo_account_id NULL; is_postable=true.
 * Escrow is the DRIVER'S money held by the company (a liability), separate from the QBO-149 advance asset.
 */
export async function provisionDriverEscrowSubAccount(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; driverName: string; actorUserId: string }
): Promise<ProvisionResult> {
  const name = driverEscrowSubAccountName(input.driverName);

  const parentId = await resolveCanonicalParentAccount(client, {
    accountName: DRIVER_ESCROW_PARENT_NAME,
    accountType: "Liability",
  });
  if (!parentId) return { created: false, reason: "parent_not_found" };

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND parent_account_id = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [name, parentId]
  );
  if (existing.rows[0]) return { created: false, reason: "already_exists", accountId: existing.rows[0].id };

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.accounts (
        account_number, account_name, account_type, account_subtype, parent_account_id,
        qbo_account_id, is_postable, currency_code,
        notes, created_by_user_id, updated_by_user_id
      ) VALUES (
        NULL, $1, 'Liability', NULL, $2::uuid,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid
      )
      RETURNING id::text
    `,
    [name, parentId, `Auto-provisioned driver escrow sub-account (driver ${input.driverId})`, input.actorUserId]
  );
  const accountId = ins.rows[0]!.id;

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "catalogs.accounts.created",
    {
      resource_type: "catalogs.accounts",
      resource_id: accountId,
      operating_company_id: input.operatingCompanyId,
      account_name: name,
      account_type: "Liability",
      parent_account_id: parentId,
      auto_provisioned: true,
      driver_id: input.driverId,
    },
    "info",
    "DRIVER-SUBACCOUNT-AUTO-PROVISION"
  );

  return { created: true, accountId, accountName: name };
}
