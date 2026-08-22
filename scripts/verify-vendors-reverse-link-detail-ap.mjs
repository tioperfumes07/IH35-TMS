#!/usr/bin/env node
/**
 * Vendors reverse_link — Built for detail A/P leaves with EntityLink on VendorDetail.
 * List/profile chrome + docs/audit/tasks/w9 + credits honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.ap(\\.(bills|expenses|bill_payments))?$","task":"VERTICAL-REVERSE-LINK-vendors-detail-ap","vertical":"column-wave"}
 * @matrix-built {"modules":["vendors"],"cols":["expense"],"leafRe":"^detail\\.ap(\\.expenses)?$","task":"BOX3-VENDORS-DETAIL-AP-EXPENSE","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-vendors-reverse-link-detail-ap.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendors-reverse-link-detail-ap";
const FILE = "apps/frontend/src/pages/VendorDetail.tsx";

const CHECKS = [
  { name: "bill EntityLink", pattern: /render: \(b\) => <EntityLink kind="bill" id=\{b\.id\} label=\{entityLabel\(b\.bill_number, b\.id, "Record"\)\} \/>/ },
  { name: "expense EntityLink", pattern: /render: \(e\) => \([\s\S]{0,100}<EntityLink kind="expense" id=\{e\.id\} label=\{entityLabel\(e\.expense_number, e\.id, "Record"\)\} \/>/ },
  { name: "bill_payment EntityLink", pattern: /render: \(p\) => \([\s\S]{0,100}<EntityLink kind="bill_payment" id=\{p\.id\} label=\{entityLabel\(p\.reference, p\.id, "Payment"\)\} \/>/ },
  { name: "VendorApAgingSection mount", pattern: /<VendorApAgingSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/ },
  {
    name: "archived vendor 404 honesty",
    pattern: /vendorQuery\.error instanceof ApiError && vendorQuery\.error\.status === 404[\s\S]*This vendor is archived or is not available in the selected company[\s\S]*Historical transactions remain preserved/,
  },
];

function run(src) {
  return CHECKS.filter((c) => !c.pattern.test(src)).map((c) => c.name);
}

if (process.argv.includes("--selftest")) {
  const abs = path.join(ROOT, FILE);
  const live = fs.readFileSync(abs, "utf8");
  const liveFails = run(live);
  if (liveFails.length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${liveFails.join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const check of CHECKS) {
    const mutant = live.replace(check.pattern, "/* planted defect */");
    if (mutant === live || !run(mutant).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — escaped or inert plant: ${check.name}`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${CHECKS.length} production-source mutations rejected`);
  process.exit(0);
}

const abs = path.join(ROOT, FILE);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const fails = run(fs.readFileSync(abs, "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — vendors detail A/P reverse_link ratcheted`);
