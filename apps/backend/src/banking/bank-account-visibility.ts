// Per-entity bank-account HIDE/EXCLUDE (Tier-1 HOLD, build-and-hold behind BANK_ACCOUNT_HIDE_ENABLED,
// default OFF). Design doc: docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md
//
// WHY: TRANSP and TRK share ONE Wells Fargo/Plaid login, so Plaid ingests ALL 4 WF accounts (3 TRANSP +
// 1 TRK) into BOTH entities' banking.bank_accounts — each as its OWN row scoped by operating_company_id
// (0072 RLS design: one row = exactly one entity). An entity must be able to fully hide the OTHER
// entity's duplicate rows so they never touch that entity's ledger/CoA/BS/cash-flow/categorization/
// reconciliation. Migration 202607121000_bank_account_entity_hide.sql adds nullable
// hidden_at/hidden_by_user_id/hidden_reason to banking.bank_accounts (void-not-delete — hide/unhide only
// ever sets/clears these columns, never deletes the row). No new GL math, no new table.
//
// This module is the SINGLE shared place every consumer imports from, so the flag check + SQL fragment
// can never drift between read paths (mirrors the pending-categorization.ts BANKING-1 pattern).
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const BANK_ACCOUNT_HIDE_FLAG_KEY = "BANK_ACCOUNT_HIDE_ENABLED";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/** Owner/Administrator ONLY — matches the Void/Cancel Governance Policy pattern for irreversible-looking,
 * financial-surface-affecting actions. Hiding an account changes what appears on that entity's balance
 * sheet/cash-flow, so it is gated the same way as a void/cancel executor action. */
