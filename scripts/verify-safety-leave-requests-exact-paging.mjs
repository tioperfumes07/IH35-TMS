#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const servicePath = "apps/backend/src/safety/driver-scheduler.service.ts";
const routePath = "apps/backend/src/safety/driver-scheduler.routes.ts";
const apiPath = "apps/frontend/src/api/driver-scheduler.ts";
const pagePath = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx";

function verify(service, route, api, page) {
  const errors = [];
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  const serviceStart = service.indexOf("export async function listPendingLeaveRequests(");
  const serviceEnd = service.indexOf("export async function listAllLeaveRequests(", serviceStart);
  const pendingService = serviceStart < 0 || serviceEnd < 0 ? "" : service.slice(serviceStart, serviceEnd);
  const routeStart = route.indexOf('"/api/v1/safety/scheduler/requests/pending"');
  const routeEnd = route.indexOf('app.get("/api/v1/safety/scheduler/requests/:id"', routeStart);
  const pendingRoute = routeStart < 0 || routeEnd < 0 ? "" : route.slice(routeStart, routeEnd);
  need(pendingService, /COUNT\(\*\)::text AS total_count[\s\S]*r\.operating_company_id = \$1::uuid[\s\S]*r\.status = 'pending_review'[\s\S]*r\.voided_at IS NULL/, "service needs an exact scoped pending count");
  need(pendingService, /ORDER BY r\.start_date ASC, r\.created_at ASC[\s\S]*LIMIT \$2[\s\S]*OFFSET \$3/, "service needs bound deterministic paging");
  if (/LIMIT 500/.test(pendingService)) errors.push("silent 500 cap must stay removed");
  need(pendingRoute, /limit: z\.coerce\.number\(\).*max\(300\)\.default\(50\)[\s\S]*offset: z\.coerce\.number\(\).*default\(0\)/, "pending route must validate range inputs");
  need(pendingRoute, /total_count: result\.totalCount/, "pending route must return exact total");
  need(api, /listPending\(operatingCompanyId: string, limit = 50, offset = 0\)/, "client must expose range inputs");
  need(page, /queryKey: \["driver-scheduler", "pending", operatingCompanyId, page\]/, "query identity must include the page");
  need(page, /pageSize=\{PAGE_SIZE\}[\s\S]*hidePager/, "local ParityTable pager must be disabled");
  need(page, /\{page \* PAGE_SIZE \+ 1\}–\{Math\.min\(\(page \+ 1\) \* PAGE_SIZE, totalCount\)\} of \{totalCount\}/, "UI must disclose exact range");
  need(page, /useEffect\(\(\) => setPage\(0\), \[operatingCompanyId\]\)/, "company transition must reset paging");
  need(page, /@matrix-built\s+safety:leave_requests\.list:\{driver,connectivity,qbo_chrome\}/, "leaf-specific Built evidence is required");
  return errors;
}

const sources = [servicePath, routePath, apiPath, pagePath].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
if (process.argv.includes("--selftest")) {
  const mutations = [
    [sources[0].replace("COUNT(*)::text AS total_count", "COUNT(*) AS removed_total"), sources[1], sources[2], sources[3]],
    [sources[0].replace("LIMIT $2", "LIMIT 500"), sources[1], sources[2], sources[3]],
    [sources[0], sources[1].replace("total_count: result.totalCount", "total_count: result.requests.length"), sources[2], sources[3]],
    [sources[0], sources[1], sources[2], sources[3].replace(", page]", "]")],
    [sources[0], sources[1], sources[2], sources[3].replace("hidePager", "")],
    [sources[0], sources[1], sources[2], sources[3].replace(" of {totalCount}", "")],
    [sources[0], sources[1], sources[2], sources[3].replace("useEffect(() => setPage(0), [operatingCompanyId]);", "")],
  ];
  const missed = mutations.filter((args) => verify(...args).length === 0).length;
  if (missed) {
    console.error(`verify-safety-leave-requests-exact-paging selftest FAIL: ${missed}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`verify-safety-leave-requests-exact-paging selftest PASS: ${mutations.length}/${mutations.length} mutations rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-leave-requests-exact-paging PASS");
