// A3-2 (FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL): the net-floor-capped, partial-to-floor
// advance-recovery engine for driver settlements.
//
// PURE — no DB, no side effects. This is the single source of recovery math, fully unit-tested
// (the 6 locked tests). The caller resolves gross + floor (via resolveSettlementMinNet) and the
// ordered pending ledger rows, then applies this plan inside the settlement transaction.
//
// Guarantees (proven by the locked tests):
//   - never drives net pay negative  (net = gross - recovered >= gross - cap >= 0)
//   - respects the net floor by default (cap = gross - floor unless an owner override is set)
//   - partial-to-floor: recovers exactly the room available, carries the remainder
//   - carry-forward: a deduction with no room is deferred untouched
//   - double-recovery-impossible: a fully-recovered row (remaining <= 0) is skipped
//   - books-reconcile: Σ(remaining after) = Σ(remaining before) − totalRecovered, and the
//     QBO-149 draw-down on posting == totalRecovered, so Σ remaining per driver == QBO-149 outstanding.

export type PendingDeduction = {
  id: string;
  /** Original deduction amount in cents (> 0). */
  amount_cents: number;
  /** Outstanding balance. NULL => full amount still owed (A3-1 gap-window lock). */
  remaining_balance_cents: number | null;
  deduction_type?: string | null;
  reason?: string | null;
};

export type RecoveryAllocation = {
  deduction_id: string;
  deduction_type: string | null;
  /** Amount recovered this settlement (> 0). Drives the advance_recovery line + GL credit. */
  recovered_cents: number;
  remaining_before_cents: number;
  /** Outstanding after this recovery (>= 0). Caller writes back to remaining_balance_cents. */
  new_remaining_cents: number;
  new_status: "applied" | "partial";
  /** When true the deduction is fully recovered => caller stamps applied_to_settlement_id. */
  fully_applied: boolean;
};

export type DeferredDeduction = {
  deduction_id: string;
  /** Unchanged remaining; carried forward to the next settlement (status -> 'deferred'). */
  remaining_cents: number;
};

export type CappedRecoveryPlan = {
  grossCents: number;
  floorCents: number;
  /** gross - floor (>= 0): the default recovery room. */
  availableCents: number;
  /** The recovery ceiling actually applied (after any owner override / target). */
  capCents: number;
  totalRecoveredCents: number;
  /** gross - totalRecovered. ALWAYS >= 0 (never a negative paycheck). */
  netAfterRecoveryCents: number;
  allocations: RecoveryAllocation[];
  deferred: DeferredDeduction[];
};

export type CappedRecoveryInput = {
  grossCents: number;
  floorCents: number;
  /** Pending/partial ledger rows, already ordered created_at ASC by the caller. */
  pending: PendingDeduction[];
  /**
   * Optional owner/admin override (decision #8). Persistence + authorization + audit are the
   * caller's responsibility (reported separately — may need DDL). The engine only applies the math.
   */
  targetRecoverCents?: number;
  /** Owner override: permit recovering below the net floor (but NEVER below net 0). */
  allowBelowFloor?: boolean;
};

function intc(n: unknown): number {
  return Math.max(0, Math.round(Number(n) || 0));
}

function remainingOf(d: PendingDeduction): number {
  // A3-1 gap-window lock: NULL means the column was never initialised => full amount still owed.
  return d.remaining_balance_cents == null ? intc(d.amount_cents) : intc(d.remaining_balance_cents);
}

export function computeCappedAdvanceRecovery(input: CappedRecoveryInput): CappedRecoveryPlan {
  const grossCents = intc(input.grossCents);
  const floorCents = Math.min(intc(input.floorCents), grossCents); // a floor can't exceed gross
  const availableCents = Math.max(0, grossCents - floorCents);

  // Ceiling: default = recover down to the floor. Owner override may go down to net 0 (gross),
  // never below 0. An explicit target further caps it.
  let capCents = input.allowBelowFloor ? grossCents : availableCents;
  if (input.targetRecoverCents != null) {
    capCents = Math.min(capCents, intc(input.targetRecoverCents));
  }

  let recoveredSoFar = 0;
  const allocations: RecoveryAllocation[] = [];
  const deferred: DeferredDeduction[] = [];

  for (const d of input.pending) {
    const remainingBefore = remainingOf(d);
    if (remainingBefore <= 0) continue; // already fully recovered — double-recovery guard

    const room = capCents - recoveredSoFar;
    if (room <= 0) {
      // No room left under the cap => carry the whole remainder forward, untouched.
      deferred.push({ deduction_id: d.id, remaining_cents: remainingBefore });
      continue;
    }

    const recoverable = Math.min(remainingBefore, room);
    const newRemaining = remainingBefore - recoverable;
    allocations.push({
      deduction_id: d.id,
      deduction_type: d.deduction_type ?? null,
      recovered_cents: recoverable,
      remaining_before_cents: remainingBefore,
      new_remaining_cents: newRemaining,
      new_status: newRemaining === 0 ? "applied" : "partial",
      fully_applied: newRemaining === 0,
    });
    recoveredSoFar += recoverable;
  }

  return {
    grossCents,
    floorCents,
    availableCents,
    capCents,
    totalRecoveredCents: recoveredSoFar,
    netAfterRecoveryCents: grossCents - recoveredSoFar,
    allocations,
    deferred,
  };
}
