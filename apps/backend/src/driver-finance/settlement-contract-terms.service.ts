// C6-MONEY-JE-EXEMPT: driver_finance.settlement_lines rows here are settlement-scoped LINE items
// (settlement_id FK), not independent cash movements — the settlement HEADER posts one aggregate
// balanced JE at finalize via driver-finance/settlement-payrun-close.service.ts's
// closeSettlementPayRun (INSERT INTO accounting.journal_entries via createJournalEntry) --
// CORRECTED 2026-09-02: postSettlementToGl (accounting/settlement-posting/settlement-posting
// .service.ts) was RETIRED (SET-01, 2026-07-26) and never live in prod. Same pattern this file's
// own header already documents: "flag OFF" / build-and-hold — no GL effect exists to post until
// the settlement is finalized.
//
// Settlement CONTRACT-TERMS computation engine — TIER-1 FINANCIAL, BUILD-AND-HOLD, flag OFF.
//
// Makes the canonical settlement engine (driver_finance.driver_settlements +
// driver_finance.driver_settlement_deductions) actually COMPUTE + ENFORCE the five money terms of the
// signed driver HIRE CONTRACT (Jorge LOCKED 2026-07-05):
//   1. MPG fuel-efficiency bonus  +$35 / settlement when trip MPG > 7.0  (a POSITIVE pay line).
//   2. Referral bonus             $200 to the REFERRER when a referred driver has worked >= 30 days.
//   3. Late-delivery pass-through  deduct what the CUSTOMER charged us back — only when DRIVER-FAULT.
//   4. All-fines pass-through      customs/police/DOT fines attributable to the driver -> a deduction.
//   5. Reimbursements             unpaid out-of-pocket toll/fuel claims ride the close as a pay-out line
//                                 (item 5's IMMEDIATE path lives in driver-reimbursement.service.ts).
//
// NO NEW GL MATH. Positive lines are written as settlement_lines('extra_pay'/'reimbursement') so the
// EXISTING settlement poster debits driver-pay / reimbursement expense and lifts net pay. Deductions are
// written into driver_settlement_deductions (the canonical bucketed ledger, load_id DIRECT) so the
// EXISTING net-floor applier (applyPendingDeductionsToSettlementWithNetFloor) applies them, net-floor
// capped, pay-first — reuse only. Every computed line also gets a driver_finance.settlement_contract_lines
// provenance row tying it to its source record + settlement + created line/deduction (Law of the Land §11,
// forward + reverse). Every write is IDEMPOTENT (unique provenance key / paid-stamps / fine link).
//
// Gated by SETTLEMENT_CONTRACT_TERMS_ENABLED (per-entity-only, default OFF). Runs inside the settlement
// close transaction, AFTER earnings/abandonment lines exist and BEFORE the net-floor applier +
// aggregateSettlementTotals — so bonuses raise gross first, and the new deductions are picked up by the
// existing applier.

import { appendCrudAudit } from "../audit/crud-audit.js";
import { createSettlementDeduction } from "./deductions.service.js";

export const SETTLEMENT_CONTRACT_TERMS_FLAG = "SETTLEMENT_CONTRACT_TERMS_ENABLED";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

const SOURCE_TAG = "SETTLEMENT-CONTRACT-TERMS";

// LEAD 443.236 (owner 10-22 10:41 AM CT: "no you do not add automatically. for the moment there is not bonus") — the automatic
// MPG / referral bonus is REMOVED: the engine never computes or adds a bonus line, and the bonus config is no longer read. A bonus
// exists only when a user adds the line by hand with the pay items "Driver Pay – Fuel Mileage Bonus" / "Driver Pay – Referral Bonus".

/**
 * Insert a provenance row (idempotent via uq_settlement_contract_lines_natural). Returns true when a NEW
 * row was inserted (so the caller only writes the settlement line/deduction ONCE).
 */
