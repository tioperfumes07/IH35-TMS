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
  tracked_assets?: number;
  assigned_working?: number;
  maint_past_due?: number;
  open_damage?: number;
  pending_qbo_sync?: number;
  ifta_status: { quarter: string; dueAt: string; daysUntilDue: number };
};

export type HomeAttentionItem = {
  severity: "critical" | "warning" | "info";
  message: string;
  link: string;
  count: number;
};

export type HomeAttentionListResponse = {
  items: HomeAttentionItem[];
};

export type HomeFleetSnapshot = {
  trucks: number;
  flatbeds: number;
  dry_vans: number;
  refrigerated: number;
  trailers: number;
  in_shop: number;
  out_of_service: number;
  assigned_units: number;
  idle_units: number;
  samsara_live: number;
  no_signal_6h: number;
  roadside: number;
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
  last_payment_date?: string | null;
};

export type ARAgingResponse = {
  status: "real";
  generated_at: string;
  as_of_date?: string;
  total_open_cents: number;
  total_open_invoices: number;
  rows: ARAgingRow[];
};

export type APAgingRow = {
  vendor_id: string;
  vendor_name: string;
  open_bill_count: number;
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  total_open_cents: number;
  last_payment_date?: string | null;
};

export type APAgingResponse = {
  status: "real";
  generated_at: string;
  as_of_date?: string;
  rows: APAgingRow[];
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

type ArAgingApiPayload = {
  as_of_date: string;
  totals: {
    total_outstanding_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: Array<{
    customer_id: string;
    customer_name: string;
    total_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
    last_payment_date: string | null;
    invoice_count: number;
  }>;
};

type ApAgingApiPayload = {
  as_of_date: string;
  totals: {
    total_outstanding_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
  };
  rows: Array<{
    vendor_id: string;
    vendor_name: string;
    total_cents: number;
    bucket_0_30_cents: number;
    bucket_31_60_cents: number;
    bucket_61_90_cents: number;
    bucket_91_plus_cents: number;
    last_payment_date: string | null;
    bill_count: number;
  }>;
};

export async function getArAgingReport(companyId: string, asOfDate: string): Promise<ARAgingResponse> {
  const raw = await apiRequest<ArAgingApiPayload>(
    withCompany(`/api/v1/reports/ar-aging?as_of_date=${encodeURIComponent(asOfDate)}`, companyId)
  );
  const rows: ARAgingRow[] = raw.rows.map((r) => ({
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    open_invoice_count: r.invoice_count,
    current_cents: 0,
    bucket_1_30_cents: r.bucket_0_30_cents,
    bucket_31_60_cents: r.bucket_31_60_cents,
    bucket_61_90_cents: r.bucket_61_90_cents,
    bucket_91_plus_cents: r.bucket_91_plus_cents,
    total_open_cents: r.total_cents,
    last_payment_date: r.last_payment_date,
  }));
  return {
    status: "real",
    generated_at: new Date().toISOString(),
    as_of_date: raw.as_of_date,
    total_open_cents: raw.totals.total_outstanding_cents,
    total_open_invoices: rows.reduce((s, row) => s + row.open_invoice_count, 0),
    rows,
  };
}

export async function getApAgingReport(companyId: string, asOfDate: string): Promise<APAgingResponse> {
  const raw = await apiRequest<ApAgingApiPayload>(
    withCompany(`/api/v1/reports/ap-aging?as_of_date=${encodeURIComponent(asOfDate)}`, companyId)
  );
  const rows: APAgingRow[] = raw.rows.map((r) => ({
    vendor_id: r.vendor_id,
    vendor_name: r.vendor_name,
    open_bill_count: r.bill_count,
    current_cents: 0,
    bucket_1_30_cents: r.bucket_0_30_cents,
    bucket_31_60_cents: r.bucket_31_60_cents,
    bucket_61_90_cents: r.bucket_61_90_cents,
    bucket_91_plus_cents: r.bucket_91_plus_cents,
    total_open_cents: r.total_cents,
    last_payment_date: r.last_payment_date,
  }));
  return {
    status: "real",
    generated_at: new Date().toISOString(),
    as_of_date: raw.as_of_date,
    rows,
  };
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

export async function getHomeAttentionList(companyId: string): Promise<HomeAttentionListResponse> {
  return apiRequest<HomeAttentionListResponse>(withCompany("/api/v1/reports/home-attention-list", companyId));
}

export async function getHomeFleetSnapshot(companyId: string): Promise<HomeFleetSnapshot> {
  return apiRequest<HomeFleetSnapshot>(withCompany("/api/v1/reports/home-fleet-snapshot", companyId));
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
  const result = await getArAgingReport(companyId, new Date().toISOString().slice(0, 10));
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
