// DRIVER-SUBACCOUNT-AUTO-PROVISION: on driver-profile creation, auto-create the per-driver named
// sub-accounts under the canonical parents in catalogs.accounts.
//
// Both sides: the ASSET sub-account (under "Driver Cash Advance") and the LIABILITY/escrow sub-account
// (under the year-agnostic "Driver Escrow" sub-parent, itself under "Damage Claim Escrow" —
// STOP-DECISION #1 locked: year-agnostic). The provisioned account ids are STORED against the driver:
// escrow -> accounting.escrow_accounts (0234), advance -> driver_finance.driver_advance_accounts.
//
// PORTABLE: parents resolved by the stable business key (account_name + type + top-level + entity),
// NEVER by hardcoded UUID (the B1-seed lesson). catalogs.accounts is PER-ENTITY since AF-1 (each row
// carries operating_company_id + entity RLS): every parent lookup, idempotency check and INSERT is
// scoped to operating_company_id so a driver's sub-accounts land under THEIR entity's chart — resolving
// or nesting under another entity's account (TRANSP/TRK/USMCA) would be a cross-entity GL leak. Callers
// MUST set app.operating_company_id on the transaction (AF-1 RLS returns 0 rows otherwise). Resolution
// returns the canonical parent or null (a no-op for companies whose chart lacks it, e.g. TRK).
// IDEMPOTENT: never double-creates — checks by (operating_company_id, account_name, parent_account_id).

import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const DRIVER_ADVANCE_PARENT_NAME = "Driver Cash Advance";
// STOP-DECISION #1 LOCKED (year-agnostic): per-driver escrow nests under a YEAR-AGNOSTIC sub-parent
// "Driver Escrow", which itself nests under the top-level "Damage Claim Escrow" (QBO-1150040187,
// Liability). NOT directly under "Damage Claim Escrow", NOT a year-prefixed parent — so a driver's
// escrow persists across years without annual re-parenting.
//   Damage Claim Escrow (top-level Liability)
//     └─ Driver Escrow (year-agnostic sub-parent)          <-- DRIVER_ESCROW_PARENT_NAME
//          └─ "<Driver Name> — Driver Escrow (hired MM/DD/YYYY)"   <-- per-driver leaf
export const DRIVER_ESCROW_GRANDPARENT_NAME = "Damage Claim Escrow";
export const DRIVER_ESCROW_PARENT_NAME = "Driver Escrow";

export type ProvisionResult =
  | { created: true; accountId: string; accountName: string }
  | { created: false; reason: "parent_not_found" | "already_exists"; accountId?: string };

/**
 * Resolve the canonical top-level parent by NAME + type WITHIN the given entity (stable key, never a
 * hardcoded UUID). operating_company_id is REQUIRED and predicated so a lookup never crosses into another
 * entity's chart (AF-1). Caller must have set app.operating_company_id on the transaction.
 */
