#!/usr/bin/env node
/**
 * SCENARIO-AP-INSURANCE-HONEST — tag proven Bill payment hop + accident→claim;
 * cargo claims must NOT claim scenario.insurance (incidents cluster, not insurance.claim).
 *
 * @matrix-built {"modules":["vendors"],"cols":["scenario.ap"],"leafRe":"^(md\\.header\\.new_transaction|detail\\.ap\\.(record_bill_payment|bill_payments))$","task":"SCENARIO-AP-vendors","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["scenario.insurance"],"leafRe":"^(accidents\\.create|insurance_tab\\.list)$","task":"SCENARIO-INS-accidents","vertical":"column-wave"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-scenario-ap-insurance-honest";

const CHECKS = [
  { name: "vendor bill payment record", file: "apps/frontend/src/pages/VendorDetail.tsx", pattern: /recordVendorBillPayment/ },
  { name: "vendor bill payments list", file: "apps/frontend/src/pages/VendorDetail.tsx", pattern: /listVendorBillPayments/ },
  { name: "accident claim EntityLink", file: "apps/frontend/src/pages/safety/AccidentsPage.tsx", pattern: /kind=["']claim["']/ },
  { name: "insurance tab claims nav", file: "apps/frontend/src/pages/safety/tabs/InsuranceTab.tsx", pattern: /insurance\/claims/ },
];

function checkAll(read) {
  const fails = [];
  for (const c of CHECKS) {
    const src = read(c.file);
    if (src == null) fails.push(`missing ${c.file}`);
    else if (!c.pattern.test(src)) fails.push(`${c.name} missing in ${c.file}`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});

const safety = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/modules/safety.required.json"), "utf8"),
);
const cargo = (safety.leaves || []).find((l) => l.id === "cargo_claims.create");
if (cargo && (cargo.required || []).includes("scenario.insurance")) {
  failures.push("cargo_claims.create must NOT require scenario.insurance (incidents ≠ insurance.claim)");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — scenario.ap vendors + scenario.insurance accidents tagged; cargo DROP held`);
