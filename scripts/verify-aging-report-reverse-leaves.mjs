#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^report\\.(ar_aging|ap_aging)$","task":"AGING-REPORT-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^detail\\.billing$","task":"AGING-REPORT-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.ap$","task":"AGING-REPORT-REVERSE-LEAVES","vertical":"column-wave"} */

import fs from "node:fs";
const sources = {
  ar: fs.readFileSync("apps/frontend/src/pages/reports/ARAgingPage.tsx", "utf8"),
  ap: fs.readFileSync("apps/frontend/src/pages/reports/APAgingPage.tsx", "utf8"),
};
const checks = [
  ["ar", /getArAgingReport\(companyId, appliedAsOf\)/, "AR read is company-scoped"],
  ["ar", /kind="customer" id=\{r\.customer_id\}/, "AR rows drill to customer"],
  ["ar", /arAgingInvoiceListHref\(r\.customer_id\)/, "AR rows drill to filtered invoices"],
  ["ar", /Couldn't load A\/R aging[\s\S]*query\.refetch\(\)/, "AR failures are retryable"],
  ["ap", /getApAgingReport\(companyId, appliedAsOf\)/, "AP read is company-scoped"],
  ["ap", /kind="vendor" id=\{r\.vendor_id\}/, "AP rows drill to vendor"],
  ["ap", /apAgingBillsListHref\(r\.vendor_id\)/, "AP rows drill to filtered bills"],
  ["ap", /Couldn't load A\/P aging[\s\S]*query\.refetch\(\)/, "AP failures are retryable"],
];
const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) { console.error(`verify-aging-report-reverse-leaves: FAIL — ${found.join("; ")}`); process.exit(1); }
if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(new RegExp(pattern.source, `${pattern.flags}g`), "/* planted defect */") };
    if (!failures(mutant).includes(label)) { console.error(`verify-aging-report-reverse-leaves: SELF-TEST FAIL — ${label}`); process.exit(1); }
  }
  console.log(`verify-aging-report-reverse-leaves: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}
console.log(`verify-aging-report-reverse-leaves: PASS — ${checks.length} aging reverse invariants`);
