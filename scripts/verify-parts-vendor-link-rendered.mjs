#!/usr/bin/env node
/**
 * verify-parts-vendor-link-rendered.mjs
 *
 * 0441-mod13-inventory-part-to-vendor-none — PartsInventoryTable must surface vendor_id:
 *  1. ReferenceSelect (or equivalent vendor picker) wired to vendor_id on create/purchase form
 *  2. EntityLink kind="vendor" rendered on each part row
 *
 * Static invariants (no DB, no network).
 *
 * Usage:
 *   node scripts/verify-parts-vendor-link-rendered.mjs
 *   node scripts/verify-parts-vendor-link-rendered.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-parts-vendor-link-rendered";
const TABLE = "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(source) {
  const f = [];
  if (!source) {
    f.push(`${TABLE}: missing`);
    return f;
  }
  if (!/vendor_id/.test(source)) {
    f.push(`${TABLE}: must wire vendor_id on purchase form / row`);
  }
  if (!/ReferenceSelect/.test(source) && !/vendor-select|VendorSelect|vendor picker/i.test(source)) {
    f.push(`${TABLE}: must include a vendor picker (ReferenceSelect preferred)`);
  }
  if (!/createKind\s*=\s*["']vendor["']/.test(source) && !/createKind=\{"vendor"\}/.test(source)) {
    // Soft: ReferenceSelect with createKind vendor is the locked "+ Add new vendor" pattern
    if (/ReferenceSelect/.test(source) && !/createKind/.test(source)) {
      f.push(`${TABLE}: ReferenceSelect must set createKind="vendor"`);
    }
  }
  if (!/EntityLink/.test(source) || !/kind\s*=\s*["']vendor["']/.test(source)) {
    f.push(`${TABLE}: part rows must render EntityLink kind="vendor"`);
  }
  if (!/recordPartsPurchase/.test(source)) {
    f.push(`${TABLE}: must still call recordPartsPurchase (vendor_id on existing route)`);
  }
  return f;
}

export function run() {
  let source = null;
  try {
    source = fs.readFileSync(path.join(ROOT, TABLE), "utf8");
  } catch {
    source = null;
  }
  return check(source);
}

function main() {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const good = `
    import { EntityLink } from "...";
    import { ReferenceSelect } from "...";
    recordPartsPurchase(companyId, { vendor_id: form.vendor_id });
    <ReferenceSelect createKind="vendor" value={form.vendor_id} />
    <EntityLink kind="vendor" id={row.vendor_id} />
  `;
  const bad = `export function PartsInventoryTable() { return <div>no vendor</div>; }`;
  const goodFails = check(good);
  if (goodFails.length) throw new Error(`${LABEL}: selftest good fixture failed: ${goodFails.join("; ")}`);
  const badFails = check(bad);
  if (!badFails.length) throw new Error(`${LABEL}: selftest expected planted miss on bad fixture`);
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
