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

// Locked contract defaults (owner-EDITABLE per entity via settlement_contract_terms_config).
const DEFAULT_MPG_THRESHOLD = 7.0;
const DEFAULT_MPG_BONUS_CENTS = 3500;
const DEFAULT_REFERRAL_REWARD_CENTS = 20000;
const DEFAULT_REFERRAL_MIN_DAYS = 30;

export type ContractTermsConfig = {
  mpgThreshold: number;
  mpgBonusCents: number;
  referralRewardCents: number;
  referralMinDays: number;
};

// ── Pure boundary helpers (no DB) — the money-decision boundaries, unit-testable in every environment. ──

/**
 * Trip MPG from miles + gallons, with an owner override. Returns sourceAbsent=true when the real fuel/miles
 * source is missing (no gallons OR no miles) and no override is given — the caller then FAILS LOUD (audit,
 * no bonus) rather than treating it as 0 mpg (which would silently deny an earned bonus).
 */
export function computeMpg(
  miles: number,
  gallons: number,
  override?: number | null
): { mpg: number | null; sourceAbsent: boolean } {
  const ov = override != null && Number.isFinite(Number(override)) ? Number(override) : null;
  if (ov != null) return { mpg: ov, sourceAbsent: false };
  if (!(miles > 0) || !(gallons > 0)) return { mpg: null, sourceAbsent: true };
  return { mpg: miles / gallons, sourceAbsent: false };
}

/** MPG bonus qualifies only when STRICTLY greater than the threshold (exactly 7.0 => NO bonus). */
export function mpgBonusQualifies(mpg: number | null, threshold: number): boolean {
  if (mpg == null || !Number.isFinite(mpg)) return false;
  return mpg > threshold;
}

/**
 * Referral eligible when the referred driver has worked >= minDays as of `asOf` (boundary: 29 days => NO,
 * 30 days => YES). Date-only comparison (hire_date is a DATE) — full days elapsed.
 */
export function referralEligibleAsOf(hireDateISO: string | null, minDays: number, asOf: Date = new Date()): boolean {
  if (!hireDateISO) return false;
  const hire = new Date(`${hireDateISO.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(hire.getTime())) return false;
  const asOfUtc = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const daysElapsed = Math.floor((asOfUtc.getTime() - hire.getTime()) / (24 * 60 * 60 * 1000));
  return daysElapsed >= minDays;
}

/**
 * Resolve the per-entity contract-terms config, falling back to the locked contract defaults when no row
 * exists (so a fresh entity behaves per contract without a seed). Owner edits override per entity.
 */
export async function resolveContractTermsConfig(client: DbClient, operatingCompanyId: string): Promise<ContractTermsConfig> {
  const res = await client.query<{
    mpg_bonus_threshold: string | number | null;
    mpg_bonus_cents: string | number | null;
    referral_reward_cents: string | number | null;
    referral_min_days: string | number | null;
  }>(
    `
      SELECT mpg_bonus_threshold, mpg_bonus_cents, referral_reward_cents, referral_min_days
      FROM driver_finance.settlement_contract_terms_config
      WHERE operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const row = res.rows[0];
  return {
    mpgThreshold: row?.mpg_bonus_threshold != null ? Number(row.mpg_bonus_threshold) : DEFAULT_MPG_THRESHOLD,
    mpgBonusCents: row?.mpg_bonus_cents != null ? Math.round(Number(row.mpg_bonus_cents)) : DEFAULT_MPG_BONUS_CENTS,
    referralRewardCents:
      row?.referral_reward_cents != null ? Math.round(Number(row.referral_reward_cents)) : DEFAULT_REFERRAL_REWARD_CENTS,
    referralMinDays: row?.referral_min_days != null ? Math.round(Number(row.referral_min_days)) : DEFAULT_REFERRAL_MIN_DAYS,
  };
}

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
    lineKind: "mpg_bonus" | "referral_bonus" | "late_delivery_passthrough" | "fine_passthrough" | "reimbursement";
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
  contractLineId: string,
  patch: { settlementLineId?: string | null; deductionId?: string | null }
): Promise<void> {
  await client.query(
    `
      UPDATE driver_finance.settlement_contract_lines
      SET settlement_line_id = COALESCE($2::uuid, settlement_line_id),
          deduction_id = COALESCE($3::uuid, deduction_id)
      WHERE id = $1::uuid
    `,
    [contractLineId, patch.settlementLineId ?? null, patch.deductionId ?? null]
  );
}

