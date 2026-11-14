#!/usr/bin/env node
/**
 * verify-inventory-leaf-back-ret — ROUND 8.20.
 * Inventory leaf pages Back resolveBackHref (not bare /inventory).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-inventory-leaf-back-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx",
  "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
];

export function check(src, file) {
  const f = [];
  if (!src) return [`${file} missing`];
  if (!/resolveBackHref/.test(src)) f.push(`${file}: must use resolveBackHref`);
  if (!/backHref=\{inventoryBackHref\}/.test(src)) f.push(`${file}: backHref must be inventoryBackHref`);
  if (/backHref="\/inventory"/.test(src)) f.push(`${file}: still hardcodes backHref=/inventory`);
  return f;
}

function selftest() {
  let pass = 0;
  const total = PAGES.length + 1;
  for (const file of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (check(src, file).length === 0) pass += 1;
    else console.error(`${LABEL} --selftest: live ${file} fails`, check(src, file));
  }
  const bare = fs.readFileSync(path.join(ROOT, PAGES[0]), "utf8").replace(
    /backHref=\{inventoryBackHref\}/,
    'backHref="/inventory"',
  );
  if (check(bare, PAGES[0]).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch bare`);
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = [];
  for (const file of PAGES) {
    const src = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : "";
    f.push(...check(src, file));
  }
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — inventory leaf Backs resolve ret`);
}
