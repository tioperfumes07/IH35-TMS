#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/pre-flight/dvir-severity.service.ts";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const createdTag = res\.rows\[0\]/, "capture canonical inserted severity tag"],
  [/if \(!createdTag\?\.id\) throw new Error\("dvir_severity_tag_insert_returned_no_row"\)/, "empty tag INSERT must fail loud"],
  [/return \{ id: createdTag\.id \}/, "callers receive only proven tag identity"],
  [/resource_id: tag\.id/, "override audit retains canonical tag backlink"],
  [/return \{ ok: true, tag_id: tag\.id/, "override success retains canonical tag identity"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}

const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-dvir-severity-tag-identity: ${missing.join("; ")}`);
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
  console.log(`PASS verify-dvir-severity-tag-identity --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-dvir-severity-tag-identity");
