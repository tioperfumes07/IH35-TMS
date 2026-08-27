#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/tires.routes.ts";
const source = fs.readFileSync(path, "utf8");
const block = source.match(/app\.post\("\/api\/v1\/maintenance\/tires\/replace"[\s\S]*?app\.post\("\/api\/v1\/maintenance\/tires\/tread-audit"/)?.[0] ?? "";
const checks = [
  [/INSERT INTO maintenance\.tire_records \([\s\S]*?RETURNING id/, "replacement insert returns identity"],
  [/const newId = insert\.rows\[0\]\?\.id == null \? null : String\(insert\.rows\[0\]\.id\)/, "identity is not stringified from undefined"],
  [/if \(!newId\) throw new Error\("tire_replacement_insert_returned_no_row"\)/, "empty insert fails loud"],
  [/newId,[\s\S]*?body\.brand_id/, "event uses proven replacement identity"],
  [/new_record_id: newId/, "audit uses proven replacement identity"],
  [/fetchRecordById\(client, body\.operating_company_id, newId\)/, "response reload uses proven identity"],
];
const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(block);
if (missing.length) {
  console.error(`FAIL verify-tire-replacement-created-identity: ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = block.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-tire-replacement-created-identity --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-tire-replacement-created-identity");
