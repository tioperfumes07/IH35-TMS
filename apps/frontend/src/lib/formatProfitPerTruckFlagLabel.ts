/**
 * LV-REPORTS-PROFIT-PER-TRUCK-RAW-FLAG-TOKENS — badge + filter copy must never
 * paint raw API tokens (most_profitable, underutilized, …). Raw values stay on
 * the wire / filter value= / sort keys.
 */
export const PROFIT_PER_TRUCK_FLAG_LABELS = {
  most_profitable: "Most profitable",
  least_profitable: "Least profitable",
  high_maintenance: "High maintenance",
  underutilized: "Underutilized",
} as const;

export type ProfitPerTruckFlagKey = keyof typeof PROFIT_PER_TRUCK_FLAG_LABELS;

export function formatProfitPerTruckFlagLabel(flag: unknown): string {
  const raw = String(flag ?? "").trim();
  if (!raw) return "Flag — not set";
  if (raw in PROFIT_PER_TRUCK_FLAG_LABELS) {
    return PROFIT_PER_TRUCK_FLAG_LABELS[raw as ProfitPerTruckFlagKey];
  }
  return "Flag — not set";
}
