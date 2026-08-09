/**
 * SETL-PICK-03 — single source for settlement dispute categories.
 * Matches driver_finance.driver_settlement_disputes CHECK
 * (dispute_category). Both SettlementDisputeModal and SettlementDetailPage
 * MUST import this — no divergent hardcoded enums.
 */
export const SETTLEMENT_DISPUTE_CATEGORY_OPTIONS = [
  { value: "missing_pay", label: "Missing pay" },
  { value: "wrong_deduction", label: "Wrong deduction" },
  { value: "miscalculated_mileage", label: "Miscalculated mileage" },
  { value: "wrong_rate", label: "Wrong rate" },
  { value: "detention_not_paid", label: "Detention not paid" },
  { value: "cash_advance_dispute", label: "Cash advance dispute" },
  { value: "fine_dispute", label: "Fine dispute" },
  { value: "escrow_dispute", label: "Escrow dispute" },
  { value: "other", label: "Other" },
] as const;

export type SettlementDisputeCategoryOption =
  (typeof SETTLEMENT_DISPUTE_CATEGORY_OPTIONS)[number]["value"];
