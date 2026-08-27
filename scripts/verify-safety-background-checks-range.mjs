#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const source = {
  route: fs.readFileSync("apps/backend/src/safety/background-checks.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/safety/BackgroundChecksSection.tsx", "utf8"),
};
function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/companyQuerySchema[\s\S]{0,280}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "background-check list must validate range");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,220}FROM safety\.background_checks bc/.test(s.route), "background-check list must count identical scope");
  need(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(s.route) && /background_checks: result\.rows, total_count: result\.total_count/.test(s.route), "background-check list must return page and total");
  need(/range: \{ limit\?: number; offset\?: number \}/.test(s.api) && /background_checks: SafetyBackgroundCheckRow\[\]; total_count: number/.test(s.api), "background-check client must type range");
  need(/offset: \(page - 1\) \* pageSize/.test(s.section) && /data-testid="background-checks-server-pager"/.test(s.section), "shared history must navigate server pages");
  need(/pageSize=\{pageSize\}[\s\S]{0,100}\bhidePager\b/.test(s.section), "shared history must hide local slice pager");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/, "LIMIT 500") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, section: source.section.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, section: source.section.replace('data-testid="background-checks-server-pager"', 'data-testid="removed-pager"') },
    { ...source, section: source.section.replace("hidePager", "showPager") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) { console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`); process.exit(1); }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} background-check range mutations detected`); process.exit(0);
}
const failures = check(source);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("PASS: Safety and Driver background-check histories expose the complete scoped range");
