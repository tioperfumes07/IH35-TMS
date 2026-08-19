import { apiRequest } from "./client";

export const FINANCE_HUB_SCENARIOS_FLAG = "FINANCE_HUB_SCENARIOS_ENABLED";

export type ScenarioStatus = "draft" | "active" | "superseded";
export type PeriodBasis = "monthly" | "quarterly";
export type CategoryKind = "revenue" | "expense";
export type ActualSource = "manual" | "gl_actual";

export type Scenario = {
  id: string;
  name: string;
  period_basis: PeriodBasis;
  period_start: string;
  period_count: number;
  notes: string | null;
  status: ScenarioStatus;
  superseded_by_scenario_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ForecastLine = {
  id: string;
  scenario_id: string;
  period_index: number;
  period_label: string;
  category_kind: CategoryKind;
  category_label: string;
  gl_account_id: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  // Human labels for the linkage column, resolved server-side by an entity-scoped join — never
  // derive a label from the id (FAIL-CP1: EntityLink prints a raw uuid when given an id with no label).
  customer_name: string | null;
  vendor_name: string | null;
  account_name: string | null;
  assumption_note: string;
  estimate_amount_cents: number;
  actual_amount_cents: number | null;
  actual_source: ActualSource | null;
  actual_recorded_at: string | null;
};

export type LineTemplate = {
  category_kind: CategoryKind;
  category_label: string;
  assumption_note: string;
  monthly_estimate_cents: number;
  gl_account_id?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
};

export type CreateScenarioPayload = {
  operating_company_id: string;
  name: string;
  period_basis: PeriodBasis;
  period_start: string;
  period_count: number;
  notes?: string | null;
  line_templates: LineTemplate[];
};

export type ScenarioSummary = {
  scenario: Scenario;
  totals: {
    estimate_revenue_cents: number;
    estimate_expense_cents: number;
    estimate_net_cents: number;
    actual_revenue_cents: number;
    actual_expense_cents: number;
    actual_net_cents: number;
    has_any_actuals: boolean;
  };
};

export function listScenarios(operatingCompanyId: string) {
  return apiRequest<{ scenarios: Scenario[] }>(
    `/api/v1/finance/scenarios?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createScenario(payload: CreateScenarioPayload) {
  return apiRequest<{ scenario: Scenario; lines: ForecastLine[] }>("/api/v1/finance/scenarios", {
    method: "POST",
    body: payload,
  });
}

export function getScenarioDetail(scenarioId: string, operatingCompanyId: string) {
  return apiRequest<{ scenario: Scenario; lines: ForecastLine[] }>(
    `/api/v1/finance/scenarios/${scenarioId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function activateScenario(scenarioId: string, operatingCompanyId: string) {
  return apiRequest<{ scenario: Scenario }>(`/api/v1/finance/scenarios/${scenarioId}/activate`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function recordLineActual(lineId: string, operatingCompanyId: string, actualAmountCents: number) {
  return apiRequest<{ line: ForecastLine }>(`/api/v1/finance/scenarios/lines/${lineId}/actual`, {
    method: "PATCH",
    body: { operating_company_id: operatingCompanyId, actual_amount_cents: actualAmountCents },
  });
}

export function getActiveScenarioSummary(operatingCompanyId: string) {
  return apiRequest<{ summary: ScenarioSummary | null }>(
    `/api/v1/finance/scenarios/active-summary?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}
