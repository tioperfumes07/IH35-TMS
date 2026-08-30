import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/arriving-soon.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx", "utf8");

function problems(candidateBackend = backend, candidateApi = api, candidatePage = page) {
  const apiStart = candidateApi.indexOf("export function getArrivingSoon(params:");
  const apiEnd = apiStart < 0 ? -1 : candidateApi.indexOf("export function convertIssueToWo(", apiStart);
  const arrivingSoonApi = apiStart < 0 || apiEnd < 0 ? "" : candidateApi.slice(apiStart, apiEnd);
  const checks = [
    [candidateBackend.includes("limit: z.coerce.number().int().min(1).max(100).default(25)"), "bounded server limit"],
    [candidateBackend.includes("offset: z.coerce.number().int().min(0).default(0)"), "bounded server offset"],
    [candidateBackend.includes("LIMIT $${limitParam}") && candidateBackend.includes("OFFSET $${offsetParam}"), "bound SQL range"],
    [candidateBackend.includes("COUNT(*)::int AS total,"), "exact filtered total"],
    [candidateBackend.includes("COUNT(*) FILTER (WHERE severe_count > 0)::int AS severe"), "full-set KPI counts"],
    [candidateBackend.includes("load_id ASC") && candidateBackend.includes("unit_id ASC"), "stable page tie-breakers"],
    [!candidateBackend.includes("LIMIT 300"), "silent 300 cap removed"],
    [arrivingSoonApi.includes("limit?: number") && arrivingSoonApi.includes("\n  offset?: number;"), "typed API range"],
    [candidatePage.includes("offset: (page - 1) * pageSize"), "page reaches API"],
    [candidatePage.includes('data-testid="maint-arriving-soon-pager"'), "visible exact pager"],
    [candidatePage.includes("setPage(1)") && candidatePage.includes("operatingCompanyId, withinHours, severityMin"), "filter/company reset"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("LIMIT $${limitParam}", "LIMIT 300"), api, page],
    [backend.replace("COUNT(*)::int AS total", "300::int AS total"), api, page],
    [backend.replace("load_id ASC", "load_id DESC_NULL"), api, page],
    [backend, api.replace("\n  offset?: number;\n  recent_limit?: number;", "\n  offsetValue?: number;\n  recent_limit?: number;"), page],
    [backend, api, page.replace('data-testid="maint-arriving-soon-pager"', 'data-testid="missing-pager"')],
    [backend, api, page.replace("setPage(1)", "void page")],
  ];
  const escaped = mutations.filter(([b, a, p]) => problems(b, a, p).length === 0);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped`);
  console.log(`verify-maintenance-arriving-soon-exact-range selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-maintenance-arriving-soon-exact-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-arriving-soon-exact-range PASS — exact filtered KPIs and deterministic server range replace silent 300-row truncation");
