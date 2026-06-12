/**
 * Settlement Approval Service (D1)
 * 
 * Manages the approval workflow:
 * - Needs review → Approved → Finalized
 * - Per-line approve/reject with audit trail
 * - Escrow running balance updates
 * - Cash advance reconciliation
 * - PDF generation gated by approval status
 */

import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = {
  query: <R = unknown>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ApprovalStatus = 'needs_review' | 'approved' | 'finalized';
export type LineApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface SettlementSummary {
  settlementId: string;
  driverId: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  approvalStatus: ApprovalStatus;
  
  // Financial summary (from real 5666)
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
  lineType: 'deduction' | 'additional_pay' | 'expense' | 'cash_advance' | 'escrow';
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
    gross_pay_cents: number;
    deductions_cents: number;
    net_due_cents: number;
    pending_count: number;
    total_count: number;
    escrow_balance_cents: number;
  }>(`
    SELECT 
      s.id,
      s.driver_id,
      d.full_name as driver_name,
      s.period_start,
      s.period_end,
      s.approval_status,
      s.approved_at,
      s.approved_by,
      s.finalized_at,
      s.pdf_generated_at,
      COALESCE(
        (SELECT SUM(amount_cents) FROM driver_finance.settlement_line_items 
         WHERE settlement_id = s.id AND line_type IN ('additional_pay') AND approval_status != 'rejected'),
        0
      ) as gross_pay_cents,
      COALESCE(
        (SELECT SUM(ABS(amount_cents)) FROM driver_finance.settlement_line_items 
         WHERE settlement_id = s.id AND line_type IN ('deduction', 'escrow') AND approval_status != 'rejected'),
        0
      ) as deductions_cents,
      COALESCE(
        (SELECT SUM(amount_cents) FROM driver_finance.settlement_line_items 
         WHERE settlement_id = s.id AND approval_status != 'rejected'),
        0
      ) as net_due_cents,
      (
        SELECT COUNT(*) FROM driver_finance.settlement_line_items 
        WHERE settlement_id = s.id AND approval_status = 'pending'
      ) as pending_count,
      (
        SELECT COUNT(*) FROM driver_finance.settlement_line_items 
        WHERE settlement_id = s.id
      ) as total_count,
      COALESCE(eb.current_balance_cents, 0) as escrow_balance_cents
    FROM driver_finance.settlements s
    JOIN mdata.drivers d ON d.id = s.driver_id
    LEFT JOIN driver_finance.escrow_balances eb ON eb.driver_id = s.driver_id AND eb.operating_company_id = s.operating_company_id
    WHERE s.id = $1 AND s.operating_company_id = $2
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
    grossPayCents: row.gross_pay_cents,
    deductionsPendingCents: row.deductions_cents,
    netDueCents: row.net_due_cents,
    linesToApprove: { pending: row.pending_count, total: row.total_count },
    escrowBalanceCents: row.escrow_balance_cents
  };
}

/**
 * Get line items for a settlement.
 */
export async function getSettlementLineItems(
  client: Queryable,
  settlementId: string
): Promise<SettlementLineItem[]> {
  const result = await client.query<{
    id: string;
    line_type: string;
    category: string;
    amount_cents: number;
    load_id: string | null;
    load_number: string | null;
    source_type: string;
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
      li.amount_cents,
      li.load_id,
      li.load_number,
      li.source_type,
      li.source_id,
      li.approval_status,
      li.driver_visible,
      li.disputed,
      li.dispute_reason,
      li.created_at
    FROM driver_finance.settlement_line_items li
    WHERE li.settlement_id = $1
    ORDER BY 
      CASE li.line_type 
        WHEN 'additional_pay' THEN 1 
        WHEN 'deduction' THEN 2 
        WHEN 'escrow' THEN 3 
        WHEN 'expense' THEN 4 
        ELSE 5 
      END,
      li.created_at DESC
  `, [settlementId]);
  
  return result.rows.map(row => ({
    id: row.id,
    lineType: row.line_type as SettlementLineItem['lineType'],
    category: row.category,
    amountCents: row.amount_cents,
    loadId: row.load_id || undefined,
    loadNumber: row.load_number || undefined,
    sourceType: row.source_type,
    sourceId: row.source_id || undefined,
    approvalStatus: row.approval_status,
    driverVisible: row.driver_visible,
    disputed: row.disputed,
    disputeReason: row.dispute_reason || undefined,
    createdAt: row.created_at
  }));
}

/**
 * Approve a settlement line item.
 */
export async function approveLineItem(
  client: Queryable,
  input: ApproveLineInput,
  operatingCompanyId: string
): Promise<void> {
  const result = await client.query<{ settlement_id: string; category: string; amount_cents: number }>(`
    UPDATE driver_finance.settlement_line_items
    SET 
      approval_status = 'approved',
      approved_at = now(),
      approved_by = $1
    WHERE id = $2 AND operating_company_id = $3 AND approval_status = 'pending'
    RETURNING settlement_id, category, amount_cents
  `, [input.approvedBy, input.lineItemId, operatingCompanyId]);
  
  if (result.rows.length === 0) {
    throw new Error('Line item not found or already processed');
  }
  
  const row = result.rows[0];
  
  // Log audit event
  await appendCrudAudit(
    client,
    input.approvedBy,
    'settlement_line_approved',
    {
      settlement_id: row.settlement_id,
      line_item_id: input.lineItemId,
      category: row.category,
      amount_cents: row.amount_cents,
      approved_by: input.approvedBy,
      approved_by_email: input.approvedByEmail
    },
    'info',
    'settlements.approval'
  );
  
  // If this is an escrow hold, update running balance
  if (row.category === 'escrow_for_claims' && row.amount_cents < 0) {
    await updateEscrowBalance(client, row.settlement_id, row.amount_cents, 'hold', input.lineItemId);
  }
}

