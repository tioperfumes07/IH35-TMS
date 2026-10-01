/**
 * E-19..E-22 Fuel Integrity tab — per-transaction GPS verdict (E-22), fraud classification
 * (E-21), and derived pump time / IFTA state (E-19/E-20). Both endpoints are read-only (computed
 * on read, write nothing) — see apps/backend/src/fuel/fuel-integrity-verdicts.service.ts,
 * fuel-gps-verdict.service.ts, fuel-time-derivation.service.ts.
 */
import { apiRequest } from "./client";

export type FuelPurchaseIneligibleReason =
  | "not_motor_fuel"
  | "no_gallons"
  | "shared_import_timestamp"
  | "date_only_precision"
  | "voided";

export type FraudClassification = "finding" | "suspicion" | "none" | "not_evaluated";

export type CardRowVerdict = {
  fuel_transaction_id: string;
  transaction_at: string;
  fuel_type: string | null;
  gallons: number | null;
  total_cost_cents: number | null;
  unit_number: string | null;
  is_purchase: boolean;
  not_purchase_reason: FuelPurchaseIneligibleReason | null;
  date_only: boolean;
  fraud_classification: FraudClassification;
  suspicion_count: number;
  rules_matched: string[];
  rules_refused_date_only: string[];
  why: string;
};

export type GpsVerdict = "match" | "held" | "proposal" | "unverifiable" | "no_candidate";

export type GpsCandidate = { unit_id: string; unit_number: string | null; metres: number; at: string };

export type RelayFillGpsVerdict = {
  relay_fuel_transaction_id: string;
  transaction_id: string;
  pump_time: string;
  station: string;
  gallons: number | null;
  card_unit_id: string | null;
  card_unit_number: string | null;
  candidates: GpsCandidate[];
  verdict: GpsVerdict;
  why: string;
};

export type FuelIntegrityVerdicts = {
  period_start: string;
  period_end: string;
  card_rows: CardRowVerdict[];
  relay_fills: RelayFillGpsVerdict[];
  summary: Record<string, number>;
};

export type FuelTimeDerivation = {
  fuel_transaction_id: string;
  local_date: string;
  unit_id: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  transaction_at_derived: string | null;
  state_derived: string | null;
  derived_from_kind: "unit_stop_event" | "vehicle_locations_dwell" | null;
  derived_from_ref: string | null;
  geofence_id: string | null;
  confidence: "high" | "medium" | null;
  reason: string;
};

export type FuelTimeDerivations = {
  rows: FuelTimeDerivation[];
  summary: { date_only_rows: number; with_time: number; with_state: number; none: number };
  stop_source: string;
};

type PeriodOpts = { periodStart?: string; periodEnd?: string };

function companyQuery(companyId: string, opts?: PeriodOpts) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (opts?.periodStart) params.set("period_start", opts.periodStart);
  if (opts?.periodEnd) params.set("period_end", opts.periodEnd);
  return params.toString();
}

export function getFuelIntegrityVerdicts(companyId: string, opts?: PeriodOpts) {
  return apiRequest<FuelIntegrityVerdicts>(
    `/api/v1/fuel/integrity-verdicts?${companyQuery(companyId, opts)}`
  );
}

export function getFuelTimeDerivations(companyId: string, opts?: PeriodOpts) {
  return apiRequest<FuelTimeDerivations>(
    `/api/v1/fuel/time-derivations?${companyQuery(companyId, opts)}`
  );
}

/** Humanize a dynamic summary key ("card_not_evaluated" -> "Card not evaluated"). */
export function humanizeSummaryKey(key: string): string {
  const words = key.split("_");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export function fraudClassificationLabel(value: FraudClassification): string {
  switch (value) {
    case "finding":
      return "Finding";
    case "suspicion":
      return "Suspicion";
    case "not_evaluated":
      return "Not evaluated";
    case "none":
    default:
      return "None";
  }
}

export function gpsVerdictLabel(value: GpsVerdict): string {
  switch (value) {
    case "match":
      return "Match";
    case "held":
      return "Held";
    case "proposal":
      return "Proposal";
    case "unverifiable":
      return "Unverifiable";
    case "no_candidate":
    default:
      return "No candidate";
  }
}

export function notPurchaseReasonLabel(reason: FuelPurchaseIneligibleReason | null): string {
  if (!reason) return "—";
  return humanizeSummaryKey(reason);
}
