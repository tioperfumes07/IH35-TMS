#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/drug-program.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", "utf8"),
  table: fs.readFileSync("apps/frontend/src/pages/safety/components/DrugAlcoholTable.tsx", "utf8"),
};

function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/drugTestsListQuerySchema[\s\S]{0,520}driver_id:[\s\S]{0,420}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "drug-test list must validate filters and bounded range");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,240}FROM safety\.drug_test t/.test(s.route), "drug-test list must count identical scope");
  need(/addFilter\(company\.data\.driver_id[\s\S]{0,360}addFilter\(company\.data\.to/.test(s.route), "all visible filters must be server-side before count/select");
  need(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(s.route) && /tests: result\.rows, total_count: result\.total_count/.test(s.route), "drug-test list must return selected page and total");
  need(/listDrugProgramTests\(companyId: string, filters:/.test(s.api) && /tests: DrugProgramTest\[\]; total_count: number/.test(s.api), "drug-test client must type filtered range");
  need(/offset: \(historyPage - 1\) \* pageSize/.test(s.page) && /data-testid="drug-alcohol-tests-server-pager"/.test(s.page), "mounted history must request and navigate server pages");
  need(/<ParityTable<Row>/.test(s.table) && /hidePager=\{hidePager\}/.test(s.table), "history slice must not expose a contradictory local pager");
  need(!/const filteredTests = useMemo/.test(s.page), "mounted history must not client-filter a server slice");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/, "LIMIT 500") },
    { ...source, route: source.route.replace("addFilter(company.data.driver_id", "skipFilter(company.data.driver_id") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, page: source.page.replace('data-testid="drug-alcohol-tests-server-pager"', 'data-testid="removed-pager"') },
    { ...source, table: source.table.replace("hidePager={hidePager}", "hidePager={false}") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) {
    console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} drug-test range mutations detected`);
  process.exit(0);
}

const failures = check(source);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: Drug & Alcohol history exposes the complete filtered server range");
