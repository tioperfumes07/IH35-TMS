#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/insurance/claim.routes.ts", "utf8");
const start = source.indexOf('app.patch("/api/v1/insurance/claims/:id"');
const block = start < 0 ? "" : source.slice(start);
const checks = [
  [/app\.patch\("\/api\/v1\/insurance\/claims\/:id", \{ config: \{ rateLimit:/, "update rate limit"],
  [/const clearedReverse = await client\.query/, "capture prior accident unlink"],
  [/insurance_claim_prior_accident_reverse_unlink_failed/, "prior accident unlink fails loud"],
  [/const linkedReverse = await client\.query/, "capture new accident backlink"],
  [/insurance_claim_accident_reverse_link_failed/, "new accident backlink fails loud"],
  [/const claim = result\.rows\[0\]/, "capture canonical updated claim detail"],
  [/insurance_claim_update_detail_read_failed/, "missing detail reload fails loud"],
  [/"insurance\.claim\.updated"/, "update audit event"],
  [/resource_id: claim\.id/, "audit proven claim identity"],
  [/"insurance\.claim\.updated"[\s\S]{0,500}operating_company_id: query\.data\.operating_company_id/, "audit selected company"],
];

function failures(text) {
  return checks.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}
const missing = failures(block);
if (missing.length) {
  console.error(`FAIL verify-insurance-claim-update-atomic-truth: ${missing.join("; ")}`);
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
  console.log(`PASS verify-insurance-claim-update-atomic-truth --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-insurance-claim-update-atomic-truth");
