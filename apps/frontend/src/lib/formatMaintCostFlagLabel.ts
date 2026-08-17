/**
 * LV-REPORTS-MAINT-COST-RAW-FLAG-TOKENS — Flags badges must never paint raw API
 * tokens (high_cost, reliable, …). Raw values stay on the wire / CSV export.
 * Classification semantics (CC-1 contradictory-flags finding) are unchanged —
 * this is display copy only.
 */
export const MAINT_COST_FLAG_LABELS = {
  high_cost: "High cost",
  low_cost: "Low cost",
  inspection_due: "Inspection due",
  reliable: "Reliable",
} as const;

export type MaintCostFlagKey = keyof typeof MAINT_COST_FLAG_LABELS;

export function formatMaintCostFlagLabel(flag: unknown): string {
  const raw = String(flag ?? "").trim();
  if (!raw) return "Flag — not set";
  if (raw in MAINT_COST_FLAG_LABELS) {
    return MAINT_COST_FLAG_LABELS[raw as MaintCostFlagKey];
  }
  return "Flag — not set";
}
