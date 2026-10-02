// ROUND 326.2 item 1 — Factoring KPI engine client (server computes every value from the ledger; no component math).
import { apiRequest } from "./client";

export type FactoringKpiKey =
  | "purchased_volume" | "advance_rate" | "escrow_reserve_balance" | "cash_reserve_balance" | "fees_accrued"
  | "default_interest_accrued" | "net_cash_received" | "days_to_fund" | "unfunded_aging" | "reserve_releases";

export type FactoringKpi = {
  key: FactoringKpiKey;
  label: string;
  unit: "cents" | "percent" | "days" | "count";
  value: number | null;
  compare_value?: number | null;
  compare_label?: string;
  source: string;
  gl_account: string | null;
  row_count: number;
  empty_reason: string | null;
  buckets?: Array<{ label: string; count: number; cents: number }>;
};

const qs = (companyId: string, from?: string, to?: string) => {
  const p = new URLSearchParams({ operating_company_id: companyId });
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  return p.toString();
};

// A response without a kpis array / rows array is an error, never an empty strip (no manufactured zeros).
export async function getFactoringKpis(companyId: string, from?: string, to?: string) {
  const r = await apiRequest<{ range: { from: string; to: string }; kpis: FactoringKpi[] }>(`/api/v1/factoring/kpis?${qs(companyId, from, to)}`);
  if (!r || !Array.isArray(r.kpis) || !r.range) throw new Error("Malformed factoring KPI response");
  return r;
}

export async function getFactoringKpiDrill(companyId: string, key: FactoringKpiKey, from?: string, to?: string) {
  const r = await apiRequest<{ key: FactoringKpiKey; range: { from: string; to: string }; rows: Array<Record<string, unknown>> }>(
    `/api/v1/factoring/kpis/${encodeURIComponent(key)}/drill?${qs(companyId, from, to)}`
  );
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed factoring KPI drill response");
  return r;
}