async function recordContractLine(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    settlementId: string;
    driverId: string;
    loadId?: string | null;
    lineKind: "late_delivery_passthrough" | "fine_passthrough" | "reimbursement";
    direction: "pay" | "deduction";
    amountCents: number;
    sourceTable?: string | null;
    sourceId?: string | null;
    referredDriverId?: string | null;
    settlementLineId?: string | null;
    deductionId?: string | null;
    computedBasis?: Record<string, unknown>;
    actorUserId: string;
  }
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.settlement_contract_lines (
        operating_company_id, settlement_id, driver_id, load_id, line_kind, direction,
        amount_cents, source_table, source_id, referred_driver_id, settlement_line_id, deduction_id,
        computed_basis, created_by_user_id
      )
      VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9::uuid,$10::uuid,$11::uuid,$12::uuid,$13::jsonb,$14::uuid)
      ON CONFLICT (settlement_id, line_kind, COALESCE(source_id, settlement_id)) DO NOTHING
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      input.settlementId,
      input.driverId,
      input.loadId ?? null,
      input.lineKind,
      input.direction,
      Math.max(0, Math.round(input.amountCents)),
      input.sourceTable ?? null,
      input.sourceId ?? null,
      input.referredDriverId ?? null,
      input.settlementLineId ?? null,
      input.deductionId ?? null,
      JSON.stringify(input.computedBasis ?? {}),
      input.actorUserId,
    ]
  );
  return res.rows[0]?.id ? String(res.rows[0].id) : null;
}

/** Update a provenance row's created settlement_line_id / deduction_id after the downstream write. */
async function backlinkContractLine(
  client: DbClient,
  operatingCompanyId: string,
  contractLineId: string,
  patch: { settlementLineId?: string | null; deductionId?: string | null }
): Promise<void> {
  await client.query(
    `
      UPDATE driver_finance.settlement_contract_lines
      SET settlement_line_id = COALESCE($2::uuid, settlement_line_id),
          deduction_id = COALESCE($3::uuid, deduction_id)
      WHERE id = $1::uuid AND operating_company_id = $4::uuid
    `,
    [contractLineId, patch.settlementLineId ?? null, patch.deductionId ?? null, operatingCompanyId]
  );
}

export type PassthroughResult = { appliedCount: number; appliedCents: number };

/**
 * ITEM 3 — Late-delivery pass-through deduction. For each of the settlement's loads where the customer
 * charged us back AND it was the DRIVER'S FAULT AND the amount > 0, create a canonical deduction
 * (deduction_type='late_delivery_passthrough', load_id DIRECT) equal to the customer chargeback amount.
 * Zero when NOT driver-fault (rows are skipped). Idempotent via the provenance unique key (source=load).
 */
