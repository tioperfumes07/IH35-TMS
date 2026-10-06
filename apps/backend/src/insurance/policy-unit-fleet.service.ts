import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";
import { createBill } from "../accounting/bills.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
// INS-MONEY-F6965 — companyBusinessDate(), not new Date().toISOString() (UTC): after ~19:00
// Central this fleet-premium JE date can land one calendar day ahead of the real business day.
import { companyBusinessDate } from "../lib/company-business-date.js";

/**
 * Block E — Insurance Fleet Add/Remove pro-rata premium posting.
 *
 * FINANCIAL RULE — NO NEW FINANCIAL CODE: the pro-rata premium delta (on add) is a BILL
 * from the insurer (createBill) and the pro-rata premium credit (on remove) is a VENDOR
 * CREDIT from the insurer (createVendorCreditInClientTx). LST-F414: A/P is written only
 * by its documents (ROUND 393.1, trg_ap_control_written_only_by_documents); the raw
 * `insurance_policy` journal lines on ap_control this used to write are refused at write
 * time. This module computes the cents amount and resolves the expense account by CoA
 * ROLE (INS-01); it never inserts ledger rows directly.
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
 * LST-F414 — the policy's insurer (the vendor every fleet bill / credit names) and the human labels for the memo:
 * policy number and unit code, never raw ids.
 */
async function loadFleetPremiumParties(client: Queryable, operatingCompanyId: string, policyId: string, assetId: string) {
  const res = await client.query<{ vendor_id: string | null; policy_number: string | null; unit_code: string | null }>(
    `SELECT p.vendor_id::text AS vendor_id, p.policy_number,
            (SELECT a.unit_code FROM mdata.assets a WHERE a.id = $3::uuid AND a.operating_company_id = $1::uuid) AS unit_code
       FROM insurance.policy p
      WHERE p.operating_company_id = $1::uuid AND p.id = $2::uuid`,
    [operatingCompanyId, policyId, assetId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("E_FLEET_PREMIUM_POLICY_NOT_FOUND");
  if (!row.vendor_id) throw new Error("E_FLEET_PREMIUM_INSURER_VENDOR_MISSING");
  return { vendorId: row.vendor_id, policyNumber: row.policy_number ?? "(no number)", unitLabel: row.unit_code ?? "(unit without a code)" };
}

/**
 * INS-01 — the expense account the premium hits, by CoA role (never ORDER BY created_at). Fail-closed when unbound.
 */
async function pickFleetPremiumExpenseAccount(client: Queryable, operatingCompanyId: string) {
  const expenseAccountId = await resolveRoleAccount(client as never, operatingCompanyId, "insurance_expense");
  if (!expenseAccountId) throw new Error("E_FLEET_PREMIUM_JE_ACCOUNTS_MISSING");
  return expenseAccountId;
}

/**
 * The pro-rata premium movement for a fleet add/remove, as the insurer's document.
 *
 * direction "add"    → additional premium owed   → a bill from the insurer   (Dr insurance_expense / Cr A/P)
 * direction "remove" → pro-rata premium credit   → a vendor credit           (Dr A/P / Cr insurance_expense)
 *
 * Returns the journal entry id the document posted, or null when amountCents <= 0 (nothing to post) or the
 * bill's posting flag is off.
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
  const today = companyBusinessDate();

  const prepared = await withCurrentUser(params.actorUserId, async (client) => {
    await setScopedCompanyContext(client, params.actorUserId, params.operatingCompanyId);
    const parties = await loadFleetPremiumParties(client as Queryable, params.operatingCompanyId, params.policyId, params.assetId);
    const expenseAccountId = await pickFleetPremiumExpenseAccount(client as Queryable, params.operatingCompanyId);
    if (params.direction === "add") return { kind: "add" as const, parties, expenseAccountId };
    const credit = await createVendorCreditInClientTx(client as never, {
      operatingCompanyId: params.operatingCompanyId,
      vendorId: parties.vendorId,
      issueDate: today,
      amountCents: amount,
      accountId: expenseAccountId,
      notes: `Insurance fleet remove: pro-rata premium credit for unit ${parties.unitLabel} on policy ${parties.policyNumber}`.slice(0, 2000),
      userId: params.actorUserId,
    });
    return { kind: "removed" as const, journalEntryId: credit.journal_entry_id };
  });
  if (prepared.kind === "removed") return prepared.journalEntryId;

  const bill = await createBill(
    {
      operatingCompanyId: params.operatingCompanyId,
      vendorId: prepared.parties.vendorId,
      billDate: today,
      dueDate: today,
      amountCents: amount,
      memo: `Insurance fleet add: pro-rata premium for unit ${prepared.parties.unitLabel} on policy ${prepared.parties.policyNumber}`.slice(0, 250),
      coaAccountId: prepared.expenseAccountId,
    },
    params.actorUserId
  );
  return withCurrentUser(params.actorUserId, async (client) => {
    await setScopedCompanyContext(client, params.actorUserId, params.operatingCompanyId);
    const je = await (client as Queryable).query<{ id: string }>(
      `SELECT journal_entry_uuid::text AS id FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'bill' AND source_transaction_id = $2::uuid
        ORDER BY created_at ASC LIMIT 1`,
      [params.operatingCompanyId, bill.id]
    );
    return je.rows[0]?.id ?? null;
  });
}
