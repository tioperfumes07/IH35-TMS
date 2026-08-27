import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/reports.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/maintenance/reports/MaintenanceReportsPage.tsx", "utf8");

function problems(b = backend, a = api, p = page) {
  const buildStart = b.indexOf("async function buildRows");
  const buildEnd = b.indexOf("export async function renderMaintenanceReportXlsx");
  const reportQueries = b.slice(buildStart, buildEnd);
  const checks = [
    [buildStart >= 0 && buildEnd > buildStart, "canonical report query family"],
    [!reportQueries.match(/LIMIT\s+(20|50|100)\b/), "silent top-N caps removed"],
    [reportQueries.includes("total_actual_cost DESC NULLS LAST, id ASC"), "cost threshold stable order"],
    [reportQueries.includes("age_days DESC, id ASC"), "aged work-order stable order"],
    [reportQueries.includes("total_spend DESC NULLS LAST, vendor_name ASC"), "vendor spend stable order"],
    [b.includes("rows, total_count: rows.length"), "exact response count"],
    [a.includes("apiRequest<{ report: string; rows: Array<Record<string, unknown>>; total_count: number }>") && a.includes("getMaintenanceReportRows"), "typed exact count"],
    [p.includes("<ParityTable") && p.includes("exportFilename={report}"), "mounted report table/export"],
    [b.includes("buildRows(client, query.data.operating_company_id, params.data.report)") && b.includes("renderMaintenanceReportXlsx(rows)"), "screen and XLSX share canonical rows"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("ORDER BY total_actual_cost DESC NULLS LAST, id ASC", "ORDER BY total_actual_cost DESC LIMIT 100"), api, page],
    [backend.replace("ORDER BY age_days DESC, id ASC", "ORDER BY age_days DESC LIMIT 100"), api, page],
    [backend.replace("ORDER BY total_spend DESC NULLS LAST, vendor_name ASC", "ORDER BY total_spend DESC LIMIT 20"), api, page],
    [backend.replace("rows, total_count: rows.length", "rows"), api, page],
    [backend, api.replace("apiRequest<{ report: string; rows: Array<Record<string, unknown>>; total_count: number }>", "apiRequest<{ report: string; rows: Array<Record<string, unknown>> }>") , page],
    [backend.replace("renderMaintenanceReportXlsx(rows)", "renderMaintenanceReportXlsx([])"), api, page],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-maintenance-reports-complete-ledger selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-reports-complete-ledger FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-reports-complete-ledger PASS — every mounted report and XLSX uses the complete scoped ledger with stable ordering");
