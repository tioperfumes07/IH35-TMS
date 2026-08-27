#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const source = {
  route: fs.readFileSync("apps/backend/src/safety/company-violations.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/CompanyViolationsPage.tsx", "utf8"),
};
function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/companyViolationListQuerySchema[\s\S]{0,300}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "company-violation list must validate range");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,220}FROM safety\.company_violations cv/.test(s.route), "company-violation list must count filtered graph");
  need(/LIMIT \$4 OFFSET \$5/.test(s.route) && /company_violations: result\.rows, total_count: result\.total_count/.test(s.route), "company-violation list must return page and total");
  need(/limit\?: number; offset\?: number/.test(s.api) && /company_violations: Array<Record<string, unknown>>; total_count: number/.test(s.api), "company-violation client must type range");
  need(/offset: \(page - 1\) \* pageSize/.test(s.page) && /data-testid="company-violations-server-pager"/.test(s.page), "mounted register must navigate server pages");
  need(/pageSize=\{pageSize\}[\s\S]{0,100}\bhidePager\b/.test(s.page), "mounted register must hide local slice pager");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace("LIMIT $4 OFFSET $5", "LIMIT 500") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, page: source.page.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, page: source.page.replace('data-testid="company-violations-server-pager"', 'data-testid="removed-pager"') },
    { ...source, page: source.page.replace("hidePager", "showPager") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) { console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`); process.exit(1); }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} company-violation range mutations detected`); process.exit(0);
}
const failures = check(source);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("PASS: Company Violations exposes the complete scoped driver/unit reverse range");
