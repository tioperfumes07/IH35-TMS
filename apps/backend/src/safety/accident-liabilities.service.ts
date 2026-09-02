// GO-20 slice C (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — safety.accident_liabilities.
//
// "Filing an accident creates a liability in status open with a null owner_decision, assessed
// from safety.accident_cost_lines. It posts NOTHING. The owner decides. Only the owner. The
// decision is what moves money." See db/migrations/202613400001 for the schema + the live-verified
// correction (accident_id anchors on safety.accident_reports, not safety.accidents — the doc's
// named table has zero cost lines attached; accident_reports is what accident_cost_lines actually
// FKs to).
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { reverseJournalEntryNoFlip } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class AccidentLiabilityError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "AccidentLiabilityError";
  }
}

export type OwnerDecision = "driver_chargeback" | "company_absorbs" | "insurance_only" | "split";

type CreateLiabilityInput = {
  operating_company_id: string;
  accident_id: string;
  created_by_user_id: string;
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  load_id?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
  insurance_claim_id?: string | null;
  work_order_id?: string | null;
  legal_matter_id?: string | null;
  insurance_recovery_cents?: number;
  deductible_cents?: number;
  expense_account_id?: string | null;
};

// Filing creates a liability from cost lines. POSTS NOTHING — no deduction, no journal entry.
// Idempotent: refiling against an already-liable accident reuses the existing open row rather than
// minting a second one (matches uq_liability_per_accident).
export async function createLiabilityFromAccident(
  client: DbClient,
  input: CreateLiabilityInput
): Promise<{ id: string; action: "created" | "reused"; assessed_amount_cents: number; net_exposure_cents: number }> {
  const existing = await client.query<{ id: string; assessed_amount_cents: string; net_exposure_cents: string }>(
    `SELECT id, assessed_amount_cents, net_exposure_cents
       FROM safety.accident_liabilities
      WHERE operating_company_id = $1::uuid AND accident_id = $2::uuid AND voided_at IS NULL`,
    [input.operating_company_id, input.accident_id]
  );
  if (existing.rows[0]?.id) {
    return {
      id: existing.rows[0].id,
      action: "reused",
      assessed_amount_cents: Number(existing.rows[0].assessed_amount_cents),
      net_exposure_cents: Number(existing.rows[0].net_exposure_cents),
    };
  }

  const sumRes = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM safety.accident_cost_lines WHERE accident_id = $1::uuid`,
    [input.accident_id]
  );
  const assessed = Number(sumRes.rows[0]?.total ?? 0);
  const insuranceRecovery = input.insurance_recovery_cents ?? 0;
  const deductible = input.deductible_cents ?? 0;
  const netExposure = assessed - insuranceRecovery;

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO safety.accident_liabilities (
        operating_company_id, accident_id, driver_id, unit_id, trailer_id, load_id, customer_id,
        vendor_id, insurance_claim_id, work_order_id, legal_matter_id, assessed_amount_cents,
        insurance_recovery_cents, deductible_cents, net_exposure_cents, expense_account_id,
        status, created_by_user_id
      )
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::uuid,
              $11::uuid,$12,$13,$14,$15,$16::uuid,'open',$17::uuid)
      RETURNING id
    `,
    [
      input.operating_company_id,
      input.accident_id,
      input.driver_id ?? null,
      input.unit_id ?? null,
      input.trailer_id ?? null,
      input.load_id ?? null,
      input.customer_id ?? null,
      input.vendor_id ?? null,
      input.insurance_claim_id ?? null,
      input.work_order_id ?? null,
      input.legal_matter_id ?? null,
      assessed,
      insuranceRecovery,
      deductible,
      netExposure,
      input.expense_account_id ?? null,
      input.created_by_user_id,
    ]
  );
  return { id: res.rows[0]!.id, action: "created", assessed_amount_cents: assessed, net_exposure_cents: netExposure };
}

type DecideInput = {
  operating_company_id: string;
  liability_id: string;
  decision: OwnerDecision;
  note: string;
  decided_by_user_id: string;
  driver_charge_cents?: number;
  company_absorb_cents?: number;
  entry_date?: string;
};

