/**
 * ROUND 8.19 board 37 — Settlement Close "Net to driver".
 * Stored settlement.net_pay can be 0 while gross/earnings are live (uncomputed fallback FAIL).
 * Prefer stored when non-zero; otherwise compute from the same line buckets the Close Result uses.
 */
export function settlementCloseNetPay(args: {
  storedNet: number;
  gross: number;
  earnings: number;
  otherDeductionsTotal: number;
  escrowContribution: number;
  advanceRecovery: number;
  reimbursements: number;
}): number {
  const boardGross = Number(args.gross) || Number(args.earnings) || 0;
  const computed =
    boardGross -
    Math.abs(Number(args.otherDeductionsTotal) || 0) -
    Math.abs(Number(args.escrowContribution) || 0) -
    Math.abs(Number(args.advanceRecovery) || 0) +
    (Number(args.reimbursements) || 0);
  const stored = Number(args.storedNet) || 0;
  if (stored !== 0) return stored;
  return computed;
}
