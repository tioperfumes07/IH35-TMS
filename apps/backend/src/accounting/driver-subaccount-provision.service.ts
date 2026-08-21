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

// ACCT-F5681 (owner directive, 00_LOCKED_DECISIONS §9.4) — "Damage Claim Escrow" is TRANSP's
// QBO-mirrored label for the SAME locked concept §9.4 names generically: "every escrow draw debits
// the Driver Escrow liability (QBO-1150040187), never an expense." USMCA is TMS-native (no
// QuickBooks) and carries the real, owner-created Liability account for that identical concept
// under a DIFFERENT name: "Driver Escrow - Held in Trust" (2100) — arguably closer to §9.4's own
// generic wording than TRANSP's QBO-derived label is. resolveCanonicalParentAccount's exact-name
// match previously found nothing on USMCA and treated it as "chart without an escrow liability at
// all" (the same graceful no-op correctly designed for TRK, which legitimately owns none) — but
// USMCA is NOT chart-less, it is differently-named, so every USMCA driver's escrow sub-account
// provisioning silently no-opped. Fixing this WITHOUT renaming the real account (Rule 19: never
// reclassify/rename an owner-created reserve account unilaterally) — this list is an ADDITIVE,
// per-entity alias set, resolved by the SAME entity-scoped, name+type+top-level lookup as the
// primary name; TRANSP/TRK are untouched (TRANSP already resolves via the primary name; TRK has
// no escrow chart at all and correctly keeps resolving null).
const DRIVER_ESCROW_GRANDPARENT_ALIASES: readonly string[] = ["Driver Escrow - Held in Trust"];

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
  let grandparentId = await resolveCanonicalParentAccount(client, {
    accountName: DRIVER_ESCROW_GRANDPARENT_NAME,
    accountType: "Liability",
    operatingCompanyId: args.operatingCompanyId,
  });
  // ACCT-F5681 — the primary name found nothing; try this entity's documented alias(es) for the
  // SAME locked §9.4 concept before concluding "chart without an escrow liability at all".
  for (let i = 0; !grandparentId && i < DRIVER_ESCROW_GRANDPARENT_ALIASES.length; i += 1) {
    grandparentId = await resolveCanonicalParentAccount(client, {
      accountName: DRIVER_ESCROW_GRANDPARENT_ALIASES[i]!,
      accountType: "Liability",
      operatingCompanyId: args.operatingCompanyId,
    });
  }
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
      )
      SELECT
        -- ROW-259: the escrow SUB-PARENT header is numbered from its grandparent too. It is
        -- is_postable=false, so nothing posts here — but an unnumbered header sorts to the top of the
        -- chart and cannot be referenced by number, which is exactly the reconciliation complaint that
        -- opened ROW 259. Header suffix '-00' keeps it above its own numbered leaves.
        COALESCE(g.account_number || '-00', NULL),
        $1, 'Liability', g.account_subtype, g.id,
        NULL, false, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      FROM catalogs.accounts g
      -- Entity-pinned for the same reason as the leaf inserts above.
      WHERE g.id = $2::uuid AND g.operating_company_id = $5::uuid
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
 * parent — that's a graceful no-op for charts without it). is_postable=true (per the live precedent).
 *
 * ROW-259 (2026-08-03): account_number and account_subtype are NO LONGER left NULL.
 *
 * They used to be, with the comment "assigned when the account syncs to QBO". That assumption is FALSE
 * for any entity without a QuickBooks connection — USMCA has none, so its per-driver accounts could
 * NEVER receive a number and every new hire minted another NULL. (Same false premise that broke the WO
 * vendor lookup in #4048: code assuming a QBO mirror exists for a non-QBO entity. Under parallel books
 * TMS is authoritative and must number its own accounts.)
 *
 * A NULL account_number breaks reconciliation and sorting; a NULL account_subtype makes the account
 * match no subtype-based filter. Both are now derived locally:
 *   number  = "<parent account_number>-<zero-padded sequence>"  (owner-approved scheme)
 *   subtype = inherited from the parent
 * qbo_account_id stays NULL — that genuinely IS assigned by QBO, for entities that have it.
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
      )
      SELECT
        -- ROW-259: derive locally. Sequence is computed from siblings under THIS parent inside the
        -- same statement, so two concurrent hires cannot mint the same number.
        p.account_number || '-' || lpad((
          COALESCE((
            SELECT MAX(NULLIF(regexp_replace(sib.account_number, '^' || p.account_number || '-', ''), '')::int)
            FROM catalogs.accounts sib
            WHERE sib.operating_company_id = $5::uuid
              AND sib.parent_account_id = p.id
              AND sib.account_number ~ ('^' || p.account_number || '-[0-9]+$')
          ), 0) + 1
        )::text, 3, '0'),
        $1, 'Asset', p.account_subtype, p.id,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      FROM catalogs.accounts p
      -- Entity-pinned: this runs on the is_lucia_bypass() path where catalogs.accounts RLS is
      -- DEFEATED, so resolving the parent by id ALONE could inherit another entity's subtype and
      -- number prefix into this entity's chart. Both sides must name the same company.
      WHERE p.id = $2::uuid AND p.operating_company_id = $5::uuid
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
      )
      SELECT
        -- ROW-259: same local derivation as the advance leaf. My first pass fixed only the ASSET
        -- sub-account and left this LIABILITY one still inserting NULL — caught by
        -- verify-entity-expense-category-map-complete before it shipped. Escrow is a driver's money
        -- held in trust, so an unnumbered, unsortable escrow account is the worse of the two.
        -- The sub-parent is a header and may itself be unnumbered; fall back to the parent NAME-derived
        -- prefix only when it has a number, else leave the sequence bare rather than invent a prefix.
        COALESCE(p.account_number || '-', '') || lpad((
          COALESCE((
            SELECT MAX(NULLIF(regexp_replace(sib.account_number, '^' || COALESCE(p.account_number || '-', ''), ''), '')::int)
            FROM catalogs.accounts sib
            WHERE sib.operating_company_id = $5::uuid
              AND sib.parent_account_id = p.id
              AND sib.account_number ~ ('^' || COALESCE(p.account_number || '-', '') || '[0-9]+$')
          ), 0) + 1
        )::text, 3, '0'),
        $1, 'Liability', p.account_subtype, p.id,
        NULL, true, 'USD',
        $3, $4::uuid, $4::uuid, $5::uuid
      FROM catalogs.accounts p
      -- Entity-pinned: this runs on the is_lucia_bypass() path where catalogs.accounts RLS is
      -- DEFEATED, so resolving the parent by id ALONE could inherit another entity's subtype and
      -- number prefix into this entity's chart. Both sides must name the same company.
      WHERE p.id = $2::uuid AND p.operating_company_id = $5::uuid
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
