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
const ROUTES = path.join(ROOT, "apps/backend/src/maintenance/parts.routes.ts");
const MIGRATION = path.join(ROOT, "db/migrations/202608151800_inv_reorder_threshold_persistence.sql");
const LABEL = "verify-inventory-reorder-threshold-ui";

/**
 * @param {{ page: string, test: string, routes: string, migration: string }} files
 * @returns {string[]}
 */
export function computeFailures(files) {
  const page = files.page ?? "";
  const test = files.test ?? "";
  const routes = files.routes ?? "";
  const migration = files.migration ?? "";
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
  if (!/ADD COLUMN IF NOT EXISTS reorder_threshold integer NOT NULL DEFAULT 0/.test(migration) ||
      !/CHECK \(reorder_threshold >= 0\)/.test(migration)) {
    errors.push("maintenance.parts_inventory must persist a nonnegative reorder_threshold column");
  }
  if (!/pi\.reorder_threshold/.test(routes) || /0::int AS reorder_threshold/.test(routes)) {
    errors.push("parts list must return persisted reorder_threshold, never a fabricated zero");
  }
  const createInsert = routes.match(/INSERT INTO maintenance\.parts_inventory \([\s\S]*?RETURNING/)?.[0] ?? "";
  if (!/reorder_threshold/.test(createInsert) || !/\$10/.test(createInsert)) {
    errors.push("parts create must insert and return reorder_threshold");
  }
  if (!/add\("reorder_threshold", body\.data\.reorder_threshold\)/.test(routes) ||
      /reorder_threshold:\s*0[,\n]/.test(routes)) {
    errors.push("parts update must persist and return the real reorder_threshold");
  }
  const importRoute = routes.split('app.post("/api/v1/maintenance/parts/import"')[1] ?? "";
  if (!/INSERT INTO maintenance\.parts_inventory \([\s\S]*reorder_threshold/.test(importRoute) ||
      !/row\.reorder_threshold/.test(importRoute)) {
    errors.push("parts CSV import must parse and persist reorder_threshold");
  }
  if (!/on_hand_qty <= reorder_threshold/.test(routes)) {
    errors.push("parts KPI must use each persisted reorder_threshold instead of a magic constant");
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
    routes: `
      SELECT pi.reorder_threshold;
      INSERT INTO maintenance.parts_inventory (reorder_threshold) VALUES ($10) RETURNING reorder_threshold;
      add("reorder_threshold", body.data.reorder_threshold);
      reorder_threshold: newRow.reorder_threshold,
      app.post("/api/v1/maintenance/parts/import", async () => {
        INSERT INTO maintenance.parts_inventory (reorder_threshold)
      });
      row.reorder_threshold;
      on_hand_qty <= reorder_threshold;
    `,
    migration: `ADD COLUMN IF NOT EXISTS reorder_threshold integer NOT NULL DEFAULT 0; CHECK (reorder_threshold >= 0);`,
  };
  const bad = { page: `on_hand_qty only`, test: `on_hand_qty only`, routes: `0::int AS reorder_threshold`, migration: `` };
  const cases = [
    { name: "reorder columns wired", input: good, expectPass: true },
    { name: "missing reorder surface", input: bad, expectPass: false },
    { name: "backend fabricates zero", input: { ...good, routes: good.routes.replace("SELECT pi.reorder_threshold", "SELECT 0::int AS reorder_threshold") }, expectPass: false },
    { name: "update drops threshold", input: { ...good, routes: good.routes.replace('add("reorder_threshold", body.data.reorder_threshold);', "") }, expectPass: false },
    { name: "schema drops threshold", input: { ...good, migration: "" }, expectPass: false },
    { name: "KPI uses magic floor", input: { ...good, routes: good.routes.replace("on_hand_qty <= reorder_threshold", "on_hand_qty <= 2") }, expectPass: false },
  ];
  let ok = true;
  for (const c of cases) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${failures.join("; ") || "unexpected pass"}`);
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
    routes: fs.readFileSync(ROUTES, "utf8"),
    migration: fs.readFileSync(MIGRATION, "utf8"),
  });
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — reorder_threshold persists across schema/create/import/update/read and drives low-stock UI/KPI`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
