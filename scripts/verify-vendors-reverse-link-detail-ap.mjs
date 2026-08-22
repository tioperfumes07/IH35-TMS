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
  { name: "bill EntityLink", pattern: /kind="bill"/ },
  { name: "expense EntityLink", pattern: /kind="expense"/ },
  { name: "bill_payment EntityLink", pattern: /kind="bill_payment"/ },
  { name: "VendorApAgingSection mount", pattern: /VendorApAgingSection/ },
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
  const planted = run("// poison");
  if (planted.length < CHECKS.length) {
    console.error(`${LABEL} SELFTEST FAIL poison`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
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
