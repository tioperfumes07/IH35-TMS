#!/usr/bin/env node
import fs from "node:fs";
const paths = ["apps/backend/src/maintenance/compliance.routes.ts", "apps/frontend/src/api/maintenance.ts", "apps/frontend/src/pages/maintenance/compliance/Compliance425CPage.tsx"];
const sources = paths.map((path) => fs.readFileSync(path, "utf8"));
function verify(route, api, page) {
  const errors = [];
  const need = (source, regex, message) => { if (!regex.test(source)) errors.push(message); };
  need(route, /limit: z\.coerce\.number\(\).*max\(200\)\.default\(50\)[\s\S]*offset: z\.coerce\.number\(\).*default\(0\)/, "route must validate range");
  need(route, /const predicate = `payload->>'operating_company_id' = \$1[\s\S]*event_class ILIKE '%425c%'/, "one company/event predicate must govern count and page");
  need(route, /SELECT COUNT\(\*\)::int AS total_count FROM audit\.audit_events WHERE \$\{predicate\}/, "route needs exact count");
  need(route, /WHERE \$\{predicate\}[\s\S]*ORDER BY created_at DESC, uuid DESC[\s\S]*LIMIT \$2 OFFSET \$3/, "route needs deterministic bound page");
  if (/LIMIT 200/.test(route)) errors.push("silent cap must stay removed");
  need(api, /listMaintenanceCompliance425cLog\(operatingCompanyId: string, range:[\s\S]*limit: String\(range\.limit \?\? 50\)[\s\S]*offset: String\(range\.offset \?\? 0\)[\s\S]*total_count: number/, "typed client must carry exact range and total");
  need(page, /queryKey: \["maintenance", "compliance-425c", companyId, page\]/, "query identity must include company and page");
  need(page, /limit: PAGE_SIZE, offset: page \* PAGE_SIZE/, "page must request server range");
  need(page, /maintenance-compliance-425c-pager[\s\S]*Previous[\s\S]*Next/, "page needs controlled exact pager");
  need(page, /useEffect\(\(\) => setPage\(0\), \[companyId\]\)/, "company transition must reset page");
  need(page, /ListErrorState[\s\S]*onRetry/, "error recovery must stay mounted");
  return errors;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [sources[0].replace("default(50)", "default(200)"), sources[1], sources[2]],
    [sources[0].replace("COUNT(*)::int AS total_count", "COUNT(*) AS removed"), sources[1], sources[2]],
    [sources[0].replace("ORDER BY created_at DESC, uuid DESC", "ORDER BY created_at DESC"), sources[1], sources[2]],
    [sources[0].replace("LIMIT $2 OFFSET $3", "LIMIT 200"), sources[1], sources[2]],
    [sources[0], sources[1].replaceAll("range.limit ?? 50", "200"), sources[2]],
    [sources[0], sources[1].replaceAll("total_count: number", ""), sources[2]],
    [sources[0], sources[1], sources[2].replace(", page]", "]")],
    [sources[0], sources[1], sources[2].replace("offset: page * PAGE_SIZE", "offset: 0")],
    [sources[0], sources[1], sources[2].replace("maintenance-compliance-425c-pager", "removed")],
    [sources[0], sources[1], sources[2].replace("useEffect(() => setPage(0), [companyId]);", "")],
    [sources[0], sources[1], sources[2].replace("onRetry={() => void listQ.refetch()}", "")],
  ];
  const survived = mutations.map((args, i) => verify(...args).length === 0 ? i + 1 : null).filter(Boolean);
  if (survived.length) { console.error(`selftest FAIL: ${survived.join(",")} survived`); process.exit(1); }
  console.log(`verify-maintenance-compliance-425c-exact-range selftest PASS: ${mutations.length}/${mutations.length} rejected`); process.exit(0);
}
const errors = verify(...sources);
if (errors.length) { console.error(errors.map((e) => `- ${e}`).join("\n")); process.exit(1); }
console.log("verify-maintenance-compliance-425c-exact-range PASS");
