#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/safety.routes.ts", "utf8"),
  aggregate: fs.readFileSync("apps/backend/src/mdata/driver-aggregate.service.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  register: fs.readFileSync("apps/frontend/src/pages/safety/TrainingRecordsPage.tsx", "utf8"),
  profile: fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx", "utf8"),
};

export function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/trainingCompletionsQuerySchema[\s\S]{0,220}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,120}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "training route must validate bounded pagination");
  need(/SELECT count\(\*\)::int AS total_count[\s\S]{0,220}FROM safety\.training_records/.test(s.route), "training route must count its filtered scope");
  need(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(s.route) && /training_completions: result\.rows, total_count: result\.total_count/.test(s.route), "training route must return selected page and exact total");
  need(/params: \{ driver_id\?: string; limit\?: number; offset\?: number \}/.test(s.api) && /training_completions: Array<Record<string, unknown>>; total_count: number/.test(s.api), "training client must type pagination and total");
  need(/limit: pageSize,[\s\S]{0,100}offset: \(page - 1\) \* pageSize/.test(s.register), "Safety register must request selected server page");
  need(/data-testid="training-records-server-pager"/.test(s.register) && /pageSize=\{pageSize\}[\s\S]{0,120}\bhidePager\b/.test(s.register), "Safety register must expose one server-total pager");
  need(/count\(\*\) OVER\(\)::int AS total_count[\s\S]{0,300}LIMIT 50/.test(s.aggregate) && /training_records_total_count/.test(s.aggregate), "Driver aggregate must disclose its preview total");
  need(/totalCount=\{aggregate\.training_records_total_count/.test(s.profile) && /driverId=\{id\}/.test(s.profile), "Driver profile must pass preview range identity");
  need(/Showing \{rows\.length\} of \{totalCount\} records/.test(s.section) && /\/safety\/training-records\?driver_id=\$\{encodeURIComponent\(driverId\)\}/.test(s.section), "Driver preview must disclose cap and link to canonical full register");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replaceAll("SELECT count(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace(/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/, "LIMIT 500") },
    { ...source, api: source.api.replaceAll("; total_count: number", "") },
    { ...source, register: source.register.replace('data-testid="training-records-server-pager"', 'data-testid="removed-pager"') },
    { ...source, aggregate: source.aggregate.replace("count(*) OVER()::int AS total_count", "0::int AS hidden_count") },
    { ...source, section: source.section.replace("Showing {rows.length} of {totalCount} records.", "Training records") },
  ];
  const escaped = mutations
    .map((mutation, index) => ({ index, failures: check(mutation) }))
    .filter(({ failures }) => failures.length === 0);
  if (escaped.length) {
    console.error(`FAIL(selftest): ${escaped.length} training-range mutation(s) escaped detection: ${escaped.map(({ index }) => index + 1).join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} training-range mutations detected`);
  process.exit(0);
}

const failures = check(source);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: Driver preview and Safety register expose the complete scoped training range");
