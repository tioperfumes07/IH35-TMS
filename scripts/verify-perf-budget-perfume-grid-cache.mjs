/**
 * verify-perf-budget-perfume-grid-cache (ROUND 8.32 / 8.32.2 — CC-2 11-14)
 *
 * Guards the perfume grid two-level in-process cache:
 *   Level-1 (_gridCache): one full DB build per (data version, target, earn).
 *   Level-2 (_viewCache): one sort+facet build per (data version, view, mine, sort, dir).
 *   Per-request work: searchRows (if q) + filterFacets (if picks) + slice only.
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

// === Level-1 grid cache ===

// 1 — service exports invalidateGridCache
check("service exports invalidateGridCache", /export function invalidateGridCache/.test(svc));

// 2 — service has in-process _gridVer counter (replaces getGridVersionKey seq scans — R832.2 follow-up)
check("service has in-process _gridVer counter", /let _gridVer\s*=\s*0/.test(svc));

// 3 — service has _gridCache Map
check("service has _gridCache Map", /_gridCache\s*=\s*new Map/.test(svc));

// 4 — buildGrid checks cache before building (early return on hit)
check("buildGrid returns cached result on hit", /_cached\s*=\s*_gridCache\.get\(_cacheKey\)/.test(svc) && /_cached\) return _cached/.test(svc));

// 5 — buildGrid stores result in cache before returning
check("buildGrid stores result in _gridCache", /_gridCache\.set\(_cacheKey,\s*_result\)/.test(svc));

// 6 — routes import invalidateGridCache (import block is first ~1500 chars)
check("routes import invalidateGridCache", /invalidateGridCache/.test(rts.slice(0, 1500)));

// 7 — routes call invalidateGridCache exactly 10 times (one per write route)
const callCount = (rts.match(/invalidateGridCache\(\)/g) ?? []).length;
check(`routes call invalidateGridCache 10 times (found ${callCount})`, callCount === 10);

// === Level-2 view cache ===

// 8 — service has _viewCache Map
check("service has _viewCache Map", /_viewCache\s*=\s*new Map/.test(svc));

// 9 — service exports getOrBuildView
check("service exports getOrBuildView", /export function getOrBuildView/.test(svc));

// 10 — invalidateGridCache clears _viewCache
check("invalidateGridCache clears _viewCache", /invalidateGridCache[\s\S]{0,120}_viewCache\.clear\(\)/.test(svc));

// 11 — routes import getOrBuildView
check("routes import getOrBuildView", /getOrBuildView/.test(rts.slice(0, 1500)));

// === Collator ===

// 12 — service uses Intl.Collator module-level instance
check("service has module-level Intl.Collator", /new Intl\.Collator\(/.test(svc));

// === Version counter invalidated on every write (replaces 5-table seq scan) ===

// 13
check("invalidateGridCache bumps _gridVer", /invalidateGridCache[\s\S]{0,200}_gridVer\+\+/.test(svc));
check("buildGrid uses _gridVer as cache key prefix", /v\$\{_gridVer\}|`v\$\{_gridVer\}/.test(svc));
check("_gridVer declared at module level", /^let _gridVer\s*=/m.test(svc));

if (process.exitCode) {
  console.error("\nverify-perf-budget-perfume-grid-cache: FAIL");
} else {
  console.log("\nverify-perf-budget-perfume-grid-cache: PASS (15/15)");
}