export async function resolveCanonicalParentAccount(
  client: DbClient,
  args: { accountName: string; accountType: string; operatingCompanyId: string }
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND account_type = $2
        AND parent_account_id IS NULL
        AND deactivated_at IS NULL
        AND operating_company_id = $3::uuid
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [args.accountName, args.accountType, args.operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * The single source of the idempotent resolve/skip decision, shared by the per-driver provisioners
 * AND the bulk backfill (no duplicated logic): resolve the canonical parent by name+type, then check
 * whether the named sub-account already exists under it. NO writes.
 */
export type SubAccountPlan =
  | { action: "create"; parentId: string; subAccountName: string }
  | { action: "skip_exists"; parentId: string; existingId: string; subAccountName: string }
  | { action: "skip_no_parent"; subAccountName: string };

export async function planDriverSubAccount(
  client: DbClient,
  args: { parentName: string; parentType: string; subAccountName: string; operatingCompanyId: string }
): Promise<SubAccountPlan> {
  const parentId = await resolveCanonicalParentAccount(client, {
    accountName: args.parentName,
    accountType: args.parentType,
    operatingCompanyId: args.operatingCompanyId,
  });
  if (!parentId) return { action: "skip_no_parent", subAccountName: args.subAccountName };

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND parent_account_id = $2::uuid
        AND deactivated_at IS NULL
        AND operating_company_id = $3::uuid
      LIMIT 1
    `,
    [args.subAccountName, parentId, args.operatingCompanyId]
  );
  if (existing.rows[0]) return { action: "skip_exists", parentId, existingId: existing.rows[0].id, subAccountName: args.subAccountName };
  return { action: "create", parentId, subAccountName: args.subAccountName };
}

/** Resolve an existing named child account under a given parent (entity-scoped). Read-only, no write. */
async function resolveChildAccountId(
  client: DbClient,
  args: { subAccountName: string; parentId: string; operatingCompanyId: string }
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_name = $1
        AND parent_account_id = $2::uuid
        AND deactivated_at IS NULL
        AND operating_company_id = $3::uuid
      LIMIT 1
    `,
    [args.subAccountName, args.parentId, args.operatingCompanyId]
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Resolve the year-agnostic "Driver Escrow" sub-parent (READ-ONLY): the top-level "Damage Claim Escrow"
 * (Liability, parent_account_id IS NULL) resolved by name+type+entity, then its "Driver Escrow" child.
 * Returns both ids so callers can distinguish "no chart at all" (grandparentId null → graceful no-op for
 * charts without it, e.g. TRK) from "chart exists, sub-parent not yet created" (parentId null → create it).
 */
export async function resolveDriverEscrowParentId(
  client: DbClient,
  args: { operatingCompanyId: string }
): Promise<{ grandparentId: string | null; parentId: string | null }> {
  const grandparentId = await resolveCanonicalParentAccount(client, {
    accountName: DRIVER_ESCROW_GRANDPARENT_NAME,
    accountType: "Liability",
    operatingCompanyId: args.operatingCompanyId,
  });
  if (!grandparentId) return { grandparentId: null, parentId: null };
  const parentId = await resolveChildAccountId(client, {
    subAccountName: DRIVER_ESCROW_PARENT_NAME,
    parentId: grandparentId,
    operatingCompanyId: args.operatingCompanyId,
  });
  return { grandparentId, parentId };
}

/**
 * Resolve-or-CREATE the "Driver Escrow" sub-parent under "Damage Claim Escrow" (idempotent). Returns its
 * id, or null when the top-level "Damage Claim Escrow" is absent (graceful no-op for charts without it).
 * The sub-parent is a header (is_postable=false); only the per-driver leaves are postable.
 */
export async function ensureDriverEscrowParent(
  client: DbClient,
  args: { operatingCompanyId: string; actorUserId: string }
): Promise<string | null> {
  const { grandparentId, parentId } = await resolveDriverEscrowParentId(client, args);
  if (!grandparentId) return null;
  if (parentId) return parentId;

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.accounts (
        account_number, account_name, account_type, account_subtype, parent_account_id,
        qbo_account_id, is_postable, currency_code,
        notes, created_by_user_id, updated_by_user_id, operating_company_id
      ) VALUES (
        NULL, $1, 'Liability', NULL, $2::uuid,
        NULL, false, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      )
      RETURNING id::text
    `,
    [
      DRIVER_ESCROW_PARENT_NAME,
      grandparentId,
      "Auto-provisioned year-agnostic parent for per-driver escrow sub-accounts (STOP-DECISION #1)",
      args.actorUserId,
      args.operatingCompanyId,
    ]
  );
  const newParentId = ins.rows[0]!.id;

  await appendCrudAudit(
    client as never,
    args.actorUserId,
    "catalogs.accounts.created",
    {
      resource_type: "catalogs.accounts",
      resource_id: newParentId,
      operating_company_id: args.operatingCompanyId,
      account_name: DRIVER_ESCROW_PARENT_NAME,
      account_type: "Liability",
      parent_account_id: grandparentId,
      auto_provisioned: true,
      is_escrow_sub_parent: true,
    },
    "info",
    "DRIVER-SUBACCOUNT-AUTO-PROVISION"
  );
  return newParentId;
}

/**
 * READ-ONLY plan for a per-driver escrow leaf under the year-agnostic "Driver Escrow" sub-parent.
 * Mirrors planDriverSubAccount but understands the two-level nesting: if the top-level "Damage Claim
 * Escrow" is absent → skip_no_parent; if it exists but the "Driver Escrow" sub-parent is not yet
 * created → CREATE (the sub-parent is created on apply); else check the leaf's existence.
 */
export async function planDriverEscrowSubAccount(
  client: DbClient,
  args: { subAccountName: string; operatingCompanyId: string }
): Promise<SubAccountPlan> {
  const { grandparentId, parentId } = await resolveDriverEscrowParentId(client, args);
  if (!grandparentId) return { action: "skip_no_parent", subAccountName: args.subAccountName };
  if (!parentId) return { action: "create", parentId: grandparentId, subAccountName: args.subAccountName };
  const existingId = await resolveChildAccountId(client, {
    subAccountName: args.subAccountName,
    parentId,
    operatingCompanyId: args.operatingCompanyId,
  });
  if (existingId) return { action: "skip_exists", parentId, existingId, subAccountName: args.subAccountName };
  return { action: "create", parentId, subAccountName: args.subAccountName };
}

/** "Driver Cash Advance- <Driver Name>" — matches the live precedent format exactly. */
export function driverAdvanceSubAccountName(driverName: string): string {
  return `${DRIVER_ADVANCE_PARENT_NAME}- ${driverName.trim()}`;
}

/**
 * Format a hire date as MM/DD/YYYY (US) for the escrow leaf-account name. Accepts a Date, an ISO
 * timestamp, or a `YYYY-MM-DD` date string; parses the date parts WITHOUT a timezone shift (so a
 * `2026-06-12` hire never renders as 06/11/2026). Returns "unknown" for a missing/unparseable date.
 */
export function formatHireDateForName(hireDate: string | Date | null | undefined): string {
  if (!hireDate) return "unknown";
  if (hireDate instanceof Date) {
    if (Number.isNaN(hireDate.getTime())) return "unknown";
    const mm = String(hireDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(hireDate.getUTCDate()).padStart(2, "0");
    return `${mm}/${dd}/${hireDate.getUTCFullYear()}`;
  }
  const s = String(hireDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return "unknown";
}

/**
 * Per-driver escrow LEAF name: "<Driver Name> — Driver Escrow (hired MM/DD/YYYY)".
 * e.g. "Mecor Perez — Driver Escrow (hired 06/12/2026)". Name carries the driver's name + hire date
 * so the account is human-identifiable in the chart (year-agnostic parent — STOP-DECISION #1).
 */
export function driverEscrowSubAccountName(driverName: string, hireDate?: string | Date | null): string {
  return `${driverName.trim()} — ${DRIVER_ESCROW_PARENT_NAME} (hired ${formatHireDateForName(hireDate ?? null)})`;
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

  const plan = await planDriverSubAccount(client, {
    parentName: DRIVER_ADVANCE_PARENT_NAME,
    parentType: "Asset",
    subAccountName: name,
    operatingCompanyId: input.operatingCompanyId,
  });
  if (plan.action === "skip_no_parent") return { created: false, reason: "parent_not_found" };
  if (plan.action === "skip_exists") return { created: false, reason: "already_exists", accountId: plan.existingId };
  const parentId = plan.parentId;

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.accounts (
        account_number, account_name, account_type, account_subtype, parent_account_id,
        qbo_account_id, is_postable, currency_code,
        notes, created_by_user_id, updated_by_user_id, operating_company_id
      ) VALUES (
        NULL, $1, 'Asset', NULL, $2::uuid,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      )
      RETURNING id::text
    `,
    [name, parentId, `Auto-provisioned driver advance sub-account (driver ${input.driverId})`, input.actorUserId, input.operatingCompanyId]
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
 * Create the per-driver LIABILITY leaf "<Name> — Driver Escrow (hired MM/DD/YYYY)" nested under the
 * year-agnostic "Driver Escrow" sub-parent, itself under top-level "Damage Claim Escrow" (STOP-DECISION
 * #1). Resolve-or-creates the "Driver Escrow" sub-parent (idempotent). Mirrors the asset side: portable
 * (parents resolved by NAME + type, never a hardcoded UUID), best-effort (a missing top-level — e.g.
 * TRK's chart — is a graceful no-op). account_number/qbo_account_id NULL; is_postable=true.
 * Escrow is the DRIVER'S money held by the company (a liability), separate from the QBO-149 advance asset.
 */
export async function provisionDriverEscrowSubAccount(
  client: DbClient,
  input: { operatingCompanyId: string; driverId: string; driverName: string; hireDate?: string | Date | null; actorUserId: string }
): Promise<ProvisionResult> {
  const name = driverEscrowSubAccountName(input.driverName, input.hireDate ?? null);

  // Resolve-or-create the year-agnostic "Driver Escrow" sub-parent under "Damage Claim Escrow".
  const parentId = await ensureDriverEscrowParent(client, {
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
  });
  if (!parentId) return { created: false, reason: "parent_not_found" };

  const existingId = await resolveChildAccountId(client, {
    subAccountName: name,
    parentId,
    operatingCompanyId: input.operatingCompanyId,
  });
  if (existingId) return { created: false, reason: "already_exists", accountId: existingId };

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.accounts (
        account_number, account_name, account_type, account_subtype, parent_account_id,
        qbo_account_id, is_postable, currency_code,
        notes, created_by_user_id, updated_by_user_id, operating_company_id
      ) VALUES (
        NULL, $1, 'Liability', NULL, $2::uuid,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      )
      RETURNING id::text
    `,
    [name, parentId, `Auto-provisioned driver escrow sub-account (driver ${input.driverId})`, input.actorUserId, input.operatingCompanyId]
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

// ── WIRE/STORE the provisioned account ids against the driver (no orphans) ──────────────────────────
// Both links are entity-scoped: caller must have set app.operating_company_id on the transaction.

/**
 * UPSERT the driver -> escrow-account bridge in accounting.escrow_accounts (holder_type='driver',
 * purpose='driver_bond', coa_account_id = the provisioned escrow leaf). This is the EXISTING escrow
 * bridge (migration 0234); its UNIQUE (operating_company_id, holder_id, purpose) makes the upsert
 * idempotent and re-points coa_account_id if it ever changes. Forward: driver_id -> coa_account_id;
 * reverse: coa_account_id -> holder_id (driver). Escrow is a LIABILITY (held-in-trust).
 */
export async function upsertDriverEscrowAccountLink(
  client: DbClient,
  args: { operatingCompanyId: string; driverId: string; coaAccountId: string }
): Promise<void> {
  await client.query(
    `
      INSERT INTO accounting.escrow_accounts
        (operating_company_id, holder_id, holder_type, purpose, coa_account_id)
      VALUES ($1::uuid, $2::uuid, 'driver', 'driver_bond', $3::uuid)
      ON CONFLICT (operating_company_id, holder_id, purpose)
      DO UPDATE SET coa_account_id = EXCLUDED.coa_account_id, updated_at = now()
    `,
    [args.operatingCompanyId, args.driverId, args.coaAccountId]
  );
}

/**
 * UPSERT the driver -> cash-advance-account bridge in driver_finance.driver_advance_accounts (the NEW
 * symmetric bridge for the ASSET side; PK (operating_company_id, driver_id)). Idempotent, re-points
 * coa_account_id and reactivates on conflict. Forward: driver_id -> coa_account_id; reverse:
 * coa_account_id -> driver_id (via ix_driver_advance_accounts_coa). Cash advance is an ASSET.
 */
export async function upsertDriverAdvanceAccountLink(
  client: DbClient,
  args: { operatingCompanyId: string; driverId: string; coaAccountId: string; actorUserId: string }
): Promise<void> {
  await client.query(
    `
      INSERT INTO driver_finance.driver_advance_accounts
        (operating_company_id, driver_id, coa_account_id, is_active, created_by_user_id, updated_by_user_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, $4::uuid)
      ON CONFLICT (operating_company_id, driver_id)
      DO UPDATE SET coa_account_id = EXCLUDED.coa_account_id, is_active = true, updated_by_user_id = EXCLUDED.updated_by_user_id
    `,
    [args.operatingCompanyId, args.driverId, args.coaAccountId, args.actorUserId]
  );
}
