#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/routes/safety/dot-inspections.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safetyV64.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", "utf8"),
};

function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/dotInspectionsListQuerySchema[\s\S]{0,420}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,120}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "DOT list must validate bounded pagination");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,260}FROM safety\.dot_inspections di/.test(s.route), "DOT list must count identical filtered scope");
  // REPOINTED (ROUND 443.187): 5463e8bbcc "FINDING: SAF-F2026100506 ... three safety list routes
  // handed the count query an array they then mutated for the page query (#25497)" gave the page
  // query its own array (`listValues = [...values, limit, offset]`) so the count query's `values`
  // is never mutated. Same rule: the page is bounded by the validated limit/offset and the exact
  // total is returned alongside it.
  need(/const listValues = \[\.\.\.values, query\.data\.limit, query\.data\.offset\]/.test(s.route) && /LIMIT \$\$\{listValues\.length - 1\} OFFSET \$\$\{listValues\.length\}/.test(s.route) && /dot_inspections: result\.rows, total_count: result\.total_count/.test(s.route), "DOT list must return page and exact total");
  need(/limit\?: number; offset\?: number/.test(s.api) && /dot_inspections: Array<Record<string, unknown>>; total_count: number/.test(s.api), "DOT client must type range contract");
  need(/limit: pageSize,[\s\S]{0,100}offset: \(page - 1\) \* pageSize/.test(s.page), "DOT register must request selected server page");
  need(/data-testid="dot-inspections-server-pager"/.test(s.page) && /pageSize=\{pageSize\}[\s\S]{0,120}\bhidePager\b/.test(s.page), "DOT register must render one authoritative pager");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace(/LIMIT \$\$\{listValues\.length - 1\} OFFSET \$\$\{listValues\.length\}/, "LIMIT 500") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, page: source.page.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, page: source.page.replace('data-testid="dot-inspections-server-pager"', 'data-testid="removed-pager"') },
    { ...source, page: source.page.replace("hidePager", "showPager") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) {
    console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} DOT inspection range mutations detected`);
  process.exit(0);
}

const failures = check(source);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: DOT inspections expose complete scoped server range");
