import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/dashboard.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const home = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8");
const table = fs.readFileSync("apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx", "utf8");

function routeSlice(source) {
  const start = source.indexOf('"/api/v1/maintenance/dashboard/intransit-triage-queue"');
  const end = source.indexOf('"/api/v1/maintenance/dashboard/recent-activity"', start);
  return source.slice(start, end);
}

function apiSlice(source) {
  const start = source.indexOf("export function getMaintenanceInTransitQueue");
  const end = source.indexOf("export function getMaintenanceRecentActivity", start);
  return source.slice(start, end);
}

function problems(b = backend, a = api, h = home, t = table) {
  const route = routeSlice(b);
  const client = apiSlice(a);
  const checks = [
    [route.includes("max(300).default(50)") && route.includes("offset: z.coerce.number"), "bounded route range"],
    [route.includes("COUNT(*)::int AS total_count") && route.includes("driver_company_authorizations intransit_count_dca"), "exact joined count"],
    [route.includes("LIMIT $2 OFFSET $3") && !route.includes("LIMIT 50"), "bound page without silent cap"],
    [route.includes("i.reported_at DESC, i.id ASC"), "stable order"],
    [client.includes("getMaintenanceInTransitQueue(companyId: string, range:") && client.includes('params.set("offset"'), "typed client range"],
    [h.includes('"triage-table", companyId, triagePage') && h.includes("offset: (triagePage - 1) * triagePageSize"), "full tab reaches API"],
    [h.includes('getMaintenanceInTransitQueue(companyId, { limit: 50, offset: 0 })'), "sidebar preview remains first page"],
    [h.includes("useEffect(() => setTriagePage(1), [companyId])"), "company reset"],
    [t.includes('data-testid="in-transit-issues-server-pager"') && t.includes("hidePager"), "single exact pager"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("max(300).default(50)", "max(50).default(50)"), api, home, table],
    [backend.replace("COUNT(*)::int AS total_count", "50::int AS total_count"), api, home, table],
    [backend.replace("driver_company_authorizations intransit_count_dca", "driver_company_authorizations missing_count_scope"), api, home, table],
    [backend.replace("LIMIT $2 OFFSET $3", "LIMIT 50"), api, home, table],
    [backend.replace(", i.id ASC", ""), api, home, table],
    [backend, api.replace('export function getMaintenanceInTransitQueue(companyId: string, range: { limit?: number; offset?: number } = {})', 'export function getMaintenanceInTransitQueue(companyId: string, range: { limit?: number; offset?: number } = {})').replace('params.set("offset", String(range.offset ?? 0));\n  return apiRequest<{ issues: InTransitIssue[]', 'params.set("legacy_offset", String(range.offset ?? 0));\n  return apiRequest<{ issues: InTransitIssue[]'), home, table],
    [backend, api, home.replace("offset: (triagePage - 1) * triagePageSize", "offset: 0"), table],
    [backend, api, home.replace('getMaintenanceInTransitQueue(companyId, { limit: 50, offset: 0 })', 'getMaintenanceInTransitQueue(companyId, { limit: 50, offset: 50 })'), table],
    [backend, api, home, table.replace('data-testid="in-transit-issues-server-pager"', 'data-testid="missing-pager"')],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-maintenance-intransit-exact-range selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-intransit-exact-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-intransit-exact-range PASS — full triage tab has exact joined server pages while dashboard preview remains explicit first page");
