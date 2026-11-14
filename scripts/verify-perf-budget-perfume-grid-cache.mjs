/**
 * verify-perf-budget-perfume-grid-cache (ROUND 8.32 — CC-2 11-14)
 *
 * Guards the perfume grid in-process cache:
 *   1. desk.service.ts exports `invalidateGridCache` and contains `getGridVersionKey` + `_gridCache`.
 *   2. desk.routes.ts imports `invalidateGridCache` and calls it exactly 10 times
 *      (one per write route: rules, vendors, lists-import, lists-void, lists-current,
 *       rows-confirm, canonicalize-brands, review-rematch, rows-bulk, items-internal-code).
 *   3. buildGrid contains both the cache-hit early-return and the cache-set store.
 *
 * --selftest: static checks only (default — no DB needed)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function check(label, cond) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; }
  else { console.log(`PASS: ${label}`); }
}

const svc = readFileSync(join(root, "apps/backend/src/perfume/desk.service.ts"), "utf8");
const rts = readFileSync(join(root, "apps/backend/src/perfume/desk.routes.ts"), "utf8");

// 1 — service exports invalidateGridCache
check("service exports invalidateGridCache", /export function invalidateGridCache/.test(svc));

// 2 — service has getGridVersionKey
check("service has getGridVersionKey", /async function getGridVersionKey/.test(svc));

// 3 — service has _gridCache Map
check("service has _gridCache Map", /_gridCache\s*=\s*new Map/.test(svc));

// 4 — buildGrid checks cache before building (early return on hit)
check("buildGrid returns cached result on hit", /_cached\s*=\s*_gridCache\.get\(_cacheKey\)/.test(svc) && /_cached\) return _cached/.test(svc));

// 5 — buildGrid stores result in cache before returning
check("buildGrid stores result in _gridCache", /_gridCache\.set\(_cacheKey,\s*_result\)/.test(svc));

// 6 — routes import invalidateGridCache (import block is first ~1200 chars)
check("routes import invalidateGridCache", /invalidateGridCache/.test(rts.slice(0, 1500)));

// 7 — routes call invalidateGridCache exactly 10 times (one per write route)
const callCount = (rts.match(/invalidateGridCache\(\)/g) ?? []).length;
check(`routes call invalidateGridCache 10 times (found ${callCount})`, callCount === 10);

// 8 — version key covers all 5 tracked tables
check("version key covers price_lists.imported_at", /imported_at.*pl_import|pl_import.*imported_at/s.test(svc));
check("version key covers price_lists.voided_at",   /voided_at.*pl_void|pl_void.*voided_at/s.test(svc));
check("version key covers items.updated_at",        /perfume\.items.*items_stamp|items_stamp.*perfume\.items/s.test(svc));
check("version key covers vendors.updated_at",      /perfume\.vendors.*vendors_stamp|vendors_stamp.*perfume\.vendors/s.test(svc));
check("version key covers settings.updated_at",     /perfume\.settings.*rules_stamp|rules_stamp.*perfume\.settings/s.test(svc));

if (process.exitCode) {
  console.error("\nverify-perf-budget-perfume-grid-cache: FAIL");
} else {
  console.log("\nverify-perf-budget-perfume-grid-cache: PASS (11/11)");
}
