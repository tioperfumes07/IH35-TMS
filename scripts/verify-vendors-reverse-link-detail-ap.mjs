#!/usr/bin/env node
/**
 * Vendors reverse_link — Built for detail A/P leaves with EntityLink on VendorDetail.
 * List/profile chrome + docs/audit/tasks/w9 + credits honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leaves":["detail.ap.bills","detail.ap.expenses","detail.ap.bill_payments"],"task":"VEND-F5869-AP-REVERSE-EXACT-LEAVES","vertical":"column-wave"}
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
const MATRIX = "docs/specs/scoreboard/modules/vendors.required.json";
const SELF = "scripts/verify-vendors-reverse-link-detail-ap.mjs";
const HEADER = ' * @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leaves":["detail.ap.bills","detail.ap.expenses","detail.ap.bill_payments"],"task":"VEND-F5869-AP-REVERSE-EXACT-LEAVES","vertical":"column-wave"}';
const LEAVES = ["detail.ap.bills", "detail.ap.expenses", "detail.ap.bill_payments"];

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

function run(src, matrix, self) {
  const failures = CHECKS.filter((c) => !c.pattern.test(src)).map((c) => c.name);
  try {
    const parsed = JSON.parse(matrix);
    for (const id of LEAVES) if (!parsed.leaves?.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) failures.push(`exact Required ownership: ${id}`);
  } catch { failures.push("vendors Required matrix parses"); }
  if (!self.split("\n").includes(HEADER)) failures.push("exact AP reverse Built annotation");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const abs = path.join(ROOT, FILE);
  const live = fs.readFileSync(abs, "utf8");
  const matrix = fs.readFileSync(path.join(ROOT, MATRIX), "utf8");
  const self = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  const liveFails = run(live, matrix, self);
  if (liveFails.length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${liveFails.join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const check of CHECKS) {
    const mutant = live.replace(check.pattern, "/* planted defect */");
    if (mutant === live || !run(mutant, matrix, self).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — escaped or inert plant: ${check.name}`);
      process.exit(1);
    }
    caught += 1;
  }
  for (const id of LEAVES) {
    const mutant = matrix.replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (mutant === matrix || !run(live, mutant, self).includes(`exact Required ownership: ${id}`)) throw new Error(`Required mutation escaped: ${id}`);
    caught += 1;
  }
  const wrongHeader = self.replace('"leaves":["detail.ap.bills"', '"leaves":["detail.ap"');
  if (!run(live, matrix, wrongHeader).includes("exact AP reverse Built annotation")) throw new Error("header mutation escaped");
  caught += 1;
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${CHECKS.length + LEAVES.length + 1} runtime/matrix/header mutations rejected`);
  process.exit(0);
}

const abs = path.join(ROOT, FILE);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const fails = run(
  fs.readFileSync(abs, "utf8"),
  fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
  fs.readFileSync(path.join(ROOT, SELF), "utf8"),
);
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — vendors detail A/P reverse_link ratcheted`);
