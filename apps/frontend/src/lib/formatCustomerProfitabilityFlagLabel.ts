/**
 * LV-REPORTS-CUSTOMER-PROFITABILITY-RAW-FLAG-TOKENS — Flags badges must never
 * paint raw API tokens (high_margin, past_due, …). Raw values stay on the wire
 * / CSV export. Display copy only.
 */
export const CUSTOMER_PROFITABILITY_FLAG_LABELS = {
  high_margin: "High margin",
  low_margin: "Low margin",
  past_due: "Past due",
  declining_revenue: "Declining revenue",
} as const;

export type CustomerProfitabilityFlagKey = keyof typeof CUSTOMER_PROFITABILITY_FLAG_LABELS;

export function formatCustomerProfitabilityFlagLabel(flag: unknown): string {
  const raw = String(flag ?? "").trim();
  if (!raw) return "Flag — not set";
  if (raw in CUSTOMER_PROFITABILITY_FLAG_LABELS) {
    return CUSTOMER_PROFITABILITY_FLAG_LABELS[raw as CustomerProfitabilityFlagKey];
  }
  return "Flag — not set";
}
