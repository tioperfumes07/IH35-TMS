// ROUND 326.2 item 2 — Banking KPI engine client (server computes every value from the bank feed + GL; no component math).
import { apiRequest } from "./client";
import type { LedgerKpi, LedgerKpiResponse } from "../components/shared/LedgerKpiPanel";

export type BankingKpiKey =
  | "cash_position" | "cleared_vs_uncleared" | "unmatched_inflow" | "unmatched_outflow" | "match_rate"
  | "reconciliation_gap" | "factoring_wires_vs_expected" | "fuel_drafts" | "settlement_drafts"
  // ROUND 335 item 2 — driver escrow (2100 + sub-accounts), the approved preview's Banking Feature 2.
  | "escrow_held" | "escrow_contributions" | "escrow_deductions";

export type BankingKpi = LedgerKpi & { key: BankingKpiKey };

const qs = (companyId: string, from?: string, to?: string) => {
  const p = new URLSearchParams({ operating_company_id: companyId });
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  return p.toString();
};

// A response without a kpis array / rows array is an error, never an empty strip (no manufactured zeros).
export async function getBankingLedgerKpis(companyId: string, from?: string, to?: string) {
  const r = await apiRequest<LedgerKpiResponse<BankingKpiKey>>(`/api/v1/banking/kpis?${qs(companyId, from, to)}`);
  if (!r || !Array.isArray(r.kpis) || !r.range) throw new Error("Malformed banking KPI response");
  return r;
}

export async function getBankingLedgerKpiDrill(companyId: string, key: BankingKpiKey, from?: string, to?: string) {
  const r = await apiRequest<{ key: BankingKpiKey; range: { from: string; to: string }; rows: Array<Record<string, unknown>> }>(
    `/api/v1/banking/kpis/${encodeURIComponent(key)}/drill?${qs(companyId, from, to)}`
  );
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed banking KPI drill response");
  return r;
}
