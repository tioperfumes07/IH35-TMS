#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const servicePath = "apps/backend/src/safety/photo-comparison/session.service.ts";
const routePath = "apps/backend/src/safety/photo-comparison/routes.ts";
const pagePath = "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx";

function verify(service, route, page) {
  const errors = [];
  const requirePattern = (source, pattern, message) => {
    if (!pattern.test(source)) errors.push(message);
  };

  requirePattern(service, /COUNT\(\*\)::text AS total_count[\s\S]*WHERE \$\{clauses\.join\(" AND "\)\}/, "service must compute an exact filtered total");
  requirePattern(service, /LIMIT \$\$\{pageValues\.length - 1\}[\s\S]*OFFSET \$\$\{pageValues\.length\}/, "service must page with bound limit and offset");
  if (/LIMIT 200/.test(service)) errors.push("service must not restore the silent 200-session cap");
  requirePattern(route, /limit: z\.coerce\.number\(\).*max\(300\)\.default\(50\)/, "route must validate a bounded page size");
  requirePattern(route, /total_count: result\.totalCount/, "route must return the exact total");
  requirePattern(page, /queryKey: \["photo-comparison-sessions", companyId, page\]/, "frontend cache key must own the server page");
  requirePattern(page, /limit=\$\{PAGE_SIZE\}&offset=\$\{page \* PAGE_SIZE\}/, "frontend must request the selected server page");
  requirePattern(page, /pageSize=\{PAGE_SIZE\}[\s\S]*hidePager/, "ParityTable local pager must be disabled");
  requirePattern(page, /\{page \* PAGE_SIZE \+ 1\}–\{Math\.min\(\(page \+ 1\) \* PAGE_SIZE, totalCount\)\} of \{totalCount\}/, "frontend must disclose the exact server range");
  requirePattern(page, /useEffect\(\(\) => setPage\(0\), \[companyId\]\)/, "company changes must reset paging");
  requirePattern(page, /@matrix-built\s+safety:photo_comparison\.list:\{connectivity,qbo_chrome\}/, "leaf-specific Built evidence is required");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const service = fs.readFileSync(path.join(root, servicePath), "utf8");
  const route = fs.readFileSync(path.join(root, routePath), "utf8");
  const page = fs.readFileSync(path.join(root, pagePath), "utf8");
  const mutations = [
    [service.replace("COUNT(*)::text AS total_count", "COUNT(*) AS removed_total"), route, page],
    [service.replace("LIMIT $${pageValues.length - 1}", "LIMIT 200"), route, page],
    [service, route.replace("total_count: result.totalCount", "total_count: result.sessions.length"), page],
    [service, route, page.replace(", page]", "]")],
    [service, route, page.replace("hidePager", "")],
    [service, route, page.replace(" of {totalCount}", "")],
    [service, route, page.replace("useEffect(() => setPage(0), [companyId]);", "")],
  ];
  const missed = mutations.filter(([s, r, p]) => verify(s, r, p).length === 0).length;
  if (missed) {
    console.error(`verify-safety-photo-comparison-exact-paging selftest FAIL: ${missed}/${mutations.length} mutations survived`);
    process.exit(1);
  }
  console.log(`verify-safety-photo-comparison-exact-paging selftest PASS: ${mutations.length}/${mutations.length} mutations rejected`);
  process.exit(0);
}

const errors = verify(
  fs.readFileSync(path.join(root, servicePath), "utf8"),
  fs.readFileSync(path.join(root, routePath), "utf8"),
  fs.readFileSync(path.join(root, pagePath), "utf8"),
);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-safety-photo-comparison-exact-paging PASS");