// The owner decides. Only the owner (enforced by the caller/route, not here — this function trusts
// the actor it is given). driver_chargeback -> a PENDING driver_settlement_deductions row, never
// applied automatically. company_absorbs -> posts the expense. insurance_only -> no driver charge,
// the deductible posts as a company expense. split -> both, and the two amounts must equal
// net_exposure_cents exactly. A liability with no owner_decision never reaches this function's
// money-moving branches (the caller only calls this once, guarded by owner_decision IS NULL below).
export async function decideAccidentLiability(client: DbClient, input: DecideInput) {
  const note = input.note?.trim() ?? "";
  if (!note) throw new AccidentLiabilityError("decision_note_required", "A note is required for every owner decision.");

  const liabRes = await client.query<{
    id: string;
    driver_id: string | null;
    load_id: string | null;
    net_exposure_cents: string;
    deductible_cents: string;
    expense_account_id: string | null;
    owner_decision: string | null;
    voided_at: string | null;
  }>(
    `
      SELECT id, driver_id, load_id, net_exposure_cents, deductible_cents, expense_account_id, owner_decision, voided_at
        FROM safety.accident_liabilities
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       FOR UPDATE
    `,
    [input.liability_id, input.operating_company_id]
  );
  const liab = liabRes.rows[0];
  if (!liab) throw new AccidentLiabilityError("accident_liability_not_found");
  if (liab.voided_at) throw new AccidentLiabilityError("accident_liability_voided", "This liability was voided.");
  if (liab.owner_decision) throw new AccidentLiabilityError("accident_liability_already_decided");

  const netExposure = Number(liab.net_exposure_cents);
  const deductible = Number(liab.deductible_cents);
  let driverCharge = 0;
  let companyAbsorb = 0;

  if (input.decision === "driver_chargeback") {
    driverCharge = netExposure;
  } else if (input.decision === "company_absorbs") {
    companyAbsorb = netExposure;
  } else if (input.decision === "insurance_only") {
    companyAbsorb = deductible;
  } else if (input.decision === "split") {
    driverCharge = input.driver_charge_cents ?? 0;
    companyAbsorb = input.company_absorb_cents ?? 0;
    if (driverCharge + companyAbsorb !== netExposure) {
      throw new AccidentLiabilityError(
        "split_amounts_must_equal_net_exposure",
        `driver_charge_cents (${driverCharge}) + company_absorb_cents (${companyAbsorb}) must equal net_exposure_cents (${netExposure}) exactly.`
      );
    }
  } else {
    throw new AccidentLiabilityError("unknown_decision", `Unknown owner_decision: ${String(input.decision)}`);
  }

  let deductionId: string | null = null;
  if (driverCharge > 0) {
    if (!liab.driver_id) {
      throw new AccidentLiabilityError("no_driver_on_liability_for_chargeback", "This liability has no driver_id to charge.");
    }
    const dedRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.driver_settlement_deductions (
          operating_company_id, driver_id, deduction_type, amount_cents, reason, load_id,
          created_by_user_id, status
        )
        VALUES ($1::uuid, $2::uuid, 'accident_liability_chargeback', $3, $4, $5::uuid, $6::uuid, 'pending')
        RETURNING id
      `,
      [
        input.operating_company_id,
        liab.driver_id,
        driverCharge,
        `Accident liability chargeback — ${note}`,
        liab.load_id,
        input.decided_by_user_id,
      ]
    );
    deductionId = dedRes.rows[0]!.id;
  }

  let journalEntryId: string | null = null;
  let status: "decided" | "posted" = "decided";
  if (companyAbsorb > 0) {
    if (!liab.expense_account_id) {
      throw new AccidentLiabilityError("no_expense_account_on_liability", "This liability has no expense_account_id to post the company-absorbed amount to.");
    }
    const apAccountId = await resolveRoleAccount(client, input.operating_company_id, "ap_control");
    const je = await createJournalEntryOnClient(
      client,
      {
        operating_company_id: input.operating_company_id,
        entry_date: input.entry_date ?? new Date().toISOString().slice(0, 10),
        memo: `Accident liability ${input.decision} — ${note}`,
        source: "manual",
        postings: [
          { account_id: liab.expense_account_id, debit_or_credit: "debit", amount_cents: companyAbsorb },
          { account_id: apAccountId, debit_or_credit: "credit", amount_cents: companyAbsorb },
        ],
      },
      { userId: input.decided_by_user_id, role: "Owner" }
    );
    journalEntryId = je.id;
    status = "posted";
  }

  await client.query(
    `
      UPDATE safety.accident_liabilities
         SET owner_decision = $1,
             owner_decision_at = now(),
             owner_decision_by_user_id = $2::uuid,
             owner_decision_note = $3,
             driver_charge_cents = $4,
             company_absorb_cents = $5,
             deduction_id = $6::uuid,
             journal_entry_id = $7::uuid,
             status = $8,
             updated_at = now()
       WHERE id = $9::uuid
    `,
    [input.decision, input.decided_by_user_id, note, driverCharge, companyAbsorb, deductionId, journalEntryId, status, input.liability_id]
  );

  return {
    id: input.liability_id,
    decision: input.decision,
    driver_charge_cents: driverCharge,
    company_absorb_cents: companyAbsorb,
    deduction_id: deductionId,
    journal_entry_id: journalEntryId,
    status,
  };
}

type VoidInput = {
  operating_company_id: string;
  liability_id: string;
  voided_by_user_id: string;
  reason: string;
};

// Voiding a liability voids its deduction and reverses its entry. Neither is ever hard deleted.
// driver_settlement_deductions has no 'voided' status value (CHECK: pending|partial|applied|
// deferred) — a pending deduction is neutralized via the table's own existing hold mechanism
// (is_held=true) so the settlement engine never applies it, rather than inventing a new column or
// status value. An already-applied deduction cannot be voided this way (refuses — money already
// moved, that needs a real reversal on the settlement side, out of this function's scope).
export async function voidAccidentLiability(client: DbClient, input: VoidInput) {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new AccidentLiabilityError("void_reason_required");

  const liabRes = await client.query<{
    id: string;
    voided_at: string | null;
    deduction_id: string | null;
    journal_entry_id: string | null;
  }>(
    `
      SELECT id, voided_at, deduction_id, journal_entry_id
        FROM safety.accident_liabilities
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       FOR UPDATE
    `,
    [input.liability_id, input.operating_company_id]
  );
  const liab = liabRes.rows[0];
  if (!liab) throw new AccidentLiabilityError("accident_liability_not_found");
  if (liab.voided_at) throw new AccidentLiabilityError("accident_liability_already_voided");

  if (liab.deduction_id) {
    const dedRes = await client.query<{ status: string }>(
      `SELECT status FROM driver_finance.driver_settlement_deductions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [liab.deduction_id, input.operating_company_id]
    );
    const dedStatus = dedRes.rows[0]?.status;
    if (dedStatus === "applied") {
      throw new AccidentLiabilityError(
        "deduction_already_applied",
        "This liability's deduction has already been applied to a settlement — void the settlement side, not this liability."
      );
    }
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
           SET is_held = true,
               hold_reason = $1,
               updated_at = now()
         WHERE id = $2::uuid AND operating_company_id = $3::uuid
      `,
      [`Parent accident liability voided: ${reason}`, liab.deduction_id, input.operating_company_id]
    );
  }

  if (liab.journal_entry_id) {
    await reverseJournalEntryNoFlip(client, {
      operatingCompanyId: input.operating_company_id,
      journalEntryId: liab.journal_entry_id,
      reason: `Accident liability voided: ${reason}`,
      actorUserId: input.voided_by_user_id,
    });
  }

  await client.query(
    `
      UPDATE safety.accident_liabilities
         SET voided_at = now(),
             voided_by_user_id = $1::uuid,
             void_reason = $2,
             status = 'closed',
             updated_at = now()
       WHERE id = $3::uuid
    `,
    [input.voided_by_user_id, reason, input.liability_id]
  );

  return { id: input.liability_id, voided: true };
}
