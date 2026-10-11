/**
 * Related-party loan CREATE writer — one callable service for HTTP create and for
 * CC-2 Relay deposit posting of personal-card advances (ROUND 443.22-2e / 443.29).
 *
 * POSTS NOTHING. Document + facility + note + optional bank reverse pointer only.
 * GL stays on the flag-gated poster (poster.service.ts).
 *
 * CALLABLE FOR CC-2 (personal-card Relay deposits → loan advances "paid directly to a vendor"):
 *   0210, 6248  Jorge personal          → createPaidDirectVendorAdvance (liability 2410-00-001)
 *   9855        Tio Perfumes 2          → createPaidDirectVendorAdvance (liability 2410-00-003)
 *
 * NOT A LOAN (do not call this writer):
 *   5007        Amex Scentsx            → credits "Amex Credit Card Payable" (2500-00-001)
 *                                         (Lead ruling 2026-10-11; CC-2 account-path poster)
 *
 * paid_direct_vendor rules (fail closed):
 *   - direction must be "in"
 *   - bank_transaction_id must be null (0 company bank rows)
 *   - funding_account_id required (what was paid for — e.g. Relay Fuel Wallet 1295)
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { buildLoanSchedule } from "./schedule.service.js";
import {
  allocateRelatedPartyLoanDisplayId,
  ensureRelatedPartyLoanFacility,
  getFacilityOpenBalanceCents,
} from "./facility.service.js";
import {
  advanceRequiresNote,
  mintRelatedPartyLoanAdvanceNote,
} from "./advance-note.service.js";

type PgClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export const RELATED_PARTY_LOAN_TARGET_TYPES = [
  "bill",
  "settlement",
  "cash_advance",
  "expense",
  "loan_out",
  "repayment",
  "intercompany",
  "bank_funding",
  "bank_repayment",
  /** ROUND 443.22-2e — personal-account pay to vendor; no company bank line. */
  "paid_direct_vendor",
] as const;

export type RelatedPartyLoanTargetType = (typeof RELATED_PARTY_LOAN_TARGET_TYPES)[number];

export type CreateRelatedPartyLoanEntryInput = {
  operating_company_id: string;
  direction: "in" | "out";
  relationship: "owner" | "spouse" | "friend" | "employee" | "related_company" | "other";
  counterparty_kind: "user" | "driver" | "vendor" | "company" | "other";
  counterparty_id?: string | null;
  counterparty_name?: string;
  account_id: string;
  target_type: RelatedPartyLoanTargetType;
  target_id?: string | null;
  principal_cents: number;
  entry_date: string;
  interest_rate_bps?: number;
  interest_method?: "simple" | "amortized" | "none";
  payment_frequency?: "weekly" | "biweekly" | "semimonthly" | "monthly" | "per_settlement" | "lump_sum";
  payment_count?: number | null;
  first_payment_date?: string;
  funding_source_note?: string;
  /** ROUND 443.22-2a — optional bank line (forbidden for paid_direct_vendor). */
  bank_transaction_id?: string | null;
  /**
   * ROUND 443.22-2e — CoA debit for paid_direct_vendor (what was paid for).
   * Required when target_type is paid_direct_vendor.
   */
  funding_account_id?: string | null;
  /** ROUND 443.22-2e — optional intermediary who paid from a personal account. */
  intermediary_name?: string;
};

export type CreateRelatedPartyLoanEntryOk = {
  id: string;
  facility_id: string;
  display_id: string;
  document_kind: string;
  schedule_rows: number;
  note_file_id: string | null;
  funding_account_id: string | null;
  intermediary_name: string | null;
};

export type CreateRelatedPartyLoanEntryErr =
  | { error: "account_not_found_for_company" }
  | { error: "funding_account_not_found_for_company" }
  | { error: "bank_transaction_not_found_for_company" }
  | { error: "paid_direct_vendor_requires_direction_in" }
  | { error: "paid_direct_vendor_forbids_bank_transaction" }
  | { error: "paid_direct_vendor_requires_funding_account" }
  | {
      error: "repayment_exceeds_facility_open_balance";
      open_balance_cents: number;
      principal_cents: number;
      facility_id: string;
      message: string;
    };

export type CreateRelatedPartyLoanEntryResult =
  | CreateRelatedPartyLoanEntryOk
  | CreateRelatedPartyLoanEntryErr;

/** CC-2 Relay personal-card deposit → loan advance (no company bank line). */
export type CreatePaidDirectVendorAdvanceInput = {
  operating_company_id: string;
  /** Liability CoA for the person (e.g. 2410-00-001 Jorge / 2410-00-003 Tio Perfumes 2). */
  account_id: string;
  /** What was paid for — Relay Fuel Wallet (1295) for deposit advances. */
  funding_account_id: string;
  principal_cents: number;
  entry_date: string;
  counterparty_name: string;
  relationship?: CreateRelatedPartyLoanEntryInput["relationship"];
  counterparty_kind?: CreateRelatedPartyLoanEntryInput["counterparty_kind"];
  counterparty_id?: string | null;
  interest_rate_bps?: number;
  funding_source_note?: string;
  intermediary_name?: string;
  /** Optional Relay deposit id stamped as target for linkage (never invents GL). */
  target_id?: string | null;
};

