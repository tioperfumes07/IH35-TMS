import type { BookLoadChargeLine } from "./accessorial-editor-lib";

/**
 * W6 — lumper "paid by broker" → auto-reimbursable customer-invoice line.
 *
 * When the carrier fronts a lumper that the BROKER reimburses, the carrier must bill it back on the
 * customer invoice. This module is the single source for that math: which paid-by values are
 * reimbursable, and the reimbursement charge line(s) derived from the stops. Pure + unit-tested so the
 * invoice total can't silently drift (Tier-2 money). Default rule: broker-paid is reimbursable; carrier/
 * customer/shipper/receiver/unknown are NOT (carrier-paid is the carrier's own cost, not a customer charge).
 */
export type StopLumperInput = {
  lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown" | null;
  lumper_amount_cents?: number | null;
};

export const LUMPER_REIMBURSEMENT_CODE = "lumper_reimbursement";

export function isLumperReimbursable(paidBy: StopLumperInput["lumper_paid_by"]): boolean {
  return paidBy === "broker";
}

export function lumperReimbursementChargeLines(stops: readonly StopLumperInput[] | undefined): BookLoadChargeLine[] {
  const lines: BookLoadChargeLine[] = [];
  for (const stop of stops ?? []) {
    const amount = Math.max(0, Number(stop?.lumper_amount_cents ?? 0));
    if (amount > 0 && isLumperReimbursable(stop?.lumper_paid_by)) {
      lines.push({ code: LUMPER_REIMBURSEMENT_CODE, amount_cents: amount });
    }
  }
  return lines;
}

export function sumLumperReimbursementCents(stops: readonly StopLumperInput[] | undefined): number {
  return lumperReimbursementChargeLines(stops).reduce((sum, line) => sum + line.amount_cents, 0);
}
