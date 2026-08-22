/**
 * Settlement Approval Service (D1) — P2.4a canonical repoint
 *
 * Manages the approval workflow:
 * - Needs review → Approved → Finalized
 * - Per-line approve/reject with audit trail
 * - Escrow running balance updates
 * - Cash advance reconciliation
 * - PDF generation gated by approval status
 *
 * CANONICAL WIRING (P2.4a, 2026-07-15): this service was written against the RETIRE tables
 * `settlement.settlement` (header) + `settlement.settlement_line` (lines). Per the LINKAGE LAW
 * (§10) the canonical settlement store is `driver_finance.*`:
 *   header = driver_finance.driver_settlements, lines = driver_finance.settlement_lines.
 * All reads/writes below are repointed to the canonical tables (verified against the prod Neon
 * branch br-fancy-credit-akjnd07a on 2026-07-15).
 *
 * ── UNIT CONVERSION (the 100× trap) ──────────────────────────────────────────────────────────
 * The RETIRE tables stored money as integer CENTS (`amount_cents`, `gross_pay_cents`, …). The
 * canonical tables store money as DOLLARS numeric(14,2):
 *   driver_finance.settlement_lines.amount            numeric(14,2)  (dollars)
 *   driver_finance.driver_settlements.gross_pay        numeric(14,2)  (dollars)
 *   driver_finance.driver_settlements.deductions_total numeric(14,2)  (dollars)
 *   driver_finance.driver_settlements.reimbursements_total numeric(14,2) (dollars)
 *   driver_finance.driver_settlements.net_pay          numeric(14,2)  (dollars)
 * This service's public contract stays in CENTS (grossPayCents, amountCents, …), so every money
 * READ multiplies by 100: `(amount * 100)::bigint AS amount_cents`. There are NO money WRITES here
 * (approve/reject/finalize only mutate status + timestamp columns; escrow amounts are derived from
 * the already-cents `(amount*100)` value), so there is no write-side rounding surface.
 * Escrow tables (driver_finance.escrow_balances / escrow_ledger) are natively CENTS — left as-is.
 */

import { appendCrudAudit } from "../audit/crud-audit.js";
import { recordEscrowPostingOnly } from "../accounting/escrow/service.js";

