import { apiRequest } from "./client";

export type ReportCategory = "all" | "operations" | "financial" | "drivers" | "fleet" | "fuel" | "safety" | "compliance" | "saved";

export type FrequentlyRunReport = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  status?: "real" | "stub";
  filters: string;
  runs: number;
};

export type ScheduledReport = {
  id: string;
  report_id?: string;
  cadence: string;
  cadence_label?: string;
  name: string;
  recipients: string;
};

export type IftaStatus = {
  currentQuarter: string;
  filedAt: string | null;
  nextDueAt: string;
  daysUntilDue: number;
  step1Ready: boolean;
  step2Ready: boolean;
  step3Ready: boolean;
  step4WaitsClose: boolean;
  notes?: string;
};

export type ReportLibraryItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "real" | "stub";
};

export type KpiSummary = {
  available_reports: number;
  scheduled: number;
  run_last_7d: number;
  outstanding_ar_cents: number;
  ifta_status: { quarter: string; dueAt: string; daysUntilDue: number };
};

export type ARAgingRow = {
  customer_id: string;
  customer_name: string;
  open_invoice_count: number;
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  total_open_cents: number;
};

export type ARAgingResponse = {
  status: "real";
  generated_at: string;
  total_open_cents: number;
  total_open_invoices: number;
  rows: ARAgingRow[];
};

type ReportRunLogBody = {
  operating_company_id: string;
  report_id: string;
  report_name?: string;
  filters?: Record<string, unknown>;
  duration_ms?: number;
  rows_returned?: number;
};

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

async function postRunLog(body: ReportRunLogBody) {
  await apiRequest<{ ok: boolean }>("/api/v1/reports/run-log", { method: "POST", body });
}

export async function getReportLibrary(companyId: string): Promise<ReportLibraryItem[]> {
  const response = await apiRequest<{ reports: ReportLibraryItem[] }>(withCompany("/api/v1/reports/library", companyId));
  return response.reports;
}

export async function getFrequentlyRun(companyId: string): Promise<FrequentlyRunReport[]> {
  const response = await apiRequest<{ rows: Array<Record<string, unknown>> }>(
    withCompany("/api/v1/reports/frequently-run?period=7d", companyId)
  );
  return response.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    category: row.category ? String(row.category) : undefined,
    description: row.description ? String(row.description) : undefined,
    status: (row.status as "real" | "stub" | undefined) ?? "real",
    filters: String(row.filters ?? "default"),
    runs: Number(row.runs ?? row.run_count ?? 0),
  }));
}

export async function getScheduledReports(companyId: string): Promise<ScheduledReport[]> {
  const response = await apiRequest<{ rows: Array<Record<string, unknown>> }>(withCompany("/api/v1/reports/scheduled", companyId));
  return response.rows.map((row) => ({
    id: String(row.id ?? ""),
    report_id: row.report_id ? String(row.report_id) : undefined,
    cadence: String(row.cadence_label ?? row.cadence ?? ""),
    cadence_label: row.cadence_label ? String(row.cadence_label) : undefined,
    name: String(row.name ?? ""),
    recipients: String(row.recipients ?? "—"),
  }));
}

export async function getKpiSummary(companyId: string): Promise<KpiSummary> {
  return apiRequest<KpiSummary>(withCompany("/api/v1/reports/kpi-summary", companyId));
}

export async function getIftaStatus(companyId: string): Promise<IftaStatus> {
  return apiRequest<IftaStatus>(withCompany("/api/v1/reports/ifta-status", companyId));
}

export async function runProfitPerTruck(companyId: string, month: string) {
  const startedAt = Date.now();
  const result = await apiRequest<{ rows: unknown[] }>(
    withCompany(`/api/v1/reports/profit-per-truck?month=${encodeURIComponent(month)}`, companyId)
  );
  await postRunLog({
    operating_company_id: companyId,
    report_id: "profit-per-truck",
    report_name: "Profit per truck · MTD",
    filters: { month },
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runDriverSettlementSummary(companyId: string, cycleStart?: string, cycleEnd?: string) {
  const startedAt = Date.now();
  const query = new URLSearchParams();
  if (cycleStart) query.set("cycle_start", cycleStart);
  if (cycleEnd) query.set("cycle_end", cycleEnd);
  const base = "/api/v1/reports/driver-settlement-summary";
  const path = query.toString() ? `${base}?${query.toString()}` : base;
  const result = await apiRequest<{ rows: unknown[] }>(withCompany(path, companyId));
  await postRunLog({
    operating_company_id: companyId,
    report_id: "driver-settlement",
    report_name: "Driver settlement summary",
    filters: { cycleStart, cycleEnd },
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runArAging(companyId: string) {
  const startedAt = Date.now();
  const result = await apiRequest<ARAgingResponse>(withCompany("/api/v1/reports/ar-aging", companyId));
  await postRunLog({
    operating_company_id: companyId,
    report_id: "ar-aging",
    report_name: "A/R aging",
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runFuelSavings(companyId: string, period: string) {
  const startedAt = Date.now();
  const result = await apiRequest<{ rows: unknown[] }>(
    withCompany(`/api/v1/reports/fuel-savings?period=${encodeURIComponent(period)}`, companyId)
  );
  await postRunLog({
    operating_company_id: companyId,
    report_id: "fuel-savings",
    report_name: "Fuel savings · rec vs actual",
    filters: { period },
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runMaintenanceCostPerUnit(companyId: string, period: string) {
  const startedAt = Date.now();
  const result = await apiRequest<{ rows: unknown[] }>(
    withCompany(`/api/v1/reports/maintenance-cost-per-unit?period=${encodeURIComponent(period)}`, companyId)
  );
  await postRunLog({
    operating_company_id: companyId,
    report_id: "maint-cost-unit",
    report_name: "Maintenance cost per unit",
    filters: { period },
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runDetentionClaims(companyId: string) {
  const startedAt = Date.now();
  const result = await apiRequest<{ status: string; message: string; rows: unknown[] }>(
    withCompany("/api/v1/reports/detention-claims", companyId)
  );
  await postRunLog({
    operating_company_id: companyId,
    report_id: "detention-claims",
    report_name: "Detention claims",
    duration_ms: Date.now() - startedAt,
    rows_returned: result.rows.length,
  });
  return result;
}

export async function runDriverPayHistory(companyId: string, driverId: string, start?: string, end?: string) {
  const startedAt = Date.now();
  const query = new URLSearchParams({ driver_id: driverId });
  if (start) query.set("start", start);
  if (end) query.set("end", end);
  const result = await apiRequest<{ settlements: unknown[] }>(withCompany(`/api/v1/reports/driver-pay-history?${query.toString()}`, companyId));
  await postRunLog({
    operating_company_id: companyId,
    report_id: "driver-pay-history",
    report_name: "Driver pay history",
    filters: { driverId, start, end },
    duration_ms: Date.now() - startedAt,
    rows_returned: result.settlements.length,
  });
  return result;
}

export async function runCsaFleetScore(companyId: string) {
  const startedAt = Date.now();
  const result = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/reports/csa-fleet-score", companyId));
  await postRunLog({
    operating_company_id: companyId,
    report_id: "csa-fleet",
    report_name: "CSA fleet score",
    duration_ms: Date.now() - startedAt,
    rows_returned: 1,
  });
  return result;
}
