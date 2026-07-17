#!/usr/bin/env node
/**
 * verify-inventory-reorder-threshold-ui.mjs
 *
 * Block 0441-mod13-inventory-reorder-threshold-dropped: Inventory Parts & Stock table must surface
 * reorder_threshold from /api/v1/maintenance/parts and a low-stock (REORDER) indicator.
 *
 * Self-test: node scripts/verify-inventory-reorder-threshold-ui.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
const TEST = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryPartsStockPage.test.ts");
const LABEL = "verify-inventory-reorder-threshold-ui";

/**
 * @param {{ page: string, test: string }} files
 * @returns {string[]}
 */
export function computeFailures(files) {
  const page = files.page ?? "";
  const test = files.test ?? "";
  const errors = [];

  if (!/reorder_threshold/.test(page)) {
    errors.push("InventoryPartsStockPage must map reorder_threshold from maintenance parts API");
  }
  if (!/partNeedsReorder/.test(page)) {
    errors.push("InventoryPartsStockPage must use partNeedsReorder for low-stock indicator");
  }
  if (!/label:\s*["']Reorder Threshold["']/.test(page)) {
    errors.push("InventoryPartsStockPage must render a Reorder Threshold column");
  }
  if (!/label:\s*["']Low Stock["']/.test(page) || !/REORDER/.test(page)) {
    errors.push("InventoryPartsStockPage must render a Low Stock REORDER indicator");
  }
  if (!/reorder_threshold/.test(test)) {
    errors.push("InventoryPartsStockPage.test.ts must cover reorder_threshold mapping");
  }
  return errors;
}

function selftest() {
  const good = {
    page: `
      import { partNeedsReorder } from "../maintenance/parts-low-stock";
      reorder_threshold: reorderThreshold,
      { key: "reorder_threshold", label: "Reorder Threshold" },
      { key: "low_stock", label: "Low Stock", render: () => REORDER },
    `,
    test: `reorder_threshold: 4`,
  };
  const bad = { page: `on_hand_qty only`, test: `on_hand_qty only` };
  const cases = [
    { name: "reorder columns wired", input: good, expectPass: true },
    { name: "missing reorder surface", input: bad, expectPass: false },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const failures = computeFailures({
    page: fs.readFileSync(PAGE, "utf8"),
    test: fs.readFileSync(TEST, "utf8"),
  });
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Inventory Parts & Stock surfaces reorder_threshold + low-stock indicator`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
