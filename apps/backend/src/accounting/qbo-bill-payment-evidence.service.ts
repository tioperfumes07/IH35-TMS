// ACCT-F11104 — loads the inputs for the QBO bill-payment evidence proposal. READ-ONLY.
//
// Why this reads QuickBooks LIVE instead of the mirror mdata.qbo_ap_bill_payments:
//   * The mirror pull is gated by QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED. That flag was pinned OFF for all
//     three entities on 2026-08-16 (lib.feature_flag_overrides, set_by e4117991…) and then permanently
//     blocked by ROUND 195 (catalogs.blocked_feature_flags, migration 202614530000, 2026-09-28). The mirror's
//     last row is 2026-08-15 — that is the root cause of the stop, and it is an owner ruling this file does
//     not move.
//   * The mirror rows are keyed to the Transportation company id (the realm's connection row), and
//     Transportation is frozen. This file writes no mirror row and no Transportation row.
// What it does: resolves the app's live QBO connection for the realm USMCA runs on (owner 11-04: "qbo is
// connected as well in the app"), queries Bill + BillPayment dated on/after the USMCA cutover, and pairs them
// with the open USMCA bills and the unmatched USMCA bank debits. No INSERT/UPDATE/DELETE, no GL, no
// write-back to QuickBooks. Applying a row (bill payment + bank-line match) stays the owner's action through
// the existing bill-payment / bank-match engine.

import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { USMCA_COMPANY_ID } from "../org/company-ids.js";
import {
  QBO_EVIDENCE_CUTOVER_DATE,
  buildQboBillPaymentEvidence,
  mapQboBill,
  mapQboBillPayment,
  type EvidenceAppBill,
  type EvidenceBankLine,
  type EvidenceProposal,
} from "./qbo-bill-payment-evidence.match.js";

/** The QBO company "USMCA Freight Solutions, Inc." (company_info 2026-11-04) — the realm USMCA runs on. */
export const USMCA_QBO_EVIDENCE_REALM_ID = "123145885549599";

export class QboEvidenceScopeError extends Error {
  code = "QBO_EVIDENCE_USMCA_ONLY";
}

async function resolveRealmConnectionCompanyId(realmId: string): Promise<string> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ operating_company_id: string }>(
      `SELECT operating_company_id::text AS operating_company_id
         FROM integrations.qbo_connections
        WHERE realm_id = $1 AND revoked_at IS NULL
        ORDER BY authorized_at DESC NULLS LAST
        LIMIT 1`,
      [realmId]
    );
    const id = res.rows[0]?.operating_company_id;
    if (!id) throw new Error(`QBO_EVIDENCE_NO_LIVE_CONNECTION: no unrevoked connection for realm ${realmId}`);
    return id;
  });
}

