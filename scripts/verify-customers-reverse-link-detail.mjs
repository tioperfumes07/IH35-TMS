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
  {
    name: "payment application invoice EntityLinkOrTombstone",
    pattern: /applications\.map\(\(application\)[\s\S]{0,500}kind="invoice"[\s\S]{0,180}id=\{application\.invoice_id\}[\s\S]{0,180}name=\{application\.invoice_display_id\}/,
  },
  {
    name: "payment application amount remains visible beside invoice drill",
    pattern: /formatCurrencyCents\(application\.amount_cents\)/,
  },
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
  for (const check of CHECKS) {
    const globalPattern = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`);
    const planted = live.replace(globalPattern, "/* planted reverse-link defect */");
    if (planted === live || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${CHECKS.length}/${CHECKS.length} planted defects rejected`);
  process.exit(0);
}

const fails = run(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers detail reverse_link ratcheted`);