type Queryable = {
  query: <R = unknown>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// Header status (driver_finance.driver_settlements.approval_status — CHECK enforced by migration
// 202607450000: needs_review → approved → finalized).
export type ApprovalStatus = 'needs_review' | 'approved' | 'finalized';
// Per-line status (driver_finance.settlement_lines.approval_status).
export type LineApprovalStatus = 'pending' | 'approved' | 'rejected';

// Canonical driver_finance.settlement_lines.line_type values (verified on prod). GROSS =
// earnings/extra_pay/team_split_primary/team_split_secondary; DEDUCTIONS = deduction/escrow;
// REIMB = reimbursement. The union stays open-ended (string fallback) so a new canonical
// line_type never breaks the read.
export type SettlementLineType =
  | 'earnings'
  | 'extra_pay'
  | 'team_split_primary'
  | 'team_split_secondary'
  | 'deduction'
  | 'escrow'
  | 'reimbursement'
  | (string & {});

export interface SettlementSummary {
  settlementId: string;
  driverId: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  approvalStatus: ApprovalStatus;

  // Financial summary — read from the canonical header (dollars) and returned in CENTS.
  grossPayCents: number;
  deductionsPendingCents: number;
  netDueCents: number;
  linesToApprove: { pending: number; total: number };

  // Escrow
  escrowBalanceCents: number;

  // Status timestamps
  needsReviewAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  finalizedAt?: string;
  pdfGeneratedAt?: string;
}

export interface SettlementLineItem {
  id: string;
  lineType: SettlementLineType;
  category: string;
  amountCents: number;
  loadId?: string;
  loadNumber?: string;
  sourceType: string;
  sourceId?: string;
  approvalStatus: LineApprovalStatus;
  driverVisible: boolean;
  disputed: boolean;
  disputeReason?: string;
  createdAt: string;
}

export interface ApproveLineInput {
  lineItemId: string;
  approvedBy: string;
  approvedByEmail: string;
}

export interface RejectLineInput {
  lineItemId: string;
  rejectedBy: string;
  rejectedByEmail: string;
  reason: string;
}

/**
 * Get settlement summary with approval status and financials.
 * Money comes from the canonical header (driver_finance.driver_settlements) — dollars × 100 → cents.
 */
export async function getSettlementSummary(
  client: Queryable,
  settlementId: string,
  operatingCompanyId: string
): Promise<SettlementSummary | null> {
  const result = await client.query<{
    id: string;
    driver_id: string;
    driver_name: string;
    period_start: string;
    period_end: string;
    approval_status: ApprovalStatus;
    approved_at: string | null;
    approved_by: string | null;
    finalized_at: string | null;
    pdf_generated_at: string | null;
    gross_pay_cents: string;
    deductions_cents: string;
    net_due_cents: string;
    pending_count: string;
    total_count: string;
    escrow_balance_cents: number;
  }>(`
    SELECT
      s.id,
      s.driver_id,
      CONCAT_WS(' ', d.first_name, d.last_name) as driver_name,
      s.period_start,
      s.period_end,
      s.approval_status,
      s.approved_at,
      s.approved_by,
      s.finalized_at,
      s.pdf_generated_at,
      -- canonical header stores DOLLARS numeric(14,2); contract is CENTS → × 100
      (s.gross_pay * 100)::bigint            as gross_pay_cents,
      (s.deductions_total * 100)::bigint     as deductions_cents,
      (s.net_pay * 100)::bigint              as net_due_cents,
      (
        SELECT COUNT(*) FROM driver_finance.settlement_lines
        WHERE settlement_id = s.id AND approval_status = 'pending'
      ) as pending_count,
      (
        SELECT COUNT(*) FROM driver_finance.settlement_lines
        WHERE settlement_id = s.id
      ) as total_count,
      COALESCE(eb.current_balance_cents, 0) as escrow_balance_cents
    FROM driver_finance.driver_settlements s
    JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
    LEFT JOIN driver_finance.escrow_balances eb
      ON eb.driver_id = s.driver_id AND eb.operating_company_id = s.operating_company_id
    WHERE s.id = $1 AND s.operating_company_id = $2::uuid
  `, [settlementId, operatingCompanyId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    settlementId: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    approvalStatus: row.approval_status,
    approvedAt: row.approved_at || undefined,
    approvedBy: row.approved_by || undefined,
    finalizedAt: row.finalized_at || undefined,
    pdfGeneratedAt: row.pdf_generated_at || undefined,
    grossPayCents: Number(row.gross_pay_cents),
    deductionsPendingCents: Number(row.deductions_cents),
    netDueCents: Number(row.net_due_cents),
    linesToApprove: { pending: Number(row.pending_count), total: Number(row.total_count) },
    escrowBalanceCents: row.escrow_balance_cents
  };
}

/**
 * Get line items for a settlement (canonical driver_finance.settlement_lines).
 */
export async function getSettlementLineItems(
  client: Queryable,
  settlementId: string,
  operatingCompanyId: string
): Promise<SettlementLineItem[]> {
  const result = await client.query<{
    id: string;
    line_type: string;
    category: string | null;
    amount_cents: string;
    load_id: string | null;
    load_number: string | null;
    source_type: string | null;
    source_id: string | null;
    approval_status: LineApprovalStatus;
    driver_visible: boolean;
    disputed: boolean;
    dispute_reason: string | null;
    created_at: string;
  }>(`
    SELECT
      li.id,
      li.line_type,
      li.category,
      -- canonical amount is DOLLARS numeric(14,2); contract is CENTS → × 100 (sign preserved)
      (li.amount * 100)::bigint as amount_cents,
      li.load_id,
      l.load_number,
      li.source_type,
      li.source_id,
      li.approval_status,
      li.driver_visible,
      li.disputed,
      li.dispute_reason,
      li.created_at
    FROM driver_finance.settlement_lines li
    LEFT JOIN mdata.loads l ON l.id = li.load_id AND l.operating_company_id = li.operating_company_id
    -- IDOR scope (xe-fin): settlement_lines RLS is role-scoped, NOT entity-scoped, so bind the
    -- caller's operating company explicitly. approve/reject scope the same way.
    WHERE li.settlement_id = $1 AND li.operating_company_id = $2::uuid
    ORDER BY
      CASE li.line_type
        WHEN 'earnings' THEN 1
        WHEN 'extra_pay' THEN 1
        WHEN 'team_split_primary' THEN 1
        WHEN 'team_split_secondary' THEN 1
        WHEN 'deduction' THEN 2
        WHEN 'escrow' THEN 3
        WHEN 'reimbursement' THEN 4
        ELSE 5
      END,
      li.created_at DESC
  `, [settlementId, operatingCompanyId]);

  return result.rows.map(row => ({
    id: row.id,
    lineType: row.line_type as SettlementLineType,
    category: row.category ?? '',
    amountCents: Number(row.amount_cents),
    loadId: row.load_id || undefined,
    loadNumber: row.load_number || undefined,
    sourceType: row.source_type ?? '',
    sourceId: row.source_id || undefined,
    approvalStatus: row.approval_status,
    driverVisible: row.driver_visible,
    disputed: row.disputed,
    disputeReason: row.dispute_reason || undefined,
    createdAt: row.created_at
  }));
}

/**
 * Approve a settlement line item (canonical driver_finance.settlement_lines).
 */
export async function approveLineItem(
  client: Queryable,
  input: ApproveLineInput,
  operatingCompanyId: string
): Promise<void> {
  const result = await client.query<{ settlement_id: string; category: string | null; amount_cents: string }>(`
    UPDATE driver_finance.settlement_lines
    SET
      approval_status = 'approved',
      approved_at = now(),
      approved_by = $1
    WHERE id = $2 AND operating_company_id = $3::uuid AND approval_status = 'pending'
    RETURNING settlement_id, category, (amount * 100)::bigint as amount_cents
  `, [input.approvedBy, input.lineItemId, operatingCompanyId]);

  if (result.rows.length === 0) {
    throw new Error('Line item not found or already processed');
  }

  const row = result.rows[0];
  const amountCents = Number(row.amount_cents);

  // Log audit event
  await appendCrudAudit(
    client,
    input.approvedBy,
    'settlement_line_approved',
    {
      settlement_id: row.settlement_id,
      line_item_id: input.lineItemId,
      category: row.category,
      amount_cents: amountCents,
      approved_by: input.approvedBy,
      approved_by_email: input.approvedByEmail
    },
    'info',
    'settlements.approval'
  );

  // If this is an escrow hold, update running balance
  if (row.category === 'escrow_for_claims' && amountCents < 0) {
    await updateEscrowBalance(client, row.settlement_id, amountCents, 'hold', input.lineItemId, input.approvedBy, operatingCompanyId);
  }
}

/**
 * Reject a settlement line item (canonical driver_finance.settlement_lines).
 */
export async function rejectLineItem(
  client: Queryable,
  input: RejectLineInput,
  operatingCompanyId: string
): Promise<void> {
  const result = await client.query<{ settlement_id: string; category: string | null; amount_cents: string }>(`
    UPDATE driver_finance.settlement_lines
    SET
      approval_status = 'rejected',
      rejected_at = now(),
      rejected_by = $1,
      rejection_reason = $2
    WHERE id = $3 AND operating_company_id = $4::uuid AND approval_status = 'pending'
    RETURNING settlement_id, category, (amount * 100)::bigint as amount_cents
  `, [input.rejectedBy, input.reason, input.lineItemId, operatingCompanyId]);

  if (result.rows.length === 0) {
    throw new Error('Line item not found or already processed');
  }

  const row = result.rows[0];

  // Log audit event
  await appendCrudAudit(
    client,
    input.rejectedBy,
    'settlement_line_rejected',
    {
      settlement_id: row.settlement_id,
      line_item_id: input.lineItemId,
      category: row.category,
      amount_cents: Number(row.amount_cents),
      rejected_by: input.rejectedBy,
      rejected_by_email: input.rejectedByEmail,
      reason: input.reason
    },
    'warning',
    'settlements.approval'
  );
}

/**
 * Update escrow running balance (driver_finance.escrow_balances / escrow_ledger — natively CENTS).
 *
 * ACCT-R-01 (0007-pattern-5 escrow split-brain finding): also syncs accounting.escrow_accounts.balance_cents
 * — the GL-linked liability balance driver-finance/escrow-separation.service.ts's
 * releaseDriverEscrowSeparation() reads as authoritative — via recordEscrowPostingOnly (appends an
 * accounting.escrow_postings row; the existing DB trigger applies the delta, NO new GL math/JE). This
 * path posts no JE of its own (see file header), so linked_journal_entry_id is null. failSoft=true: this
 * legacy D1 per-line approval flow can run for a driver whose accounting.escrow_accounts bridge is not
 * yet provisioned — skip the sync rather than block the line approval (never silently duplicate a write,
 * but also never hard-fail an approval on a missing bridge outside this flow's control).
 */
async function updateEscrowBalance(
  client: Queryable,
  settlementId: string,
  amountCents: number,
  transactionType: 'hold' | 'release',
  lineItemId: string,
  approvedByUserId: string,
  operatingCompanyId: string
): Promise<void> {
  // Get driver from the canonical settlement header.
  // ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): id alone does not verify the settlement belongs to
  // the caller's own company -- operatingCompanyId is already known at every call site (the caller
  // just approved a line item scoped to it), so this now verifies rather than blindly trusting id.
  const settlementResult = await client.query<{ driver_id: string; operating_company_id: string }>(`
    SELECT driver_id, operating_company_id FROM driver_finance.driver_settlements
    WHERE id = $1 AND operating_company_id = $2::uuid
  `, [settlementId, operatingCompanyId]);

  if (settlementResult.rows.length === 0) return;

  const { driver_id, operating_company_id } = settlementResult.rows[0];

  // Direction-aware deltas. A 'hold' moves money INTO escrow: total_held += amt, balance += amt.
  // A 'release' pays money BACK OUT: total_released += amt, balance -= amt (never add to held/balance
  // on a release — that would double-count the driver's escrow). amountCents may arrive signed; the
  // magnitude drives the ledger.
  const amt = Math.abs(amountCents);
  const heldDelta = transactionType === 'hold' ? amt : 0;
  const releasedDelta = transactionType === 'release' ? amt : 0;
  const balanceDelta = transactionType === 'hold' ? amt : -amt;

  // Upsert escrow balance
  await client.query(`
    INSERT INTO driver_finance.escrow_balances (
      operating_company_id, driver_id, total_held_cents, total_released_cents, current_balance_cents,
      last_settlement_id, last_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET
      total_held_cents = driver_finance.escrow_balances.total_held_cents + EXCLUDED.total_held_cents,
      total_released_cents = driver_finance.escrow_balances.total_released_cents + EXCLUDED.total_released_cents,
      current_balance_cents = driver_finance.escrow_balances.current_balance_cents + EXCLUDED.current_balance_cents,
      last_settlement_id = EXCLUDED.last_settlement_id,
      last_updated_at = now()
  `, [operating_company_id, driver_id, heldDelta, releasedDelta, balanceDelta, settlementId]);

  // Get the balance ID for ledger entry
  const balanceResult = await client.query<{ id: string; current_balance_cents: number }>(`
    SELECT id, current_balance_cents FROM driver_finance.escrow_balances
    WHERE driver_id = $1 AND operating_company_id = $2::uuid
  `, [driver_id, operating_company_id]);

  if (balanceResult.rows.length > 0) {
    const balance = balanceResult.rows[0];

    // Record in ledger
    await client.query(`
      INSERT INTO driver_finance.escrow_ledger (
        operating_company_id, driver_id, escrow_balance_id, settlement_id, settlement_line_id,
        transaction_type, amount_cents, running_balance_cents, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      operating_company_id,
      driver_id,
      balance.id,
      settlementId,
      lineItemId,
      transactionType,
      Math.abs(amountCents),
      balance.current_balance_cents,
      `Escrow ${transactionType} from settlement line item`
    ]);
  }

  await recordEscrowPostingOnly(
    client,
    {
      operating_company_id,
      driver_id,
      posting_type: transactionType === 'hold' ? 'deposit' : 'release',
      amount_cents: amt,
      source_type: 'driver_settlement',
      source_id: lineItemId,
      note: `Escrow ${transactionType} from settlement line item (settlement ${settlementId})`,
      posted_by_user_id: approvedByUserId,
      linked_journal_entry_id: null,
    },
    { failSoft: true }
  );
}

/**
 * Check if all line items are approved (for PDF generation gating).
 */
export async function checkAllLinesApproved(
  client: Queryable,
  settlementId: string,
  operatingCompanyId: string
): Promise<{ allApproved: boolean; pendingCount: number; rejectedCount: number }> {
  // Bind the caller's entity scope — settlement_lines RLS is role-scoped, NOT entity-scoped, so a
  // settlement_id alone would let a foreign settlement gate on another company's line counts. Matches
  // the explicit operating_company_id binding every other read/write in this file uses.
  const result = await client.query<{ pending_count: string; rejected_count: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE approval_status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_count
    FROM driver_finance.settlement_lines
    WHERE settlement_id = $1 AND operating_company_id = $2::uuid
  `, [settlementId, operatingCompanyId]);

  const row = result.rows[0];
  const pendingCount = Number(row.pending_count);
  const rejectedCount = Number(row.rejected_count);
  return {
    allApproved: pendingCount === 0 && rejectedCount === 0,
    pendingCount,
    rejectedCount
  };
}

/**
 * Mark settlement as approved (when all lines reviewed) — canonical header.
 */
export async function approveSettlement(
  client: Queryable,
  settlementId: string,
  approvedBy: string,
  operatingCompanyId: string
): Promise<void> {
  // Verify all lines are processed
  const check = await checkAllLinesApproved(client, settlementId, operatingCompanyId);
  if (!check.allApproved) {
    throw new Error(`Cannot approve: ${check.pendingCount} lines pending, ${check.rejectedCount} lines rejected`);
  }

  await client.query(`
    UPDATE driver_finance.driver_settlements
    SET
      approval_status = 'approved',
      approved_at = now(),
      approved_by = $1
    WHERE id = $2 AND operating_company_id = $3::uuid
  `, [approvedBy, settlementId, operatingCompanyId]);
}

/**
 * Mark settlement as finalized (enables PDF generation) — canonical header.
 * Phase-1c CHECK allows 'finalized'.
 */
export async function finalizeSettlement(
  client: Queryable,
  settlementId: string,
  operatingCompanyId: string
): Promise<void> {
  // Must be approved first
  const result = await client.query<{ approval_status: ApprovalStatus }>(`
    UPDATE driver_finance.driver_settlements
    SET
      approval_status = 'finalized',
      finalized_at = now()
    WHERE id = $1 AND operating_company_id = $2::uuid AND approval_status = 'approved'
    RETURNING approval_status
  `, [settlementId, operatingCompanyId]);

  if (result.rows.length === 0) {
    throw new Error('Settlement not found or not in approved status');
  }
}

/**
 * Record PDF generation (audit trail) — canonical header.
 */
export async function recordPdfGenerated(
  client: Queryable,
  settlementId: string,
  generatedBy: string,
  pdfType: 'driver' | 'company',
  operatingCompanyId: string
): Promise<void> {
  await client.query(`
    UPDATE driver_finance.driver_settlements
    SET pdf_generated_at = now(), pdf_generated_by = $1
    WHERE id = $2 AND operating_company_id = $3::uuid
  `, [generatedBy, settlementId, operatingCompanyId]);

  // Log audit event
  await appendCrudAudit(
    client,
    generatedBy,
    'settlement_pdf_generated',
    {
      settlement_id: settlementId,
      pdf_type: pdfType,
      generated_by: generatedBy
    },
    'info',
    'settlements.pdf'
  );
}
