#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/reefer-hours.routes.ts";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/FROM mdata\.equipment WHERE id = \$1[\s\S]*?deactivated_at IS NULL LIMIT 1/, "specs reject inactive trailer"],
  [/const specsId = insert\.rows\[0\]\?\.id == null \? null : String\(insert\.rows\[0\]\.id\)/, "specs insert identity"],
  [/if \(!specsId\) throw new Error\("reefer_specs_insert_returned_no_row"\)/, "specs insert fails loud"],
  [/if \(!createdSpecs\) throw new Error\("reefer_specs_reload_returned_no_row"\)/, "specs reload fails loud"],
  [/return createdSpecs;/, "specs returns proven row"],
  [/const id = res\.rows\[0\]\?\.id == null \? null : String\(res\.rows\[0\]\.id\)/, "log insert identity"],
  [/if \(!id\) throw new Error\("reefer_hours_log_insert_returned_no_row"\)/, "log insert fails loud"],
  [/if \(!createdLog\) throw new Error\("reefer_hours_log_reload_returned_no_row"\)/, "log reload fails loud"],
  [/return createdLog;/, "log returns proven row"],
  [/if \(!row\) return reply\.code\(409\)\.send\(\{ error: "duplicate_reading" \}\)/, "dedupe response remains explicit"],
];
const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-reefer-persistence-identity-class: ${missing.join("; ")}`);
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
  console.log(`PASS verify-reefer-persistence-identity-class --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-reefer-persistence-identity-class");
