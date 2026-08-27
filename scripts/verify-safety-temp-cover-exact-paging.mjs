#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "apps/backend/src/safety/driver-scheduler.service.ts",
  "apps/backend/src/safety/driver-scheduler.routes.ts",
  "apps/frontend/src/api/driver-scheduler.ts",
  "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
];

function verify(service, routes, api, page) {
  const errors = [];
  service = service.slice(service.indexOf("export async function listTempAssignments"), service.indexOf("export async function assignTempCover"));
  const routeHandler = routes.slice(routes.indexOf('app.get("/api/v1/safety/scheduler/temp-assignments"'), routes.indexOf('app.post("/api/v1/safety/scheduler/temp-assignments"'));
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  need(service, /COUNT\(\*\)::text AS total_count[\s\S]*t\.operating_company_id = \$1::uuid[\s\S]*t\.voided_at IS NULL[\s\S]*t\.primary_driver_id = \$2::uuid OR t\.cover_driver_id = \$2::uuid[\s\S]*t\.unit_id = \$3::uuid/, "service needs an exact scoped reverse-graph count");
  need(service, /ORDER BY t\.start_date DESC[\s\S]*LIMIT \$4[\s\S]*OFFSET \$5/, "service needs deterministic bound paging");
  if (/listTempAssignments[\s\S]*LIMIT 200/.test(service)) errors.push("silent 200 cap must stay removed");
  need(routes, /tempAssignmentsQuerySchema[\s\S]*limit: z\.coerce\.number\(\).*max\(300\)\.default\(50\)[\s\S]*offset: z\.coerce\.number\(\).*default\(0\)/, "route must validate bounded range inputs");
  need(routeHandler, /total_count: result\.totalCount/, "route must expose the exact total");
  need(api, /filters: \{ driver_id\?: string; unit_id\?: string; limit\?: number; offset\?: number \}/, "client must type range and reverse filters");
  need(page, /queryKey: \["driver-scheduler", "temp-assignments", operatingCompanyId, driverId, unitId, tempPage\]/, "query identity must include scope, filters, and page");
  need(page, /offset: tempPage \* tempPageSize/, "client must send the selected offset");
  need(page, /\{tempPage \* tempPageSize \+ 1\}–\{Math\.min\(\(tempPage \+ 1\) \* tempPageSize, tempAssignmentTotal\)\} of \{tempAssignmentTotal\}/, "UI must disclose the exact range");
  need(page, /useEffect\(\(\) => setTempPage\(0\), \[operatingCompanyId, driverId, unitId\]\)/, "scope/filter transitions must reset paging");
  need(page, /@matrix-built\s+safety:driver_scheduler\.list:\{driver,unit,connectivity,reverse_link,qbo_chrome\}/, "leaf-specific Built evidence is required");
  return errors;
}

const sources = files.map((file) => fs.readFileSync(path.join(root, file), "utf8"));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["count", sources[0].replaceAll("COUNT(*)::text AS total_count", "COUNT(*) AS removed_total"), sources[1], sources[2], sources[3]],
    ["limit", sources[0].replace("LIMIT $4", "LIMIT 200"), sources[1], sources[2], sources[3]],
    ["total", sources[0], sources[1].replaceAll("total_count: result.totalCount", "total_count: result.assignments.length"), sources[2], sources[3]],
    ["api-offset", sources[0], sources[1], sources[2].replace("limit?: number; offset?: number", "limit?: number; removed_offset?: number"), sources[3]],
    ["page-key", sources[0], sources[1], sources[2], sources[3].replace("unitId, tempPage]", "unitId]")],
    ["page-offset", sources[0], sources[1], sources[2], sources[3].replace("offset: tempPage * tempPageSize", "offset: 0")],
    ["range", sources[0], sources[1], sources[2], sources[3].replace(" of {tempAssignmentTotal}", "")],
    ["reset", sources[0], sources[1], sources[2], sources[3].replace("useEffect(() => setTempPage(0), [operatingCompanyId, driverId, unitId]);", "")],
    ["leaf", sources[0], sources[1], sources[2], sources[3].replace("reverse_link,qbo_chrome", "qbo_chrome")],
  ];
  const survived = mutations.filter(([, ...args]) => verify(...args).length === 0).map(([name]) => name);
  if (survived.length) {
    console.error(`verify-safety-temp-cover-exact-paging selftest FAIL: ${survived.join(", ")} survived`);
    process.exit(1);
  }
  console.log(`verify-safety-temp-cover-exact-paging selftest PASS: ${mutations.length}/${mutations.length} mutations rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-temp-cover-exact-paging PASS");