async function loadAppSide(userId: string, operatingCompanyId: string, cutover: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const bills = await client.query<{
      id: string;
      bill_number: string | null;
      bill_date: string;
      amount_cents: string;
      paid_cents: string | null;
      vendor_name: string | null;
      bill_category: string | null;
      driver_bill_id: string | null;
      settlement_id: string | null;
    }>(
      `SELECT b.id::text, b.bill_number, b.bill_date::text AS bill_date, b.amount_cents::text,
              COALESCE(b.paid_cents, 0)::text AS paid_cents, v.vendor_name, b.bill_category,
              db.id::text AS driver_bill_id, db.settled_in_settlement_id::text AS settlement_id
         FROM accounting.bills b
         LEFT JOIN mdata.vendors v ON v.id = b.mdata_vendor_id AND v.operating_company_id = b.operating_company_id
         LEFT JOIN LATERAL (
           SELECT d.id, d.settled_in_settlement_id
             FROM driver_finance.driver_bills d
            WHERE (d.accrued_bill_id = b.id OR d.accrued_team_bill_id = b.id) AND d.voided_at IS NULL
            ORDER BY d.created_at DESC LIMIT 1
         ) db ON true
        WHERE b.operating_company_id = $1::uuid
          AND b.voided_at IS NULL
          AND b.revoked_at IS NULL
          AND COALESCE(b.is_sample_data, false) = false
          AND b.status IN ('unpaid', 'partially_paid')
        ORDER BY b.bill_date, b.bill_number`,
      [operatingCompanyId]
    );
    const bank = await client.query<{
      id: string;
      bank_account_id: string;
      transaction_date: string;
      amount_cents: string;
      description: string | null;
      status: string | null;
    }>(
      `SELECT t.id::text, t.bank_account_id::text, t.transaction_date::text AS transaction_date,
              -- direction comes from is_credit (amount_cents' sign runs opposite it on this table);
              -- the matcher's convention is debit = negative, so project the signed amount from is_credit.
              (CASE WHEN t.is_credit THEN abs(t.amount_cents) ELSE -abs(t.amount_cents) END)::text AS amount_cents,
              t.description, t.status
         FROM banking.bank_transactions t
        WHERE t.operating_company_id = $1::uuid
          AND t.voided_at IS NULL
          AND t.merged_into_bank_transaction_id IS NULL
          AND COALESCE(t.is_sample_data, false) = false
          AND t.is_credit = false
          AND t.transaction_date >= $2::date
          AND t.matched_bill_payment_id IS NULL
          AND t.matched_bill_id IS NULL
          AND t.matched_expense_id IS NULL
          AND t.matched_transfer_id IS NULL
          AND t.matched_journal_entry_id IS NULL`,
      [operatingCompanyId, cutover]
    );
    const appBills: EvidenceAppBill[] = bills.rows.map((r) => ({
      id: r.id,
      bill_number: r.bill_number,
      bill_date: r.bill_date.slice(0, 10),
      amount_cents: Number(r.amount_cents),
      paid_cents: Number(r.paid_cents ?? 0),
      vendor_name: r.vendor_name,
      bill_category: r.bill_category,
      driver_bill_id: r.driver_bill_id,
      settlement_id: r.settlement_id,
    }));
    const bankLines: EvidenceBankLine[] = bank.rows.map((r) => ({
      id: r.id,
      bank_account_id: r.bank_account_id,
      transaction_date: r.transaction_date.slice(0, 10),
      amount_cents: Number(r.amount_cents),
      description: r.description,
      status: r.status,
    }));
    return { appBills, bankLines };
  });
}

export async function getQboBillPaymentEvidence(input: {
  userId: string;
  operating_company_id: string;
}): Promise<EvidenceProposal & { realm_id: string; generated_at: string }> {
  if (input.operating_company_id !== USMCA_COMPANY_ID) {
    throw new QboEvidenceScopeError("QBO bill-payment evidence is USMCA-only");
  }
  const cutover = QBO_EVIDENCE_CUTOVER_DATE;
  const { appBills, bankLines } = await loadAppSide(input.userId, input.operating_company_id, cutover);

  const connectionCompanyId = await resolveRealmConnectionCompanyId(USMCA_QBO_EVIDENCE_REALM_ID);
  const ctx = await qboCompanyContext(connectionCompanyId);
  if (ctx.realmId !== USMCA_QBO_EVIDENCE_REALM_ID) {
    throw new Error(`QBO_EVIDENCE_REALM_MISMATCH: connection serves ${ctx.realmId}`);
  }
  const where = `TxnDate >= '${cutover}'`;
  const rawBills: Record<string, unknown>[] = [];
  for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Bill", where, { pageSize: 1000 })) rawBills.push(...page);
  const rawPayments: Record<string, unknown>[] = [];
  for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "BillPayment", where, { pageSize: 1000 })) rawPayments.push(...page);

  const proposal = buildQboBillPaymentEvidence({
    appBills,
    qboBills: rawBills.map(mapQboBill),
    qboBillPayments: rawPayments.map(mapQboBillPayment),
    bankLines,
    cutoverDate: cutover,
  });
  return { ...proposal, realm_id: USMCA_QBO_EVIDENCE_REALM_ID, generated_at: new Date().toISOString() };
}
