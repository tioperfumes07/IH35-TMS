#!/usr/bin/env node
/** @matrix-built {"modules":["inventory"],"cols":["vendor"],"leafRe":"^(parts\\.(roster|column\\.vendor_link|create|create\\.vendor_picker|edit|edit\\.vendor_picker)|assignments\\.(trail|vendor_link))$","task":"LINK-F5166-INVENTORY-VENDOR-PARTS"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): all 8 genuine inventory vendor
 * leaves — real vendor_id + EntityLink kind="vendor" on the parts roster and assignments trail,
 * real ReferenceSelect(createKind="vendor") on both the create and edit parts drawers.
 *
 * Self-test: node scripts/verify-inventory-vendor-parts.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  stock: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  createDrawer: "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
  editDrawer: "apps/frontend/src/pages/inventory/PartEditDrawer.tsx",
  assignments: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
};
const LABEL = "verify-inventory-vendor-parts";

export function audit(src) {
  const failures = [];
  if (!/kind="vendor" id=\{row\.vendor_id\}/.test(src.stock)) {
    failures.push(`${FILES.stock}: parts roster/column must render a real vendor EntityLink`);
  }
  if (!/data-testid="inv-part-create-vendor-picker"/.test(src.createDrawer) || !/createKind="vendor"/.test(src.createDrawer)) {
    failures.push(`${FILES.createDrawer}: part create must have a real vendor picker`);
  }
  if (!/data-testid="inv-part-edit-vendor-picker"/.test(src.editDrawer) || !/createKind="vendor"/.test(src.editDrawer)) {
    failures.push(`${FILES.editDrawer}: part edit must have a real vendor picker`);
  }
  if (!/kind="vendor" id=\{row\.vendor_id\}/.test(src.assignments)) {
    failures.push(`${FILES.assignments}: assignments trail/vendor-link must render a real vendor EntityLink`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["stock-link", "stock", /kind="vendor" id=\{row\.vendor_id\}/, 'kind="unit" id={row.unit_id}'],
    ["create-picker", "createDrawer", /data-testid="inv-part-create-vendor-picker"/, 'data-testid="inv-part-create-vendor-picker-unused"'],
    ["edit-picker", "editDrawer", /data-testid="inv-part-edit-vendor-picker"/, 'data-testid="inv-part-edit-vendor-picker-unused"'],
    ["assignments-link", "assignments", /kind="vendor" id=\{row\.vendor_id\}/, 'kind="unit" id={row.unit_id}'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — inventory's vendor-scoped parts/assignments leaves are real`);