/**
 * Shared create writer. Used by POST /related-party-loans and by createPaidDirectVendorAdvance.
 */
export async function createRelatedPartyLoanEntry(
  client: PgClient,
  b: CreateRelatedPartyLoanEntryInput,
  actorUserUuid: string
): Promise<CreateRelatedPartyLoanEntryResult> {
  const interestRateBps = b.interest_rate_bps ?? 0;

  const acct = (await client.query(
    `SELECT id::text FROM catalogs.accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
    [b.account_id, b.operating_company_id]
  )) as { rows: Array<{ id: string }> };
  if (!acct.rows[0]) return { error: "account_not_found_for_company" };

  const isPaidDirect = b.target_type === "paid_direct_vendor";
  if (isPaidDirect) {
    if (b.direction !== "in") {
      return { error: "paid_direct_vendor_requires_direction_in" };
    }
    if (b.bank_transaction_id) {
      return { error: "paid_direct_vendor_forbids_bank_transaction" };
    }
    if (!b.funding_account_id) {
      return { error: "paid_direct_vendor_requires_funding_account" };
    }
  }

  let fundingAccountId: string | null = b.funding_account_id ?? null;
  if (fundingAccountId) {
    const fundAcct = (await client.query(
      `SELECT id::text FROM catalogs.accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
      [fundingAccountId, b.operating_company_id]
    )) as { rows: Array<{ id: string }> };
    if (!fundAcct.rows[0]) return { error: "funding_account_not_found_for_company" };
  }
  // Non-paid-direct creates must not stamp a funding debit by accident.
  if (!isPaidDirect) fundingAccountId = null;

  const facilityId = await ensureRelatedPartyLoanFacility(client, {
    companyId: b.operating_company_id,
    accountId: b.account_id,
    counterpartyName: b.counterparty_name,
    relationship: b.relationship,
    actorUserUuid,
  });
  const displayId = await allocateRelatedPartyLoanDisplayId(client, b.operating_company_id);
  const documentKind =
    b.target_type === "repayment" || b.target_type === "bank_repayment"
      ? "repayment"
      : b.target_type === "bank_funding" ||
          b.target_type === "paid_direct_vendor" ||
          Boolean(b.bank_transaction_id)
        ? "funding"
        : "manual";

  if (documentKind === "repayment") {
    const openBalanceCents = await getFacilityOpenBalanceCents(
      client,
      b.operating_company_id,
      facilityId
    );
    if (b.principal_cents > openBalanceCents) {
      return {
        error: "repayment_exceeds_facility_open_balance",
        open_balance_cents: openBalanceCents,
        principal_cents: b.principal_cents,
        facility_id: facilityId,
        message: `Repayment of ${(b.principal_cents / 100).toFixed(2)} exceeds facility open balance of ${(openBalanceCents / 100).toFixed(2)}. Stop — do not overpay.`,
      };
    }
  }

  if (b.bank_transaction_id) {
    const bankRow = (await client.query(
      `SELECT id::text
         FROM banking.bank_transactions
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND voided_at IS NULL
        LIMIT 1`,
      [b.bank_transaction_id, b.operating_company_id]
    )) as { rows: Array<{ id: string }> };
    if (!bankRow.rows[0]) return { error: "bank_transaction_not_found_for_company" };
  }

  const inserted = (await client.query(
    `INSERT INTO accounting.related_party_loan_entries
       (operating_company_id, direction, relationship, counterparty_kind, counterparty_id,
        counterparty_name, account_id, target_type, target_id, principal_cents, entry_date,
        interest_rate_bps, interest_method, payment_frequency, payment_count, first_payment_date,
        funding_source_note, status, facility_id, display_id, document_kind, bank_transaction_id,
        funding_account_id, intermediary_name, created_by_user_id)
     VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,$7::uuid,$8,$9::uuid,$10,$11::date,$12,$13,$14,$15,$16::date,$17,'open',$18::uuid,$19,$20,$21::uuid,$22::uuid,$23,$24::uuid)
     RETURNING id::text, direction, principal_cents, entry_date::text, facility_id::text, display_id`,
    [
      b.operating_company_id,
      b.direction,
      b.relationship,
      b.counterparty_kind,
      b.counterparty_id ?? null,
      b.counterparty_name ?? null,
      b.account_id,
      b.target_type,
      b.target_id ?? null,
      b.principal_cents,
      b.entry_date,
      interestRateBps,
      b.interest_method ?? null,
      b.payment_frequency ?? null,
      b.payment_count ?? null,
      b.first_payment_date ?? null,
      b.funding_source_note ?? null,
      facilityId,
      displayId,
      documentKind,
      b.bank_transaction_id ?? null,
      fundingAccountId,
      b.intermediary_name?.trim() || null,
      actorUserUuid,
    ]
  )) as { rows: Array<{ id: string; facility_id: string; display_id: string }> };
  const loanId = String(inserted.rows[0].id);

  if (b.bank_transaction_id) {
    await client.query(
      `UPDATE banking.bank_transactions
          SET matched_related_party_loan_id = $1::uuid,
              updated_at = now()
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid
          AND voided_at IS NULL`,
      [loanId, b.bank_transaction_id, b.operating_company_id]
    );
  }

  let scheduleRows = 0;
  if (b.payment_frequency && b.first_payment_date) {
    const rows = buildLoanSchedule({
      principalCents: b.principal_cents,
      interestRateBps,
      paymentFrequency: b.payment_frequency,
      paymentCount: b.payment_count ?? null,
      firstPaymentDate: b.first_payment_date,
    });
    for (const r of rows) {
      await client.query(
        `INSERT INTO accounting.related_party_loan_schedule
           (operating_company_id, loan_id, payment_number, due_date, payment_cents,
            principal_cents, interest_cents, remaining_balance_cents, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9::uuid)`,
        [
          b.operating_company_id,
          loanId,
          r.payment_number,
          r.due_date,
          r.payment_cents,
          r.principal_cents,
          r.interest_cents,
          r.remaining_balance_cents,
          actorUserUuid,
        ]
      );
    }
    scheduleRows = rows.length;
  }

  let noteFileId: string | null = null;
  if (
    advanceRequiresNote({
      direction: b.direction,
      documentKind,
    })
  ) {
    const note = await mintRelatedPartyLoanAdvanceNote(client, {
      operatingCompanyId: b.operating_company_id,
      loanId,
      facilityId,
      displayId,
      direction: b.direction,
      documentKind,
      counterpartyName: b.counterparty_name,
      relationship: b.relationship,
      principalCents: b.principal_cents,
      entryDate: b.entry_date,
      interestRateBps,
      accountId: b.account_id,
      actorUserId: actorUserUuid,
    });
    noteFileId = note.fileId;
  }

  await appendCrudAudit(
    client,
    actorUserUuid,
    "accounting.related_party_loan.created",
    {
      resource_type: "accounting.related_party_loan_entries",
      resource_id: loanId,
      operating_company_id: b.operating_company_id,
      direction: b.direction,
      principal_cents: b.principal_cents,
      account_id: b.account_id,
      facility_id: facilityId,
      display_id: displayId,
      document_kind: documentKind,
      schedule_rows: scheduleRows,
      note_file_id: noteFileId,
      funding_account_id: fundingAccountId,
      intermediary_name: b.intermediary_name?.trim() || null,
      bank_transaction_id: b.bank_transaction_id ?? null,
    },
    "info",
    "LOAN-05"
  );

  return {
    id: loanId,
    facility_id: facilityId,
    display_id: displayId,
    document_kind: documentKind,
    schedule_rows: scheduleRows,
    note_file_id: noteFileId,
    funding_account_id: fundingAccountId,
    intermediary_name: b.intermediary_name?.trim() || null,
  };
}

