/**
 * loadProfit.ts — pure client-side helpers for load/trip profitability.
 *
 * Lane A imports `NetProfitBadgeProps` + `netProfitBadge` to render the
 * delivered-card badge without touching this module.
 *
 * Lane B (Block 9) owns this file.
 */

import { apiRequest } from "../api/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LoadProfitabilitySnapshot = {
  load_id: string;
  load_number: string | null;
  customer_name: string | null;
  status: string;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  insurance_alloc_cents: number;
  factoring_fee_cents: number;
  accessorial_deductions_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  miles: number;
  computed_at: string;
  data_completeness: "complete" | "partial";
  missing_sources: string[];
};

export type TripProfitabilityRow = {
  settlement_id: string;
  settlement_display_id: string | null;
  driver_name: string | null;
  nb_load_id: string | null;
  nb_load_number: string | null;
  sb_load_id: string | null;
  sb_load_number: string | null;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  insurance_alloc_cents: number;
  factoring_fee_cents: number;
  accessorial_deductions_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  trip_closed_at: string | null;
};

export type TripProfitabilityResponse = {
  period: { start: string; end: string };
  totals: {
    revenue_cents: number;
    driver_pay_cents: number;
    fuel_cents: number;
    maintenance_cents: number;
    net_profit_cents: number;
    trip_count: number;
  };
  rows: TripProfitabilityRow[];
};

// ─── API helpers ─────────────────────────────────────────────────────────────

export function getLoadProfitability(loadId: string, operatingCompanyId: string) {
  return apiRequest<LoadProfitabilitySnapshot>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/profitability?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getTripProfitability(params: {
  operating_company_id: string;
  from: string;
  to: string;
}) {
  const q = new URLSearchParams(params).toString();
  return apiRequest<TripProfitabilityResponse>(`/api/v1/reports/trip-profitability?${q}`);
}

// ─── Badge helpers (Lane A imports these for LoadCard) ───────────────────────

export type NetProfitBadgeVariant = "positive" | "breakeven" | "negative" | "loading" | "unavailable";

export interface NetProfitBadgeProps {
  netProfitCents: number;
  marginPct: number;
  variant: NetProfitBadgeVariant;
}

/** Classify net profit for badge colouring. */
export function classifyProfit(netProfitCents: number, marginPct: number): NetProfitBadgeVariant {
  if (marginPct >= 15) return "positive";
  if (marginPct >= 0) return "breakeven";
  return "negative";
}

/** Tailwind className for a given variant. */
export function profitBadgeClassName(variant: NetProfitBadgeVariant): string {
  switch (variant) {
    case "positive":
      return "bg-green-100 text-green-800";
    case "breakeven":
      return "bg-amber-100 text-amber-800";
    case "negative":
      return "bg-red-100 text-red-700";
    case "loading":
      return "bg-gray-100 text-gray-400 animate-pulse";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

/** Format cents as a compact dollar string for badge display. */
export function formatProfitCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return `${dollars < 0 ? "-" : ""}$${Math.round(Math.abs(dollars) / 100) / 10}k`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);
}
