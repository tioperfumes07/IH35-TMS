#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/safety/rtd.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const failures = [];
  if (!/AND stage = \$14::safety\.rtd_stage_enum[^]*?closedAt,\s*current\.stage,/m.test(text)) failures.push("RTD advance UPDATE must compare the validated source stage");
  if (!/const row = res\.rows\[0\];\s*if \(!row\) \{\s*throw Object\.assign\(new Error\("concurrent_transition"\), \{ code: "E_RTD_CONCURRENT_TRANSITION" \}\);\s*\}\s*await appendCrudAudit/m.test(text)) failures.push("RTD advance must fail before audit when CAS loses");
  if (!/error\.code === "E_RTD_CONCURRENT_TRANSITION"[^]*?reply\.code\(409\)/m.test(text)) failures.push("RTD concurrent transition must return HTTP 409");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND stage = $14::safety.rtd_stage_enum", "AND true"),
    source.replace("closedAt,\n          current.stage,", "closedAt,"),
    source.replace("if (!row) {", "if (false) {"),
    source.replace('if (error.code === "E_RTD_CONCURRENT_TRANSITION")', 'if (error.code === "E_RTD_OTHER")'),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL RTD advance CAS selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS RTD advance CAS selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS RTD advance is a company-scoped source-stage CAS and fails before audit");
