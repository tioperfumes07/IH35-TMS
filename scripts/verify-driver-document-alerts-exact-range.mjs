import fs from "node:fs";

const routes = fs.readFileSync("apps/backend/src/drivers/document-alerts.routes.ts", "utf8");
const service = fs.readFileSync("apps/backend/src/drivers/document-alerts.service.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/document-alerts.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx", "utf8");

function problems(r = routes, s = service, a = api, p = page) {
  const checks = [
    [r.includes("const inboxQuerySchema = companyQuerySchema.extend") && r.includes("max(300).default(50)"), "bounded route range"],
    [s.includes("COUNT(*)::int AS total_count") && s.includes("event_status = 'open'"), "exact scoped count"],
    [s.includes("LIMIT $2 OFFSET $3") && !s.includes("LIMIT 500"), "bound page without silent cap"],
    [s.includes("e.days_until_expiry ASC, e.detected_at DESC, e.id ASC"), "stable order"],
    [r.includes("pending_count: result.totalCount") && r.includes("limit: query.data.limit, offset: query.data.offset"), "exact route response"],
    [a.includes("range: { limit?: number; offset?: number } = {}") && a.includes('params.set("offset"'), "typed client range"],
    [p.includes("offset: (inboxPage - 1) * inboxPageSize"), "page reaches API"],
    [p.includes('data-testid="document-alerts-server-pager"') && p.includes("of {pendingCount}"), "visible exact pager"],
    [p.includes("useEffect(() => setInboxPage(1), [companyId])"), "company reset"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [routes.replace("max(300).default(50)", "max(500).default(500)"), service, api, page],
    [routes, service.replace("COUNT(*)::int AS total_count", "500::int AS total_count"), api, page],
    [routes, service.replace("LIMIT $2 OFFSET $3", "LIMIT 500"), api, page],
    [routes, service.replace(", e.id ASC", ""), api, page],
    [routes.replace("pending_count: result.totalCount", "pending_count: result.events.length"), service, api, page],
    [routes, service, api.replace('params.set("offset"', 'params.set("legacy_offset"'), page],
    [routes, service, api, page.replace("offset: (inboxPage - 1) * inboxPageSize", "offset: 0")],
    [routes, service, api, page.replace('data-testid="document-alerts-server-pager"', 'data-testid="missing-pager"')],
    [routes, service, api, page.replace("useEffect(() => setInboxPage(1), [companyId])", "void companyId")],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-driver-document-alerts-exact-range selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-driver-document-alerts-exact-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-document-alerts-exact-range PASS — scoped alert inbox has exact total, bounded stable pages, lifecycle-safe navigation");
