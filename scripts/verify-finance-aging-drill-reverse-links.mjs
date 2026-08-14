#!/usr/bin/env node
/** @matrix-built {"modules":["finance"],"cols":["reverse_link"],"leafRe":"^nav\\.ar_ap_aging$","task":"LINK-F5129-FINANCE-AGING-DRILL-REVERSE","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  page: fs.readFileSync("apps/frontend/src/pages/finance/ArApAgingPage.tsx", "utf8"),
  routes: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["page", /Open invoices — <EntityLink kind="customer" id=\{customer\.customer_id\}/, "AR drill header links to its canonical customer"],
  ["page", /Open bills — <EntityLink kind="vendor" id=\{vendor\.vendor_id\}/, "AP drill header links to its canonical vendor"],
  ["page", /getArAgingInvoices\(operatingCompanyId, customer\.customer_id, asOfDate\)/, "AR reverse drill remains company-scoped and customer-filtered"],
  ["page", /getApAgingBills\(operatingCompanyId, vendor\.vendor_id, asOfDate\)/, "AP reverse drill remains company-scoped and vendor-filtered"],
  ["routes", /path="\/finance\/ar-ap-aging"[\s\S]*?<ArApAgingPage \/>/, "Finance aging leaf remains mounted"],
  ["entityLink", /case "customer":[\s\S]*?return `\/customers\/\$\{id\}`/, "customer link resolves to the canonical detail route"],
  ["entityLink", /case "vendor":[\s\S]*?return `\/vendors\/\$\{id\}`/, "vendor link resolves to the canonical detail route"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-finance-aging-drill-reverse-links: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-finance-aging-drill-reverse-links: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-finance-aging-drill-reverse-links: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-finance-aging-drill-reverse-links: PASS — ${checks.length} exact Finance aging reverse-link invariants`);