export type MpgBonusResult =
  | { applied: true; mpg: number; miles: number; gallons: number; bonusCents: number; settlementLineId: string }
  | { applied: false; reason: "already_applied" | "mpg_source_absent" | "below_threshold"; mpg: number | null; miles: number; gallons: number };

/**
 * ITEM 1 — MPG fuel-efficiency bonus. Trip MPG = total loaded+empty miles of the settlement's loads /
 * total gallons purchased for those loads by this driver. Boundary: MPG must be STRICTLY > threshold
 * (exactly 7.0 => NO bonus). FAIL-LOUD, never silent-zero: if the MPG source is absent (no gallons or no
 * miles) and no override is passed, record an audit event and DO NOT pay — the owner supplies an
 * `mpgOverride` (owner-entered) to force the compute. Idempotent per settlement.
 */
export async function computeSettlementMpgBonus(
  client: DbClient,
  input: {
    settlementId: string;
    driverId: string;
    operatingCompanyId: string;
    actorUserId: string;
    config: ContractTermsConfig;
    /** Owner-entered override MPG (used when the fuel/miles source is absent — fail-loud, not zero). */
    mpgOverride?: number | null;
  }
): Promise<MpgBonusResult> {
  // Miles: sum driver_bills.miles_basis for the settlement's earnings-line source bills.
  const milesRes = await client.query<{ miles: string | number | null }>(
    `
      SELECT COALESCE(SUM(db.miles_basis), 0) AS miles
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
      WHERE sl.settlement_id = $1::uuid
        AND sl.source_driver_bill_id IS NOT NULL
        AND sl.line_type IN ('earnings', 'team_split_primary', 'team_split_secondary')
    `,
    [input.settlementId]
  );
  const miles = Math.max(0, Number(milesRes.rows[0]?.miles ?? 0));

  // Gallons: sum fuel_transactions.gallons for those loads, this driver, non-archived.
  const gallonsRes = await client.query<{ gallons: string | number | null }>(
    `
      SELECT COALESCE(SUM(ft.gallons), 0) AS gallons
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid
        AND ft.driver_id = $2::uuid
        AND ft.archived_at IS NULL
        AND ft.load_id IN (
          SELECT db.load_id
          FROM driver_finance.settlement_lines sl
          JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
          WHERE sl.settlement_id = $3::uuid
            AND sl.source_driver_bill_id IS NOT NULL
            AND db.load_id IS NOT NULL
        )
    `,
    [input.operatingCompanyId, input.driverId, input.settlementId]
  );
  const gallons = Math.max(0, Number(gallonsRes.rows[0]?.gallons ?? 0));

  const overrideMpg = input.mpgOverride != null && Number.isFinite(Number(input.mpgOverride)) ? Number(input.mpgOverride) : null;
  const { mpg, sourceAbsent } = computeMpg(miles, gallons, overrideMpg);

  if (sourceAbsent) {
    // FAIL LOUD — surface the missing source; do NOT treat as 0 MPG (that would silently deny a bonus).
    await appendCrudAudit(
      client,
      input.actorUserId,
      "driver_finance.settlement.mpg_source_absent",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: input.settlementId,
        operating_company_id: input.operatingCompanyId,
        driver_id: input.driverId,
        miles,
        gallons,
        note: "MPG bonus not computed — fuel/miles source absent; owner may supply an explicit MPG override.",
      },
      "warning",
      SOURCE_TAG
    );
    return { applied: false, reason: "mpg_source_absent", mpg: null, miles, gallons };
  }

  // Boundary: STRICTLY greater than threshold. Exactly 7.0 => no bonus.
  if (mpg == null || !mpgBonusQualifies(mpg, input.config.mpgThreshold)) {
    return { applied: false, reason: "below_threshold", mpg, miles, gallons };
  }

  // Idempotency ledger first (unique per settlement + kind).
  const contractLineId = await recordContractLine(client, {
    operatingCompanyId: input.operatingCompanyId,
    settlementId: input.settlementId,
    driverId: input.driverId,
    lineKind: "mpg_bonus",
    direction: "pay",
    amountCents: input.config.mpgBonusCents,
    sourceTable: "driver_finance.driver_settlements",
    sourceId: input.settlementId,
    computedBasis: { mpg, miles, gallons, threshold: input.config.mpgThreshold, override: overrideMpg != null },
    actorUserId: input.actorUserId,
  });
  if (!contractLineId) {
    return { applied: false, reason: "already_applied", mpg, miles, gallons };
  }

  const dollars = input.config.mpgBonusCents / 100;
  const lineRes = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
      VALUES ($1::uuid, 'extra_pay', $2, $3)
      RETURNING id::text
    `,
    [input.settlementId, `MPG fuel-efficiency bonus (${mpg.toFixed(2)} mpg)`, dollars]
  );
  const settlementLineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
  await backlinkContractLine(client, contractLineId, { settlementLineId });

  return { applied: true, mpg, miles, gallons, bonusCents: input.config.mpgBonusCents, settlementLineId };
}

export type ReferralBonusResult = { appliedCount: number; appliedCents: number; referredDriverIds: string[] };

/**
 * ITEM 2 — Referral bonus. Pays the REFERRER (the driver being settled) $200 for each referred driver who
 * has worked >= referralMinDays (boundary: 29 days => NO, 30 days => YES), is still active, and has not yet
 * generated the reward. Idempotent via the referred driver's referral_reward_paid_at stamp. The bonus line
 * references the REFERRED driver (provenance + description).
 */
export async function computeReferralBonuses(
  client: DbClient,
  input: {
    settlementId: string;
    referrerDriverId: string;
    operatingCompanyId: string;
    actorUserId: string;
    config: ContractTermsConfig;
  }
): Promise<ReferralBonusResult> {
  const referredRes = await client.query<{ id: string; first_name: string | null; last_name: string | null; hire_date: string | null }>(
    `
      SELECT d.id::text, d.first_name, d.last_name, d.hire_date::text
      FROM mdata.drivers d
      WHERE d.referred_by_driver_id = $1::uuid
        AND d.operating_company_id = $2::uuid
        AND d.referral_reward_paid_at IS NULL
        AND lower(d.status::text) = 'active'
        AND d.hire_date IS NOT NULL
        AND d.hire_date <= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))
      ORDER BY d.hire_date ASC, d.id ASC
      FOR UPDATE OF d
    `,
    [input.referrerDriverId, input.operatingCompanyId, input.config.referralMinDays]
  );

  const result: ReferralBonusResult = { appliedCount: 0, appliedCents: 0, referredDriverIds: [] };
  const dollars = input.config.referralRewardCents / 100;

  for (const referred of referredRes.rows) {
    const referredId = String(referred.id);
    // Defense-in-depth boundary re-check (the SQL already filters; this also guards a mocked/edge row):
    // 29 days => skip, 30 days => pay.
    if (!referralEligibleAsOf(referred.hire_date, input.config.referralMinDays)) continue;

    const contractLineId = await recordContractLine(client, {
      operatingCompanyId: input.operatingCompanyId,
      settlementId: input.settlementId,
      driverId: input.referrerDriverId,
      lineKind: "referral_bonus",
      direction: "pay",
      amountCents: input.config.referralRewardCents,
      sourceTable: "mdata.drivers",
      sourceId: referredId,
      referredDriverId: referredId,
      computedBasis: { referred_hire_date: referred.hire_date, min_days: input.config.referralMinDays },
      actorUserId: input.actorUserId,
    });
    if (!contractLineId) continue; // already recorded on this settlement

    const referredName = `${referred.first_name ?? ""} ${referred.last_name ?? ""}`.trim() || referredId;
    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
        VALUES ($1::uuid, 'extra_pay', $2, $3)
        RETURNING id::text
      `,
      [input.settlementId, `Referral bonus — ${referredName}`, dollars]
    );
    const settlementLineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
    await backlinkContractLine(client, contractLineId, { settlementLineId });

    // Idempotency stamp: pay this referral exactly once.
    await client.query(
      `
        UPDATE mdata.drivers
        SET referral_reward_paid_at = now(),
            referral_reward_settlement_id = $2::uuid
        WHERE id = $1::uuid AND referral_reward_paid_at IS NULL
      `,
      [referredId, input.settlementId]
    );

    result.appliedCount += 1;
    result.appliedCents += input.config.referralRewardCents;
    result.referredDriverIds.push(referredId);
  }

  return result;
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
    await backlinkContractLine(client, contractLineId, { deductionId: deduction.id });

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  return result;
}

