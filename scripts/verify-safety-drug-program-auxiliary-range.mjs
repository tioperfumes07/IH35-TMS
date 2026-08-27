#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","connectivity","reverse_link"],"leaves":["drug_alcohol.list"],"task":"SAFETY-F6873-DRUG-PROGRAM-AUXILIARY-HISTORY-SILENT-500-CAP","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  route: fs.readFileSync("apps/backend/src/safety/drug-program.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  tab: fs.readFileSync("apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", "utf8"),
};
const checks = [
  ["route", /const historyListQuerySchema = companyQuerySchema\.extend\([\s\S]*max\(200\)\.default\(50\)[\s\S]*offset:/, "bounded shared history schema"],
  ["route", /FROM safety\.random_pool[\s\S]*count\(\*\)::int AS total_count|count\(\*\)::int AS total_count[\s\S]*FROM safety\.random_pool/, "random pool exact count"],
  ["route", /FROM safety\.clearinghouse_query[\s\S]*count\(\*\)::int AS total_count|count\(\*\)::int AS total_count[\s\S]*FROM safety\.clearinghouse_query/, "clearinghouse exact count"],
  ["route", /ORDER BY p\.selected_at DESC, p\.created_at DESC[\s\S]*LIMIT \$2::int OFFSET \$3::int/, "random pool server range"],
  ["route", /ORDER BY q\.queried_at DESC[\s\S]*LIMIT \$2::int OFFSET \$3::int/, "clearinghouse server range"],
  ["route", /random_pools: rows\.rows, total_count: rows\.total_count/, "random pool total response"],
  ["route", /clearinghouse_queries: rows\.rows, total_count: rows\.total_count/, "clearinghouse total response"],
  ["api", /listRandomPoolEntries\(companyId: string, range: \{ limit\?: number; offset\?: number \}/, "random pool typed range"],
  ["api", /listClearinghouseQueries\(companyId: string, range: \{ limit\?: number; offset\?: number \}/, "clearinghouse typed range"],
  ["tab", /data-testid="drug-alcohol-pool-server-pager"/, "random pool mounted pager"],
  ["tab", /data-testid="drug-alcohol-clearinghouse-server-pager"/, "clearinghouse mounted pager"],
  ["tab", /setPoolPage\(0\); setClearinghousePage\(0\)/, "company scope reset"],
];

function failures(source) {
  return checks.filter(([key, pattern]) => !pattern.test(source[key])).map(([, , label]) => label);
}
const failed = failures(files);
if (failed.length) {
  console.error(`FAIL verify-safety-drug-program-auxiliary-range: ${failed.join(", ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(pattern, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-safety-drug-program-auxiliary-range --selftest (${checks.length}/${checks.length} mutations killed)`);
} else {
  console.log(`PASS verify-safety-drug-program-auxiliary-range (${checks.length}/${checks.length} checks)`);
}
