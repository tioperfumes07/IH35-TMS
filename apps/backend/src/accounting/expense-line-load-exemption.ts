/**
 * LEAD 443.105 #2 — every accounting.expense_lines row carries a load_id OR an explicit load_exemption_reason.
 *
 * Measured on prod 2026-10-12: of 865 live USMCA expense lines, exactly 5 had neither (EXP-2026-00001..00005,
 * bank-line categorizations of company overhead — BofA fees and an ED-HER PLASTICS purchase, $203.14). They were
 * not load costs; nothing on the line said so. A line with no load and no reason is indistinguishable from a load
 * cost someone forgot to link.
 *
 * ONE rule for every writer that can write a line with no load:
 *   - a load              -> no reason (the load IS the link);
 *   - a caller's reason   -> that reason, verbatim;
 *   - a load-REQUIRED line (G18 category / load_required) with neither -> NO reason: the DB trigger
 *     (accounting.enforce_load_fk_invariant) refuses it by name — a missing load is never silently exempted;
 *   - otherwise           -> a company-cost reason naming the account and the document that created the line.
 *
 * The derived reason satisfies the trigger's >= 20-char floor (E_LOAD_EXEMPTION_REASON_TOO_SHORT).
 */

export const LOAD_EXEMPTION_REASON_MIN_LENGTH = 20;

export type CompanyCostExemptionInput = {
  /** The account (or item) the line posts to, as the operator reads it, e.g. "6300 Bank Service Charges". */
  accountLabel?: string | null;
  /** The document / path that created the line, e.g. "bank line 2026-01-15", "check #1042", "WO-2026-0031". */
  context: string;
};

export function companyCostExemptionReason({ accountLabel, context }: CompanyCostExemptionInput): string {
  const account = accountLabel?.trim() ? accountLabel.trim() : "an expense account";
  const where = context.trim() ? context.trim() : "no source document";
  const reason = `Company cost — ${account} — not tied to a load (${where})`;
  // The template alone is longer than the floor; the guard is for a future template edit, never a silent short write.
  if (reason.length < LOAD_EXEMPTION_REASON_MIN_LENGTH) {
    throw new Error(`load_exemption_reason_too_short: derived reason "${reason}" is under ${LOAD_EXEMPTION_REASON_MIN_LENGTH} chars`);
  }
  return reason;
}

export type LineLoadExemptionInput = CompanyCostExemptionInput & {
  loadId?: string | null;
  /** A reason the operator / caller supplied. Wins when present. */
  reason?: string | null;
  /** True when the line's category requires a load (G18) or the writer sets load_required = true. */
  loadRequired?: boolean;
};

/** The load_exemption_reason to write for a line, or null (the line has a load, or must be refused for lacking one). */
export function resolveLineLoadExemption({ loadId, reason, loadRequired, accountLabel, context }: LineLoadExemptionInput): string | null {
  if (loadId) return null;
  if (reason && reason.trim()) return reason.trim();
  if (loadRequired) return null;
  return companyCostExemptionReason({ accountLabel, context });
}
