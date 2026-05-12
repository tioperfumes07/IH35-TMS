export type SettlementStatus = "draft" | "presettle" | "acked" | "locked" | "paid" | "held" | "cancelled";

export type EarningsLoad = {
  id: string;
  load_display_id: string;
  miles: number;
  gross_cents: number;
  status: SettlementStatus;
};

export type CycleEarnings = {
  cycle_id: string;
  period_start: string;
  period_end: string;
  preferred_language: "en" | "es";
  loads_completed: number;
  miles_driven: number;
  gross_cents: number;
  advances_cents: number;
  deductions_cents: number;
  escrow_cents: number;
  net_preview_cents: number;
  final_settlement_cents: number | null;
  settlement_terms: Record<string, { primary: string; secondary: string }>;
  loads: EarningsLoad[];
};