/**
 * Reject a settlement line item.
 */
export async function rejectLineItem(
  client: Queryable,
  input: RejectLineInput,
  operatingCompanyId: string
): Promise<void> {
  const result = await client.query<{ settlement_id: string; category: string; amount_cents: number }>(`
    UPDATE driver_finance.settlement_line_items
    SET 
      approval_status = 'rejected',
      rejected_at = now(),
      rejected_by = $1,
      rejection_reason = $2
    WHERE id = $3 AND operating_company_id = $4 AND approval_status = 'pending'
    RETURNING settlement_id, category, amount_cents
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
      amount_cents: row.amount_cents,
      rejected_by: input.rejectedBy,
      rejected_by_email: input.rejectedByEmail,
      reason: input.reason
    },
    'warning',
    'settlements.approval'
  );
}

/**
 * Update escrow running balance.
 */
async function updateEscrowBalance(
  client: Queryable,
  settlementId: string,
  amountCents: number,
  transactionType: 'hold' | 'release',
  lineItemId: string
): Promise<void> {
  // Get driver from settlement
  const settlementResult = await client.query<{ driver_id: string; operating_company_id: string }>(`
    SELECT driver_id, operating_company_id FROM driver_finance.settlements WHERE id = $1
  `, [settlementId]);
  
  if (settlementResult.rows.length === 0) return;
  
  const { driver_id, operating_company_id } = settlementResult.rows[0];
  
  // Upsert escrow balance
  await client.query(`
    INSERT INTO driver_finance.escrow_balances (
      operating_company_id, driver_id, total_held_cents, current_balance_cents, last_settlement_id, last_updated_at
    ) VALUES ($1, $2, $3, $3, $4, now())
    ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET
      total_held_cents = driver_finance.escrow_balances.total_held_cents + EXCLUDED.total_held_cents,
      current_balance_cents = driver_finance.escrow_balances.current_balance_cents + EXCLUDED.current_balance_cents,
      last_settlement_id = EXCLUDED.last_settlement_id,
      last_updated_at = now()
  `, [operating_company_id, driver_id, Math.abs(amountCents), settlementId]);
  
  // Get the balance ID for ledger entry
  const balanceResult = await client.query<{ id: string; current_balance_cents: number }>(`
    SELECT id, current_balance_cents FROM driver_finance.escrow_balances 
    WHERE driver_id = $1 AND operating_company_id = $2
  `, [driver_id, operating_company_id]);
  
  if (balanceResult.rows.length > 0) {
    const balance = balanceResult.rows[0];
    
    // Record in ledger
    await client.query(`
      INSERT INTO driver_finance.escrow_ledger (
        operating_company_id, driver_id, escrow_balance_id, settlement_id, settlement_line_item_id,
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
}

/**
 * Check if all line items are approved (for PDF generation gating).
 */
export async function checkAllLinesApproved(
  client: Queryable,
  settlementId: string
): Promise<{ allApproved: boolean; pendingCount: number; rejectedCount: number }> {
  const result = await client.query<{ pending_count: number; rejected_count: number }>(`
    SELECT 
      COUNT(*) FILTER (WHERE approval_status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_count
    FROM driver_finance.settlement_line_items
    WHERE settlement_id = $1
  `, [settlementId]);
  
  const row = result.rows[0];
  return {
    allApproved: row.pending_count === 0 && row.rejected_count === 0,
    pendingCount: row.pending_count,
    rejectedCount: row.rejected_count
  };
}

/**
 * Mark settlement as approved (when all lines reviewed).
 */
export async function approveSettlement(
  client: Queryable,
  settlementId: string,
  approvedBy: string,
  operatingCompanyId: string
): Promise<void> {
  // Verify all lines are processed
  const check = await checkAllLinesApproved(client, settlementId);
  if (!check.allApproved) {
    throw new Error(`Cannot approve: ${check.pendingCount} lines pending, ${check.rejectedCount} lines rejected`);
  }
  
  await client.query(`
    UPDATE driver_finance.settlements
    SET 
      approval_status = 'approved',
      approved_at = now(),
      approved_by = $1
    WHERE id = $2 AND operating_company_id = $3
  `, [approvedBy, settlementId, operatingCompanyId]);
}

/**
 * Mark settlement as finalized (enables PDF generation).
 */
export async function finalizeSettlement(
  client: Queryable,
  settlementId: string,
  operatingCompanyId: string
): Promise<void> {
  // Must be approved first
  const result = await client.query<{ approval_status: ApprovalStatus }>(`
    UPDATE driver_finance.settlements
    SET 
      approval_status = 'finalized',
      finalized_at = now()
    WHERE id = $1 AND operating_company_id = $2 AND approval_status = 'approved'
    RETURNING approval_status
  `, [settlementId, operatingCompanyId]);
  
  if (result.rows.length === 0) {
    throw new Error('Settlement not found or not in approved status');
  }
}

/**
 * Record PDF generation (audit trail).
 */
export async function recordPdfGenerated(
  client: Queryable,
  settlementId: string,
  generatedBy: string,
  pdfType: 'driver' | 'company',
  operatingCompanyId: string
): Promise<void> {
  await client.query(`
    UPDATE driver_finance.settlements
    SET pdf_generated_at = now(), pdf_generated_by = $1
    WHERE id = $2 AND operating_company_id = $3
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
