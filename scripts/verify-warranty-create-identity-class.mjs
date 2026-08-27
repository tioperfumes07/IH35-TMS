#!/usr/bin/env node
import fs from "node:fs";

const path = "apps/backend/src/maintenance/warranty.routes.ts";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const id = res\.rows\[0\]\?\.id == null \? null : String\(res\.rows\[0\]\.id\);\s*if \(!id\) throw new Error\("parts_warranty_insert_returned_no_row"\)/, "part insert identity"],
  [/const createdPart = fetched\.rows\[0\];\s*if \(!createdPart\) throw new Error\("parts_warranty_reload_returned_no_row"\)/, "part reload identity"],
  [/return createdPart;/, "part response uses proven row"],
  [/const id = res\.rows\[0\]\?\.id == null \? null : String\(res\.rows\[0\]\.id\);\s*if \(!id\) throw new Error\("warranty_claim_insert_returned_no_row"\)/, "claim insert identity"],
  [/if \(!fetched\) throw new Error\("warranty_claim_reload_returned_no_row"\)/, "claim reload identity"],
  [/const claimId = insert\.rows\[0\]\?\.id == null \? null : String\(insert\.rows\[0\]\.id\)/, "detected claim insert identity"],
  [/if \(!claimId\) throw new Error\("warranty_detect_claim_insert_returned_no_row"\)/, "detected claim insert fails loud"],
  [/if \(!claim\) throw new Error\("warranty_detect_claim_reload_returned_no_row"\)/, "detected claim reload fails loud"],
  [/created\.push\(mapWarrantyClaimRow\(claim\)\)/, "every detected claim is returned"],
  [/created_count: created\.length/, "audit reports proven created count"],
];
const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`FAIL verify-warranty-create-identity-class: ${missing.join("; ")}`);
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
  console.log(`PASS verify-warranty-create-identity-class --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-warranty-create-identity-class");