export async function computeLateDeliveryPassthrough(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId: string }
): Promise<PassthroughResult> {
  const loadsRes = await client.query<{ id: string; load_number: string | null; amount_cents: string | number | null; reason: string | null }>(
    `
      SELECT DISTINCT l.id::text, l.load_number, l.customer_chargeback_amount_cents AS amount_cents, l.customer_chargeback_reason AS reason
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
      JOIN mdata.loads l ON l.id = db.load_id
      WHERE sl.settlement_id = $1::uuid
        AND sl.source_driver_bill_id IS NOT NULL
        AND l.operating_company_id = $2::uuid
        AND l.customer_chargeback_requested = true
        AND l.customer_chargeback_driver_fault = true
        AND COALESCE(l.customer_chargeback_amount_cents, 0) > 0
    `,
    [input.settlementId, input.operatingCompanyId]
  );

  const result: PassthroughResult = { appliedCount: 0, appliedCents: 0 };

  for (const load of loadsRes.rows) {
    const loadId = String(load.id);
    const amountCents = Math.round(Number(load.amount_cents ?? 0));
    if (amountCents <= 0) continue;

    // Idempotency ledger first (unique per settlement + kind + load).
    const contractLineId = await recordContractLine(client, {
      operatingCompanyId: input.operatingCompanyId,
      settlementId: input.settlementId,
      driverId: input.driverId,
      loadId,
      lineKind: "late_delivery_passthrough",
      direction: "deduction",
      amountCents,
      sourceTable: "mdata.loads",
      sourceId: loadId,
      computedBasis: { load_number: load.load_number, reason: load.reason },
      actorUserId: input.actorUserId,
    });
    if (!contractLineId) continue;

    const deduction = await createSettlementDeduction(client, {
      driverId: input.driverId,
      operatingCompanyId: input.operatingCompanyId,
      amountCents,
      reason: `Late-delivery pass-through — load ${load.load_number ?? loadId}${load.reason ? ` (${load.reason})` : ""}`,
      sourceType: "other",
      loadId,
      createdByUserId: input.actorUserId,
    });
    await backlinkContractLine(client, input.operatingCompanyId, contractLineId, { deductionId: deduction.id });

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  return result;
}

/**
 * ITEM 4 — All-fines pass-through deduction, from BOTH canonical fine tables (the contract makes the
 * driver responsible for external/regulatory fines AND may impose internal company fines):
 *   • Sub-source 1/2 — safety.civil_fines (EXTERNAL: customs / police / DOT). For each OPEN fine attributed
 *     to this driver (subject_type='driver', driver_settlement_deduction_id IS NULL), create a canonical
 *     deduction (load_id from related_load_id) and reverse-link fine -> deduction via
 *     driver_settlement_deduction_id (idempotent).
 *   • Sub-source 2/2 — safety.internal_fines (INTERNAL company fines: cleanliness / conduct / equipment).
 *     For each APPROVED internal fine not yet charged (driver_liability_id IS NULL), create a deduction
 *     (amount is numeric DOLLARS -> cents; load_id from related_load_id) and reverse-link by stamping
 *     driver_liability_id = deduction id + status='converted_to_liability' (idempotent).
 * Every produced line is driver -> load -> fine -> deduction, forward AND reverse. appliedCount/appliedCents
 * are the COMBINED totals across both sub-sources.
 */
export async function computeDriverFinePassthrough(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId: string }
): Promise<PassthroughResult> {
  const finesRes = await client.query<{
    id: string;
    amount_cents: string | number | null;
    violation_description: string | null;
    issued_by_authority: string | null;
    related_load_id: string | null;
  }>(
    `
      SELECT id::text, amount_cents, violation_description, issued_by_authority, related_load_id::text
      FROM safety.civil_fines
      WHERE operating_company_id = $1::uuid
        AND subject_type = 'driver'
        AND subject_driver_id = $2::uuid
        AND status = 'open'
        AND deactivated_at IS NULL
        AND driver_settlement_deduction_id IS NULL
        AND COALESCE(amount_cents, 0) > 0
      ORDER BY issued_date ASC, id ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  const result: PassthroughResult = { appliedCount: 0, appliedCents: 0 };

  for (const fine of finesRes.rows) {
    const fineId = String(fine.id);
    const amountCents = Math.round(Number(fine.amount_cents ?? 0));
    if (amountCents <= 0) continue;
    const loadId = fine.related_load_id ? String(fine.related_load_id) : null;

    const contractLineId = await recordContractLine(client, {
      operatingCompanyId: input.operatingCompanyId,
      settlementId: input.settlementId,
      driverId: input.driverId,
      loadId,
      lineKind: "fine_passthrough",
      direction: "deduction",
      amountCents,
      sourceTable: "safety.civil_fines",
      sourceId: fineId,
      computedBasis: { authority: fine.issued_by_authority, description: fine.violation_description },
      actorUserId: input.actorUserId,
    });
    if (!contractLineId) continue;

    const deduction = await createSettlementDeduction(client, {
      driverId: input.driverId,
      operatingCompanyId: input.operatingCompanyId,
      amountCents,
      reason: `Fine — ${fine.issued_by_authority ?? "authority"}: ${fine.violation_description ?? "violation"}`,
      sourceType: "other",
      loadId,
      createdByUserId: input.actorUserId,
    });
    await backlinkContractLine(client, input.operatingCompanyId, contractLineId, { deductionId: deduction.id });

    // Reverse link + idempotency: a fine that already produced a deduction is never charged again.
    await client.query(
      `
        UPDATE safety.civil_fines
        SET driver_settlement_deduction_id = $2::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $3::uuid AND driver_settlement_deduction_id IS NULL
      `,
      [fineId, deduction.id, input.operatingCompanyId]
    );

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  // ── Sub-source 2/2: INTERNAL company fines (contract: keep truck clean / conduct / equipment → internal
  //    company fines may apply). safety.internal_fines ALREADY EXISTS (migration 0050). Its `amount` is
  //    numeric DOLLARS (convert to cents). It has NO deactivated_at/updated_at columns — use voided_at and
  //    do not set updated_at. Idempotency + reverse link: an APPROVED internal fine that produces a
  //    deduction is stamped status='converted_to_liability' with driver_liability_id = the deduction id;
  //    driver_liability_id IS NULL is the not-yet-charged guard so it is never charged twice.
  const internalRes = await client.query<{
    id: string;
    amount: string | number | null;
    related_load_id: string | null;
    reason_name: string | null;
  }>(
    `
      SELECT f.id::text, f.amount, f.related_load_id::text, r.reason_name
      FROM safety.internal_fines f
      LEFT JOIN catalogs.internal_fine_reasons r ON r.id = f.reason_id
      WHERE f.operating_company_id = $1::uuid
        AND f.driver_id = $2::uuid
        AND f.status = 'approved'
        AND f.voided_at IS NULL
        AND f.driver_liability_id IS NULL
        AND COALESCE(f.amount, 0) > 0
      ORDER BY f.imposed_date ASC, f.id ASC
      FOR UPDATE OF f
    `,
    [input.operatingCompanyId, input.driverId]
  );

  for (const fine of internalRes.rows) {
    const fineId = String(fine.id);
    const amountCents = Math.round(Number(fine.amount ?? 0) * 100);
    if (amountCents <= 0) continue;
    const loadId = fine.related_load_id ? String(fine.related_load_id) : null;

    const contractLineId = await recordContractLine(client, {
      operatingCompanyId: input.operatingCompanyId,
      settlementId: input.settlementId,
      driverId: input.driverId,
      loadId,
      lineKind: "fine_passthrough",
      direction: "deduction",
      amountCents,
      sourceTable: "safety.internal_fines",
      sourceId: fineId,
      computedBasis: { fine_kind: "internal", reason: fine.reason_name },
      actorUserId: input.actorUserId,
    });
    if (!contractLineId) continue;

    const deduction = await createSettlementDeduction(client, {
      driverId: input.driverId,
      operatingCompanyId: input.operatingCompanyId,
      amountCents,
      reason: `Internal fine — ${fine.reason_name ?? "company policy"}`,
      sourceType: "other",
      loadId,
      createdByUserId: input.actorUserId,
    });
    await backlinkContractLine(client, input.operatingCompanyId, contractLineId, { deductionId: deduction.id });

    // Reverse link + idempotency: converting the internal fine into a driver liability (the settlement
    // deduction) stamps driver_liability_id and flips status so it can never be charged again. NOTE:
    // safety.internal_fines has NO updated_at column — do not set one here.
    await client.query(
      `
        UPDATE safety.internal_fines
        SET status = 'converted_to_liability', driver_liability_id = $2::uuid
        WHERE id = $1::uuid AND operating_company_id = $3::uuid AND driver_liability_id IS NULL
      `,
      [fineId, deduction.id, input.operatingCompanyId]
    );

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  return result;
}

export type SettlementReimbursementResult = { appliedCount: number; appliedCents: number };

/**
 * ITEM 5 (settlement path) — pull the driver's UNPAID, settlement-mode reimbursements onto this settlement
 * as reimbursement pay-out lines (the EXISTING poster posts reimbursements_total -> reimbursement_expense).
 * The IMMEDIATE path (pay now, no settlement) lives in driver-reimbursement.service.ts. Idempotent: a
 * reimbursement already applied to a settlement is skipped.
 */
export async function computeSettlementReimbursements(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId: string }
): Promise<SettlementReimbursementResult> {
  const reimbRes = await client.query<{ id: string; amount_cents: string | number; reason: string | null; load_id: string | null; reimbursement_type: string | null }>(
    `
      SELECT id::text, amount_cents, reason, load_id::text, reimbursement_type
      FROM driver_finance.driver_reimbursements
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND status = 'pending'
        AND pay_mode = 'settlement'
        AND applied_to_settlement_id IS NULL
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  const result: SettlementReimbursementResult = { appliedCount: 0, appliedCents: 0 };

  for (const r of reimbRes.rows) {
    const reimbId = String(r.id);
    const amountCents = Math.round(Number(r.amount_cents ?? 0));
    if (amountCents <= 0) continue;
    const loadId = r.load_id ? String(r.load_id) : null;

    const contractLineId = await recordContractLine(client, {
      operatingCompanyId: input.operatingCompanyId,
      settlementId: input.settlementId,
      driverId: input.driverId,
      loadId,
      lineKind: "reimbursement",
      direction: "pay",
      amountCents,
      sourceTable: "driver_finance.driver_reimbursements",
      sourceId: reimbId,
      computedBasis: { reimbursement_type: r.reimbursement_type },
      actorUserId: input.actorUserId,
    });
    if (!contractLineId) continue;

    const dollars = amountCents / 100;
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
        VALUES ($1::uuid, 'reimbursement', $2, $3)
        RETURNING id::text
      `,
      [input.settlementId, `Reimbursement — ${r.reimbursement_type ?? "expense"}${r.reason ? `: ${r.reason}` : ""}`.slice(0, 500), dollars]
    );
    const settlementLineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
    await backlinkContractLine(client, input.operatingCompanyId, contractLineId, { settlementLineId });

    await client.query(
      `
        UPDATE driver_finance.driver_reimbursements
        SET status = 'settled', applied_to_settlement_id = $2::uuid, settlement_line_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $4::uuid AND applied_to_settlement_id IS NULL
      `,
      [reimbId, input.settlementId, settlementLineId || null, input.operatingCompanyId]
    );

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  return result;
}

export type ContractTermsSummary = {
  lateDelivery: PassthroughResult;
  fines: PassthroughResult;
  reimbursements: SettlementReimbursementResult;
};

/**
 * Orchestrator — compute the hire-contract terms for a settlement (443.236: NO automatic bonus), in order:
 * new deductions (picked up by the net-floor applier that runs next) ->
 * reimbursement pay-out lines. Each step is idempotent. Emits one audit event summarizing the batch.
 *
 * Called from the load-bookended close (settlements-load-bookended.service.ts), flag-gated by
 * SETTLEMENT_CONTRACT_TERMS_ENABLED, AFTER earnings/abandonment and BEFORE the net-floor applier +
 * aggregateSettlementTotals.
 */
export async function computeSettlementContractTerms(
  client: DbClient,
  input: {
    settlementId: string;
    driverId: string;
    operatingCompanyId: string;
    actorUserId: string;
  }
): Promise<ContractTermsSummary> {
  const lateDelivery = await computeLateDeliveryPassthrough(client, {
    settlementId: input.settlementId,
    driverId: input.driverId,
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
  });
  const fines = await computeDriverFinePassthrough(client, {
    settlementId: input.settlementId,
    driverId: input.driverId,
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
  });
  const reimbursements = await computeSettlementReimbursements(client, {
    settlementId: input.settlementId,
    driverId: input.driverId,
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
  });

  await appendCrudAudit(
    client,
    input.actorUserId,
    "driver_finance.settlement.contract_terms_computed",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: input.settlementId,
      operating_company_id: input.operatingCompanyId,
      driver_id: input.driverId,
      late_delivery_count: lateDelivery.appliedCount,
      late_delivery_cents: lateDelivery.appliedCents,
      fine_count: fines.appliedCount,
      fine_cents: fines.appliedCents,
      reimbursement_count: reimbursements.appliedCount,
      reimbursement_cents: reimbursements.appliedCents,
    },
    "info",
    SOURCE_TAG
  );

  return { lateDelivery, fines, reimbursements };
}