/**
 * ITEM 4 — All-fines pass-through deduction. For each OPEN safety.fine attributable to this driver
 * (subject_type='driver') that has not yet produced a deduction, create a canonical deduction
 * (deduction_type='fine', load_id from the fine's related_load_id) and link the fine -> deduction (reverse
 * drill). Idempotent via the fine's driver_settlement_deduction_id link.
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
    await backlinkContractLine(client, contractLineId, { deductionId: deduction.id });

    // Reverse link + idempotency: a fine that already produced a deduction is never charged again.
    await client.query(
      `
        UPDATE safety.civil_fines
        SET driver_settlement_deduction_id = $2::uuid, updated_at = now()
        WHERE id = $1::uuid AND driver_settlement_deduction_id IS NULL
      `,
      [fineId, deduction.id]
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
    await backlinkContractLine(client, contractLineId, { settlementLineId });

    await client.query(
      `
        UPDATE driver_finance.driver_reimbursements
        SET status = 'settled', applied_to_settlement_id = $2::uuid, settlement_line_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND applied_to_settlement_id IS NULL
      `,
      [reimbId, input.settlementId, settlementLineId || null]
    );

    result.appliedCount += 1;
    result.appliedCents += amountCents;
  }

  return result;
}

export type ContractTermsSummary = {
  mpg: MpgBonusResult;
  referral: ReferralBonusResult;
  lateDelivery: PassthroughResult;
  fines: PassthroughResult;
  reimbursements: SettlementReimbursementResult;
};

/**
 * Orchestrator — compute ALL five hire-contract terms for a settlement, in order:
 * bonuses (raise gross) -> new deductions (picked up by the net-floor applier that runs next) ->
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
    mpgOverride?: number | null;
  }
): Promise<ContractTermsSummary> {
  const config = await resolveContractTermsConfig(client, input.operatingCompanyId);

  const mpg = await computeSettlementMpgBonus(client, {
    settlementId: input.settlementId,
    driverId: input.driverId,
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
    config,
    mpgOverride: input.mpgOverride ?? null,
  });
  const referral = await computeReferralBonuses(client, {
    settlementId: input.settlementId,
    referrerDriverId: input.driverId,
    operatingCompanyId: input.operatingCompanyId,
    actorUserId: input.actorUserId,
    config,
  });
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
      mpg_applied: mpg.applied,
      mpg_bonus_cents: mpg.applied ? mpg.bonusCents : 0,
      referral_count: referral.appliedCount,
      referral_cents: referral.appliedCents,
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

  return { mpg, referral, lateDelivery, fines, reimbursements };
}
