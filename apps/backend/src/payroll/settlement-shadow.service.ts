// A3-3 (FEAT-SETTLEMENT-SHADOW-RUN): read-only / compute-only shadow comparison of the OLD blunt
// recovery vs the NEW capped-ledger recovery, per real settlement. NO writes — no settlement updates,
// no ledger updates, no GL posting. This is the evidence Jorge reviews before flipping the flag.

import { resolveSettlementMinNet } from "../driver-finance/settlement-deduction-cap.service.js";
import { computeCappedAdvanceRecovery, type PendingDeduction } from "./settlement-capped-recovery.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ShadowCategory = "agree" | "a_avoids_below_floor" | "b_recovers_leaked" | "c_unexplained";

/**
 * PURE. Classifies why the OLD (blunt) and NEW (capped) recoveries differ:
 *   - agree                : identical recovery, no difference.
 *   - a_avoids_below_floor  : NEW recovers LESS because OLD would have breached the net floor
 *                            (or gone negative). NEW correctly caps at the floor.
 *   - b_recovers_leaked     : NEW recovers MORE because the ledger carries advances the OLD
 *                            in-period-window sum leaked; NEW still respects the floor.
 *   - c_unexplained         : anything else — MUST be zero. Investigate.
 */
export function classifyRecoveryDifference(args: {
  grossCents: number;
  floorCents: number;
  oldRecoveryCents: number;
  newRecoveryCents: number;
}): ShadowCategory {
  const { grossCents, floorCents, oldRecoveryCents, newRecoveryCents } = args;
  if (oldRecoveryCents === newRecoveryCents) return "agree";
  const oldNet = grossCents - oldRecoveryCents;
  const newNet = grossCents - newRecoveryCents;
  if (newRecoveryCents < oldRecoveryCents && oldNet < floorCents) return "a_avoids_below_floor";
  if (newRecoveryCents > oldRecoveryCents && newNet >= floorCents) return "b_recovers_leaked";
  return "c_unexplained";
}

export type ShadowSettlementRow = {
  settlement_id: string;
  driver_id: string;
  gross_cents: number;
  floor_cents: number;
  old_recovery_cents: number;
  new_recovery_cents: number;
  old_net_cents: number;
  new_net_cents: number;
  category: ShadowCategory;
};

export type ShadowReport = {
  period: { start: string; end: string };
  summary: {
    compared: number;
    agree: number;
    a_avoids_below_floor: number;
    b_recovers_leaked: number;
    c_unexplained: number;
  };
  settlements: ShadowSettlementRow[];
};

function asCents(input: unknown): number {
  return Math.round(Number(input ?? 0));
}

/**
 * Read-only. For each settlement in the period, compute the OLD blunt recovery and the NEW capped
 * recovery and classify any difference. NO writes of any kind.
 */
export async function runSettlementShadow(
  client: DbClient,
  args: { operatingCompanyId: string; periodStart: string; periodEnd: string }
): Promise<ShadowReport> {
  const settlementsRes = await client.query<{ id: string; driver_id: string; gross_cents: string | number }>(
    `
      SELECT id::text, driver_id::text, gross_cents::bigint AS gross_cents
      FROM payroll.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND pay_period_start = $2::date
        AND pay_period_end = $3::date
      ORDER BY created_at ASC, id ASC
    `,
    [args.operatingCompanyId, args.periodStart, args.periodEnd]
  );

  const rows: ShadowSettlementRow[] = [];
  for (const s of settlementsRes.rows) {
    const grossCents = asCents(s.gross_cents);

    // OLD path — the legacy blunt in-period approved-advance sum.
    const oldRes = await client.query<{ deductions_cents: string | number | null }>(
      `
        SELECT COALESCE(SUM(requested_amount_cents), 0)::bigint AS deductions_cents
        FROM driver_finance.cash_advance_requests
        WHERE operating_company_id = $1::uuid
          AND driver_id = $2::uuid
          AND status = 'approved'
          AND reviewed_at::date BETWEEN $3::date AND $4::date
      `,
      [args.operatingCompanyId, s.driver_id, args.periodStart, args.periodEnd]
    );
    const oldRecoveryCents = Math.max(0, asCents(oldRes.rows[0]?.deductions_cents));

    // NEW path — the capped-ledger engine (cash_advance_repayment only; floor + partial-to-floor).
    const floor = await resolveSettlementMinNet(
      client as unknown as Parameters<typeof resolveSettlementMinNet>[0],
      s.driver_id,
      args.operatingCompanyId
    );
    const floorCents = Math.max(Math.round((grossCents * floor.pct) / 100), floor.cents);

    const pendingRes = await client.query<{
      id: string;
      amount_cents: string | number;
      remaining_balance_cents: string | number | null;
      deduction_type: string;
    }>(
      `
        SELECT id::text,
               amount_cents::bigint AS amount_cents,
               remaining_balance_cents::bigint AS remaining_balance_cents,
               deduction_type
        FROM driver_finance.driver_settlement_deductions
        WHERE operating_company_id = $1::uuid
          AND driver_id = $2::uuid
          AND deduction_type = 'cash_advance_repayment'
          AND applied_to_settlement_id IS NULL
          AND status IN ('pending', 'partial', 'deferred')
        ORDER BY created_at ASC, id ASC
      `,
      [args.operatingCompanyId, s.driver_id]
    );
    const pending: PendingDeduction[] = pendingRes.rows.map((r) => ({
      id: String(r.id),
      amount_cents: asCents(r.amount_cents),
      remaining_balance_cents: r.remaining_balance_cents == null ? null : asCents(r.remaining_balance_cents),
      deduction_type: r.deduction_type,
    }));
    const newRecoveryCents = computeCappedAdvanceRecovery({ grossCents, floorCents, pending }).totalRecoveredCents;

    rows.push({
      settlement_id: s.id,
      driver_id: s.driver_id,
      gross_cents: grossCents,
      floor_cents: floorCents,
      old_recovery_cents: oldRecoveryCents,
      new_recovery_cents: newRecoveryCents,
      old_net_cents: grossCents - oldRecoveryCents,
      new_net_cents: grossCents - newRecoveryCents,
      category: classifyRecoveryDifference({ grossCents, floorCents, oldRecoveryCents, newRecoveryCents }),
    });
  }

  const summary = {
    compared: rows.length,
    agree: rows.filter((r) => r.category === "agree").length,
    a_avoids_below_floor: rows.filter((r) => r.category === "a_avoids_below_floor").length,
    b_recovers_leaked: rows.filter((r) => r.category === "b_recovers_leaked").length,
    c_unexplained: rows.filter((r) => r.category === "c_unexplained").length,
  };

  return { period: { start: args.periodStart, end: args.periodEnd }, summary, settlements: rows };
}
