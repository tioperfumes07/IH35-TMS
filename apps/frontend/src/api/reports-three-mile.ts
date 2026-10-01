import { apiRequest } from "./client";

/** ORDER-2026-09-04 three-mile cost per mile. Every figure names the mileage basis it divides by. */
export type ThreeMileBasis = "real_driven" | "practical" | "short";
export type ThreeMileGroupBy = "load" | "unit" | "driver" | "lane";
export type ThreeMileBasisFigure = {
  basis: ThreeMileBasis;
  basis_label: string;
  miles: number | null;
  cost_cents: number;
  cents_per_mile: number | null;
  loads_included: number;
  loads_excluded: number;
  reason: string | null;
};
export type ThreeMileMpg = { basis: "practical" | "real_driven"; basis_label: string; miles: number | null; gallons: number | null; mpg: number | null; reason: string | null };
export type ThreeMileRow = {
  key: string;
  label: string;
  group: ThreeMileGroupBy | "fleet";
  ref_id: string | null;
  loads: number;
  direct_cost_cents: number;
  cpm: ThreeMileBasisFigure[];
  mpg: ThreeMileMpg[];
  real_minus_practical_miles: number | null;
  real_minus_short_miles: number | null;
};
export type ThreeMileCpmResponse = {
  period: { from: string; to: string; timezone: string };
  group: ThreeMileGroupBy;
  mileage_bases: Record<ThreeMileBasis, string>;
  cost_source: string;
  rows: ThreeMileRow[];
  fleet: ThreeMileRow;
};

export function getThreeMileCpm(operatingCompanyId: string, q: { from: string; to: string; group_by: ThreeMileGroupBy }) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId, from: q.from, to: q.to, group_by: q.group_by });
  return apiRequest<ThreeMileCpmResponse>(`/api/v1/reports/three-mile-cpm?${qs.toString()}`);
}
