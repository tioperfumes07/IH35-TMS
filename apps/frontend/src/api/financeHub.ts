// AF-6 — Finance Hub landing dashboard (READ-ONLY client).
// The page is gated behind this OFF-by-default flag; with no lib.feature_flags row the resolver
// returns false, so the Finance-Hub landing surface stays disabled. The single GET reuses existing
// read-only accounting/finance reads on the backend — NO new posting path, NO money mutation.
import { apiRequest } from "./client";

export const FINANCE_HUB_UI_FLAG = "FINANCE_HUB_UI_ENABLED";

export type FinanceHubKpiKind = "money_cents" | "count" | "text";

export type FinanceHubKpi = {
  key: string;
  label: string;
  value_kind: FinanceHubKpiKind;
  value: number | string;
  secondary: string | null;
  drill_to: string;
  drill_label: string;
};

export type FinanceHubOverview = {
  operating_company_id: string;
  generated_at: string;
  read_only: true;
  kpis: FinanceHubKpi[];
};

export async function getFinanceHubOverview(params: { operating_company_id: string }): Promise<FinanceHubOverview> {
  const query = new URLSearchParams({ operating_company_id: params.operating_company_id });
  return apiRequest<FinanceHubOverview>(`/api/v1/finance/hub/overview?${query.toString()}`);
}
