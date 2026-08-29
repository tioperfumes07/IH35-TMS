import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
// INS-MONEY-F6965 — companyBusinessDate(), not new Date().toISOString() (UTC): after ~19:00
// Central this fleet-premium JE date can land one calendar day ahead of the real business day.
import { companyBusinessDate } from "../lib/company-business-date.js";

/**
 * Block E — Insurance Fleet Add/Remove pro-rata premium posting.
 *
 * FINANCIAL RULE — NO NEW FINANCIAL CODE: the pro-rata premium delta (on add) and
 * the pro-rata premium credit (on remove) are posted ONLY through the existing
 * accounting service `createJournalEntry()`. This module computes the cents amount
 * and resolves GL accounts by CoA ROLE (INS-01); it never inserts ledger rows directly.
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcDate(value: string): Date {
  // Accept "YYYY-MM-DD" (date column) or full ISO; normalize to midnight UTC.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  return new Date(dayOnly);
}

/**
 * Pro-rata premium for a single unit over the remaining term of the policy.
 *
 * - Per-unit annual premium = total_premium_cents / unitCount (the policy's average
 *   per-insured-unit premium). unitCount is the active-unit count INCLUDING the unit
 *   being added (on add) or the unit being removed (on remove).
 * - Remaining-term fraction = clamp(0..1) of remaining_days / total_term_days, where
 *   remaining is measured from max(asOf, effective_date) to expiry_date.
 *
 * Returns a non-negative integer number of cents. Returns 0 when the policy has no
 * premium, no term, or is already past expiry (nothing left to pro-rate).
 */
export function computeProRataPremiumDeltaCents(input: {
  totalPremiumCents: number;
  effectiveDate: string;
  expiryDate: string;
  unitCount: number;
  asOf?: Date;
}): number {
  const totalPremium = Number(input.totalPremiumCents || 0);
  const unitCount = Math.max(1, Math.floor(input.unitCount || 1));
  if (totalPremium <= 0) return 0;

  const effective = toUtcDate(input.effectiveDate);
  const expiry = toUtcDate(input.expiryDate);
  if (Number.isNaN(effective.getTime()) || Number.isNaN(expiry.getTime())) return 0;

  const totalTermDays = Math.round((expiry.getTime() - effective.getTime()) / MS_PER_DAY);
  if (totalTermDays <= 0) return 0;

  const asOf = input.asOf ?? new Date();
  const start = Math.max(asOf.getTime(), effective.getTime());
  const remainingDays = Math.round((expiry.getTime() - start) / MS_PER_DAY);
  if (remainingDays <= 0) return 0;

  const fraction = Math.min(1, remainingDays / totalTermDays);
  const perUnitPremium = totalPremium / unitCount;
  return Math.round(perUnitPremium * fraction);
}

/**
 * INS-01 — resolve fleet premium Debit/Credit by CoA role (never ORDER BY created_at).
 * Debit = insurance_expense (Truck/Vehicle Insurance). Credit = ap_control (premium payable).
 * Fail-closed when either role is unbound.
 */
async function pickFleetPremiumAccounts(client: Queryable, operatingCompanyId: string) {
  const expenseAccountId = await resolveRoleAccount(client as never, operatingCompanyId, "insurance_expense");
  const payableAccountId = await resolveRoleAccount(client as never, operatingCompanyId, "ap_control");
  if (!expenseAccountId || !payableAccountId) {
    throw new Error("E_FLEET_PREMIUM_JE_ACCOUNTS_MISSING");
  }
  if (expenseAccountId === payableAccountId) {
    throw new Error("E_FLEET_PREMIUM_JE_ACCOUNTS_COLLAPSED");
  }
  return { expenseAccountId, payableAccountId };
}

/**
 * Log the pro-rata premium movement for a fleet add/remove via createJournalEntry().
 *
 * direction "add"    → additional premium owed   (Dr insurance_expense / Cr ap_control)
 * direction "remove" → pro-rata premium credit   (Dr ap_control / Cr insurance_expense)
 *
 * Returns the journal entry id, or null when amountCents <= 0 (nothing to post — a
 * balanced JE requires a positive debit and credit, so zero-delta cases are skipped).
 */
export async function recordFleetPremiumJournalEntry(params: {
  actorUserId: string;
  actorRole: string;
  operatingCompanyId: string;
  policyId: string;
  assetId: string;
  direction: "add" | "remove";
  amountCents: number;
}): Promise<string | null> {
  const amount = Math.round(Number(params.amountCents || 0));
  if (amount <= 0) return null;

  return withCurrentUser(params.actorUserId, async (client) => {
    await setScopedCompanyContext(client, params.actorUserId, params.operatingCompanyId);
    const accounts = await pickFleetPremiumAccounts(client as Queryable, params.operatingCompanyId);
    const today = companyBusinessDate();

    const debitAccountId =
      params.direction === "add" ? accounts.expenseAccountId : accounts.payableAccountId;
    const creditAccountId =
      params.direction === "add" ? accounts.payableAccountId : accounts.expenseAccountId;
    const label =
      params.direction === "add"
        ? `Insurance fleet add: pro-rata premium for asset ${params.assetId} on policy ${params.policyId}`
        : `Insurance fleet remove: pro-rata premium credit for asset ${params.assetId} on policy ${params.policyId}`;

    const je = await createJournalEntry(
      {
        operating_company_id: params.operatingCompanyId,
        entry_date: today,
        memo: label.slice(0, 250),
        source: "auto",
        postings: [
          {
            account_id: debitAccountId,
            debit_or_credit: "debit",
            amount_cents: amount,
            description: `${label} (debit)`,
          },
          {
            account_id: creditAccountId,
            debit_or_credit: "credit",
            amount_cents: amount,
            description: `${label} (credit)`,
          },
        ],
      },
      { userId: params.actorUserId, role: params.actorRole }
    );
    return je.id;
  });
}
