#!/usr/bin/env node
/**
 * verify-inventory-parts-deactivated-vendor-tombstone.mjs
 * LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL (FE chrome half)
 *
 * Parts & Stock Vendor column must tombstone unresolved vendor labels
 * (isUnresolvedEntityTombstone) instead of EntityLink→dead drill.
 * Historical name recovery (deactivated vendor JOIN) remains CC-1.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-inventory-parts-deactivated-vendor-tombstone";
const PAGE = "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) {
    failures.push("InventoryPartsStockPage must use isUnresolvedEntityTombstone");
  }
  if (!/inventory-parts-vendor-tombstone/.test(src)) {
    failures.push("must mark unresolved vendor cells with inventory-parts-vendor-tombstone");
  }
  if (!/key:\s*"vendor_id"[\s\S]*isUnresolvedEntityTombstone\(row\.vendor_label, row\.vendor_id, "Vendor"\)/.test(src)) {
    failures.push("vendor column must gate EntityLink with isUnresolvedEntityTombstone(vendor_label, vendor_id, Vendor)");
  }
  // Forbid bare EntityLink with entityLabel(...) as label (mounts dead drill for unresolved)
  if (/EntityLink[\s\S]*label=\{entityLabel\(row\.vendor_label/.test(src)) {
    failures.push("must not pass entityLabel(...) straight into EntityLink for vendor (tombstone path required)");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
    { key: "vendor_id", render: (row) => {
      if (isUnresolvedEntityTombstone(row.vendor_label, row.vendor_id, "Vendor")) {
        return <span data-testid="inventory-parts-vendor-tombstone">{entityLabel(row.vendor_label, row.vendor_id, "Vendor")}</span>;
      }
      return <EntityLink kind="vendor" id={row.vendor_id} label={String(row.vendor_label).trim()} />;
    }}
  `;
  const bad = `
    { key: "vendor_id", render: (row) =>
      <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_label, row.vendor_id, "Vendor")} />
    }
  `;
  if (analyze(good).length) fail("selftest expected GOOD to pass");
  if (!analyze(bad).length) fail("selftest expected BAD to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read(PAGE));
if (failures.length) {
  for (const f of failures) fail(f);
}
console.log(`${LABEL}: OK`);
