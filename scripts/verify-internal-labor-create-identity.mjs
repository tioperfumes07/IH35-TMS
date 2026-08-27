#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/internal-labor.routes.ts", "utf8");
const checks = [
  [/const createdLabor = rows\[0\]/, "capture canonical inserted labor row"],
  [/if \(!createdLabor\?\.id\) throw new Error\("internal_labor_create_returned_no_row"\)/, "empty INSERT must fail loud"],
  [/resource_id: createdLabor\.id/, "audit must use proven labor identity"],
  [/return createdLabor/, "HTTP 201 path must return proven labor row"],
  [/if \(!linked\.rows\[0\]\) return null/, "invalid WO-unit link retains distinct validation path"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-internal-labor-create-identity: ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-internal-labor-create-identity --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-internal-labor-create-identity");
