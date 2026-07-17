#!/usr/bin/env node
/**
 * verify-inventory-read-path-api-request.mjs
 *
 * 0441-mod13-inventory-read-path-raw-fetch — InventoryPartsStockPage must load parts via the shared
 * listMaintenanceParts helper (apiRequest with credentials + base URL), NOT raw fetch(resolveApiUrl(...))
 * which drops the session cookie cross-origin and silently 401s in prod.
 *
 * Self-test: node scripts/verify-inventory-read-path-api-request.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PARTS_STOCK_PAGE = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
const LABEL = "verify-inventory-read-path-api-request";

/**
 * @param {string} src
 * @returns {string[]}
 */
export function computeFailures(src) {
  const errors = [];
  if (/fetch\s*\(\s*resolveApiUrl/.test(src)) {
    errors.push(
      "InventoryPartsStockPage must not use fetch(resolveApiUrl(...)) — use listMaintenanceParts (apiRequest)"
    );
  }
  if (!/listMaintenanceParts/.test(src)) {
    errors.push("InventoryPartsStockPage must call listMaintenanceParts(...) for the parts read path");
  }
  return errors;
}

function selftest() {
  const good = `
    import { listMaintenanceParts } from "../../api/maintenance";
    queryFn: async () => {
      const data = await listMaintenanceParts(operatingCompanyId);
      return { parts: mapMaintenancePartsToInventoryRows(data.rows ?? []) };
    },
  `;
  const bad = `
    import { resolveApiUrl } from "../../api/client";
    const res = await fetch(resolveApiUrl(\`/api/v1/maintenance/parts?...\`));
  `;
  const cases = [
    { name: "apiRequest read path", input: good, expectPass: true },
    { name: "raw fetch regression", input: bad, expectPass: false },
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
  const src = fs.readFileSync(PARTS_STOCK_PAGE, "utf8");
  const failures = computeFailures(src);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — InventoryPartsStockPage uses listMaintenanceParts (apiRequest)`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