export function isBankAccountHideAdminRole(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

/** Resolve whether the per-entity hide feature is active for this operating company. Per-entity-only
 * flag (see PER_ENTITY_ONLY_FLAG_KEYS in lib/feature-flags/service.ts) — a global default/rollout can
 * never turn this on for every entity at once; it is always an explicit per-entity override. */
export async function isBankAccountHideEnabled(
  client: Queryable,
  operatingCompanyId: string
): Promise<boolean> {
  return isEnabled(client, BANK_ACCOUNT_HIDE_FLAG_KEY, { operating_company_id: operatingCompanyId });
}

/**
 * SQL predicate fragment to exclude hidden bank-account ROWS, for queries that select directly FROM
 * banking.bank_accounts (alias defaults to the bare table name). Returns "" when the flag is off for
 * this entity (so behavior is byte-identical to today until Jorge flips the per-entity override) or a
 * leading- `AND` clause when on.
 *
 * Usage:
 *   const hideOn = await isBankAccountHideEnabled(client, companyId);
 *   const filter = bankAccountHiddenFilterSql(hideOn, "ba");
 *   `SELECT * FROM banking.bank_accounts ba WHERE ba.operating_company_id = $1 ${filter}`
 */
export function bankAccountHiddenFilterSql(hideOn: boolean, alias = "banking.bank_accounts"): string {
  return hideOn ? `AND ${alias}.hidden_at IS NULL` : "";
}

/**
 * SQL predicate fragment to exclude bank TRANSACTIONS whose owning bank_account is hidden, for queries
 * that select FROM banking.bank_transactions and reference the account via `bankAccountIdCol` (default
 * `bank_account_id`, the FK column on banking.bank_transactions — see migration 0073). Uses a NOT EXISTS
 * subquery so callers don't need an existing JOIN to banking.bank_accounts.
 */
export function bankTransactionHiddenFilterSql(
  hideOn: boolean,
  txnAlias = "bt",
  bankAccountIdCol = "bank_account_id"
): string {
  if (!hideOn) return "";
  return `AND NOT EXISTS (
    SELECT 1 FROM banking.bank_accounts __bah
    WHERE __bah.id = ${txnAlias}.${bankAccountIdCol}
      AND __bah.hidden_at IS NOT NULL
  )`;
}

/**
 * Guard for any NEW action that targets a specific bank_account_id chosen fresh (start a reconciliation
 * session, upload a statement, pick a bank for a transfer/payment/advance, etc.). Returns false when the
 * account is hidden for this entity and the flag is on — callers should then respond 404/403 so a hidden
 * account can never be engaged with going forward. Existing/historical records referencing an account
 * that was hidden AFTER the fact are left untouched (void-not-delete — this only gates NEW engagement).
 */
export async function assertBankAccountUsable(
  client: Queryable,
  bankAccountId: string,
  operatingCompanyId: string
): Promise<boolean> {
  const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
  if (!hideOn) return true;
  const res = await client.query<{ hidden_at: string | null }>(
    `SELECT hidden_at::text FROM banking.bank_accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [bankAccountId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) return true; // not found is handled by the caller's own existence check
  return row.hidden_at == null;
}

export interface HideBankAccountInput {
  bankAccountId: string;
  operatingCompanyId: string;
  actorUserId: string;
  reason: string;
}

export interface UnhideBankAccountInput {
  bankAccountId: string;
  operatingCompanyId: string;
  actorUserId: string;
}

export interface BankAccountVisibilityRow {
  id: string;
  operating_company_id: string;
  hidden_at: string | null;
  hidden_by_user_id: string | null;
  hidden_reason: string | null;
}

/** Hide a bank account row FOR THIS ENTITY ONLY (void-not-delete: sets hidden_at, never deletes).
 * Scoped by operating_company_id so an entity can only hide its OWN row — it can never reach into (or
 * affect) the other entity's row for what is conceptually "the same" real-world Wells Fargo account. */

/**
 * F9-01 — exclude voided bank_transactions (merged manual stubs retained for audit).
 * Always on (not feature-flagged): voided rows must never double-count balances or feeds.
 */
export function bankTransactionActiveFilterSql(txnAlias = "bt"): string {
  return `AND ${txnAlias}.voided_at IS NULL`;
}

export async function hideBankAccountForEntity(
  client: Queryable,
  input: HideBankAccountInput
): Promise<BankAccountVisibilityRow | null> {
  const res = await client.query<BankAccountVisibilityRow>(
    `
      UPDATE banking.bank_accounts
      SET hidden_at = now(),
          hidden_by_user_id = $3::uuid,
          hidden_reason = $4
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND hidden_at IS NULL
      RETURNING id::text, operating_company_id::text, hidden_at::text, hidden_by_user_id::text, hidden_reason
    `,
    [input.bankAccountId, input.operatingCompanyId, input.actorUserId, input.reason]
  );
  const row = res.rows[0] ?? null;
  if (row) {
    await appendCrudAudit(
      client,
      input.actorUserId,
      "BANK-ACCOUNT-HIDE.hidden",
      {
        resource_type: "banking.bank_accounts",
        resource_id: input.bankAccountId,
        operating_company_id: input.operatingCompanyId,
        reason: input.reason,
      },
      "warning"
    );
  }
  return row;
}

/** Reverse a hide (clears hidden_at/hidden_by_user_id/hidden_reason). Reversible by design — hiding is a
 * per-entity visibility toggle, never a delete. */
export async function unhideBankAccountForEntity(
  client: Queryable,
  input: UnhideBankAccountInput
): Promise<BankAccountVisibilityRow | null> {
  const res = await client.query<BankAccountVisibilityRow>(
    `
      UPDATE banking.bank_accounts
      SET hidden_at = NULL,
          hidden_by_user_id = NULL,
          hidden_reason = NULL
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND hidden_at IS NOT NULL
      RETURNING id::text, operating_company_id::text, hidden_at::text, hidden_by_user_id::text, hidden_reason
    `,
    [input.bankAccountId, input.operatingCompanyId]
  );
  const row = res.rows[0] ?? null;
  if (row) {
    await appendCrudAudit(
      client,
      input.actorUserId,
      "BANK-ACCOUNT-HIDE.unhidden",
      {
        resource_type: "banking.bank_accounts",
        resource_id: input.bankAccountId,
        operating_company_id: input.operatingCompanyId,
      },
      "info"
    );
  }
  return row;
}
