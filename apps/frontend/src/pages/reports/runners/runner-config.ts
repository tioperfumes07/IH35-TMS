export type RunnerColumn = {
  key: string;
  label: string;
  align: "left" | "right" | "center";
  format?: "currency" | "percent" | "number" | "date" | "text";
  sortable?: boolean;
};

export type RunnerFilter = {
  type: "date_range" | "month_picker" | "unit_select" | "driver_select" | "company_select";
  key: string;
  label: string;
  required?: boolean;
  default?: string;
};

export type ReportRunnerConfig = {
  id: string;
  name: string;
  apiPath: string;
  filters: RunnerFilter[];
  columns: RunnerColumn[];
  csvFilename: (filters: Record<string, unknown>) => string;
};

export const RUNNER_CONFIGS: Record<string, ReportRunnerConfig> = {
  "profit-per-truck": {
    id: "profit-per-truck",
    name: "Per-truck CPM dashboard",
    apiPath: "/api/v1/reports/profit-per-truck",
    filters: [
      { type: "date_range", key: "date_range", label: "Date range", required: true },
      { type: "unit_select", key: "unit_id", label: "Unit" },
    ],
    columns: [
      { key: "unit_number", label: "Unit", align: "left", sortable: true },
      { key: "revenue_cents", label: "Revenue", align: "right", format: "currency", sortable: true },
      { key: "wo_cost_cents", label: "WO Cost", align: "right", format: "currency", sortable: true },
      { key: "profit_cents", label: "Profit", align: "right", format: "currency", sortable: true },
    ],
    csvFilename: (filters) => `profit-per-truck-${String(filters.from ?? "from")}-to-${String(filters.to ?? "to")}.csv`,
  },
  "driver-settlement": {
    id: "driver-settlement",
    name: "Driver settlement summary",
    apiPath: "/api/v1/reports/driver-settlement-summary",
    filters: [{ type: "date_range", key: "date_range", label: "Date range", required: true }],
    columns: [
      { key: "driver_name", label: "Driver", align: "left", sortable: true },
      { key: "gross_cents", label: "Gross", align: "right", format: "currency", sortable: true },
      { key: "advances_cents", label: "Advances", align: "right", format: "currency", sortable: true },
      { key: "deductions_cents", label: "Deductions", align: "right", format: "currency", sortable: true },
      { key: "escrow_cents", label: "Escrow", align: "right", format: "currency", sortable: true },
      { key: "net_cents", label: "Net", align: "right", format: "currency", sortable: true },
      { key: "status", label: "Status", align: "left", sortable: true },
    ],
    csvFilename: (filters) => `driver-settlements-${String(filters.cycle_start ?? filters.from ?? "cycle")}.csv`,
  },
  "ar-aging": {
    id: "ar-aging",
    name: "A/R Aging",
    apiPath: "/api/v1/reports/ar-aging",
    filters: [{ type: "date_range", key: "as_of", label: "As of date", required: true }],
    columns: [
      { key: "customer_name", label: "Customer", align: "left", format: "text", sortable: true },
      { key: "invoice_count", label: "Invoices", align: "right", format: "number", sortable: true },
      { key: "bucket_0_30_cents", label: "Current", align: "right", format: "currency", sortable: true },
      { key: "bucket_31_60_cents", label: "31-60", align: "right", format: "currency", sortable: true },
      { key: "bucket_61_90_cents", label: "61-90", align: "right", format: "currency", sortable: true },
      { key: "bucket_91_plus_cents", label: "91+", align: "right", format: "currency", sortable: true },
      { key: "total_cents", label: "Total Open", align: "right", format: "currency", sortable: true },
    ],
    csvFilename: () => `ar-aging-${new Date().toISOString().slice(0, 10)}.csv`,
  },
  "dispatch-margin": {
    id: "dispatch-margin",
    name: "Dispatch margin",
    apiPath: "/api/v1/reports/dispatch-margin",
    filters: [{ type: "date_range", key: "date_range", label: "Date range", required: true }],
    columns: [
      { key: "load_number", label: "Load", align: "left", sortable: true },
      { key: "customer_name", label: "Customer", align: "left", sortable: true },
      { key: "revenue_cents", label: "Revenue", align: "right", format: "currency", sortable: true },
      { key: "direct_cost_cents", label: "Direct cost", align: "right", format: "currency", sortable: true },
      { key: "margin_cents", label: "Margin", align: "right", format: "currency", sortable: true },
      { key: "margin_pct", label: "Margin %", align: "right", format: "percent", sortable: true },
    ],
    csvFilename: (filters) => `dispatch-margin-${String(filters.from ?? "from")}-to-${String(filters.to ?? "to")}.csv`,
  },
  "driver-pay-history": {
    id: "driver-pay-history",
    name: "Driver pay history",
    apiPath: "/api/v1/reports/driver-pay-history",
    filters: [
      { type: "driver_select", key: "driver_id", label: "Driver", required: true },
      { type: "date_range", key: "date_range", label: "Date range", required: true },
    ],
    columns: [
      { key: "period_start", label: "Period Start", align: "left", format: "date", sortable: true },
      { key: "period_end", label: "Period End", align: "left", format: "date", sortable: true },
      { key: "gross_cents", label: "Gross", align: "right", format: "currency", sortable: true },
      { key: "net_cents", label: "Net", align: "right", format: "currency", sortable: true },
      { key: "status", label: "Status", align: "left", sortable: true },
    ],
    csvFilename: (filters) => `driver-pay-${String(filters.driver_id ?? "driver")}-${String(filters.from ?? "start")}.csv`,
  },
  "maint-cost-unit": {
    id: "maint-cost-unit",
    name: "Maintenance cost per unit",
    apiPath: "/api/v1/reports/maintenance-cost-per-unit",
    filters: [{ type: "date_range", key: "date_range", label: "Date range", required: true }],
    columns: [
      { key: "unit_number", label: "Unit", align: "left", sortable: true },
      { key: "total_cost_cents", label: "Total Cost", align: "right", format: "currency", sortable: true },
      { key: "wo_count", label: "WO Count", align: "right", format: "number", sortable: true },
      { key: "avg_cost_per_wo_cents", label: "Avg / WO", align: "right", format: "currency", sortable: true },
    ],
    csvFilename: (filters) => `maint-cost-${String(filters.from ?? "from")}-to-${String(filters.to ?? "to")}.csv`,
  },
  "fuel-savings": {
    id: "fuel-savings",
    name: "Fuel savings",
    apiPath: "/api/v1/reports/fuel-savings",
    filters: [{ type: "date_range", key: "date_range", label: "Date range", required: true }],
    columns: [
      { key: "driver_name", label: "Driver", align: "left", sortable: true },
      { key: "recommended_savings_dollars", label: "Recommended", align: "right", format: "number", sortable: true },
      { key: "actual_savings_dollars", label: "Actual", align: "right", format: "number", sortable: true },
      { key: "missed_savings_dollars", label: "Missed", align: "right", format: "number", sortable: true },
      { key: "variance_pct", label: "Variance", align: "right", format: "percent", sortable: true },
    ],
    csvFilename: (filters) => `fuel-savings-${String(filters.from ?? "from")}-to-${String(filters.to ?? "to")}.csv`,
  },
  "fuel-price-variance": {
    id: "fuel-price-variance",
    name: "Fuel price variance",
    apiPath: "/api/v1/reports/fuel-price-variance",
    filters: [{ type: "date_range", key: "date_range", label: "Date range", required: true }],
    columns: [
      { key: "transaction_date", label: "Date", align: "left", format: "date", sortable: true },
      { key: "station", label: "Station", align: "left", sortable: true },
      { key: "unit_number", label: "Unit", align: "left", sortable: true },
      { key: "gallons", label: "Gallons", align: "right", format: "number", sortable: true },
      { key: "actual_price_per_gallon", label: "Actual $/gal", align: "right", format: "number", sortable: true },
      { key: "benchmark_price_per_gallon", label: "Benchmark $/gal", align: "right", format: "number", sortable: true },
      { key: "variance_per_gallon", label: "Variance $/gal", align: "right", format: "number", sortable: true },
      { key: "total_variance_dollars", label: "Total variance", align: "right", format: "number", sortable: true },
    ],
    csvFilename: (filters) => `fuel-price-variance-${String(filters.from ?? "from")}-to-${String(filters.to ?? "to")}.csv`,
  },
  "csa-fleet": {
    id: "csa-fleet",
    name: "Internal inspection-point rollup",
    apiPath: "/api/v1/reports/csa-fleet-score",
    filters: [],
    columns: [
      { key: "total_points", label: "Internal Points", align: "right", format: "number" },
      { key: "total_inspections", label: "Inspections", align: "right", format: "number" },
      { key: "total_oos", label: "OOS", align: "right", format: "number" },
      { key: "threshold_status", label: "Status", align: "left", format: "text" },
      { key: "computed_at", label: "Computed At", align: "left", format: "date" },
    ],
    csvFilename: () => `csa-fleet-score-${new Date().toISOString().slice(0, 10)}.csv`,
  },
  "fleet-utilization": {
    id: "fleet-utilization",
    name: "Fleet utilization",
    apiPath: "/api/v1/home/fleet-utilization",
    filters: [],
    columns: [
      { key: "active_units", label: "Units on active loads", align: "right", format: "number" },
      { key: "total_units", label: "Available units", align: "right", format: "number" },
      { key: "percentage", label: "Utilization", align: "right", format: "percent" },
    ],
    csvFilename: () => `fleet-utilization-${new Date().toISOString().slice(0, 10)}.csv`,
  },
};

export function toMonth(dateInput: unknown): string {
  const value = String(dateInput ?? "");
  return value.slice(0, 7);
}
