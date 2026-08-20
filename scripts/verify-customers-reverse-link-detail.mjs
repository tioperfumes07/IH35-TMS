#!/usr/bin/env node
/**
 * Customers reverse_link — Built for detail leaves with EntityLink on CustomerDetail.
 * Create/sync/edit/chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^detail\\.(profile|contacts|billing|quality|lanes|pnl)$","task":"VERTICAL-REVERSE-LINK-customers-detail","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-customers-reverse-link-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-reverse-link-detail";
const FILE = "apps/frontend/src/pages/CustomerDetail.tsx";

const CHECKS = [
  { name: "load EntityLink", pattern: /kind="load"/ },
  { name: "driver EntityLink", pattern: /kind="driver"/ },
  { name: "unit EntityLink", pattern: /kind="unit"/ },
  { name: "invoice EntityLink", pattern: /kind="invoice"/ },
  { name: "vendor EntityLink (factoring)", pattern: /kind="vendor"/ },
  { name: "parent customer EntityLinkOrTombstone", pattern: /data-testid="customer-parent-record-link"/ },
  { name: "sub-customer EntityLinkOrTombstone", pattern: /customer-sub-record-link-/ },
];

function run(src) {
  return CHECKS.filter((c) => !c.pattern.test(src)).map((c) => c.name);
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live`);
    process.exit(1);
  }
  if (run("// poison").length < CHECKS.length) {
    console.error(`${LABEL} SELFTEST FAIL poison`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (poison trips ${CHECKS.length})`);
  process.exit(0);
}

const fails = run(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers detail reverse_link ratcheted`);