/**
 * CC-2 entry point: personal-card Relay deposit as a related-party loan advance
 * "paid directly to a vendor" (funding_account_id = Relay Fuel Wallet / what was paid for).
 *
 * Never invents GL. Never accepts a company bank_transaction_id.
 * Card 5007 Amex Scentsx must NOT call this — use Amex Credit Card Payable (2500-00-001).
 */
export async function createPaidDirectVendorAdvance(
  client: PgClient,
  input: CreatePaidDirectVendorAdvanceInput,
  actorUserUuid: string
): Promise<CreateRelatedPartyLoanEntryResult> {
  return createRelatedPartyLoanEntry(
    client,
    {
      operating_company_id: input.operating_company_id,
      direction: "in",
      relationship: input.relationship ?? "related_company",
      counterparty_kind: input.counterparty_kind ?? "company",
      counterparty_id: input.counterparty_id ?? null,
      counterparty_name: input.counterparty_name,
      account_id: input.account_id,
      target_type: "paid_direct_vendor",
      target_id: input.target_id ?? null,
      principal_cents: input.principal_cents,
      entry_date: input.entry_date,
      interest_rate_bps: input.interest_rate_bps ?? 400,
      funding_source_note: input.funding_source_note,
      bank_transaction_id: null,
      funding_account_id: input.funding_account_id,
      intermediary_name: input.intermediary_name,
    },
    actorUserUuid
  );
}
