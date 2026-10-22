#!/usr/bin/env node
/**
 * LEAD 443.232 (P0, 10-22) — GPS was down 9 h (05:10Z → 14:40Z): integrations.samsara_vehicle_positions got 0 rows. One load
 * (13691) reached its final-delivery fence; the fence walk → transitionDispatchLoadInClientTx → settlement ping closed the
 * driver's settlement → the contract-terms MPG bonus INSERTed an extra_pay line with no item → check violation
 * (settlement_lines_extra_pay_requires_item); the ping's catch had NO savepoint, so the next statement threw 25P02 and the
 * WHOLE positions tick (every unit, both crons) rolled back, every 5 minutes.
 * THE RULE:
 *   1. dispatch/load-transition.service.ts runs the settlement ping inside withSavepoint (never a bare try/catch);
 *   2. telematics/geofence-detector.service.ts walks a load's status inside withSavepoint, audited on failure;
 *   3. integrations/samsara/samsara-positions.service.ts runs each point's fence processing inside withSavepoint (both the
 *      locations and the stats paths) — one unit can never roll back the fleet's positions;
 *   4. driver-finance/settlement-contract-terms.service.ts never computes or adds a bonus (443.236 owner: no automatic bonus).
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  transition: "apps/backend/src/dispatch/load-transition.service.ts",
  fence: "apps/backend/src/telematics/geofence-detector.service.ts",
  positions: "apps/backend/src/integrations/samsara/samsara-positions.service.ts",
  terms: "apps/backend/src/driver-finance/settlement-contract-terms.service.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  if (!/await withSavepoint\(\s*client as never,\s*"dispatch_transition_settlement_ping",\s*\(\) => pingSettlementOnLoadEvent\(/.test(s.transition))
    p.push(`${F.transition}: the settlement ping must run inside withSavepoint (a bare catch leaves the caller's transaction aborted — 25P02)`);
  if (/try \{\s*await pingSettlementOnLoadEvent\(/.test(s.transition))
    p.push(`${F.transition}: settlement ping is back in a bare try/catch`);
  if (!/await withSavepoint\(\s*client as never,\s*"fence_status_walk",\s*\(\) => walkLoadStatusFromFenceInSavepoint\(/.test(s.fence))
    p.push(`${F.fence}: the fence status walk must run inside withSavepoint`);
  if (!/"telematics\.fence_status_walk_failed"/.test(s.fence)) p.push(`${F.fence}: a failed fence walk must be audited by name`);
  for (const name of ["positions_fence_point", "stats_fence_point"])
    if (!new RegExp(`await withSavepoint\\(\\s*client as never,\\s*"${name}",\\s*\\(\\) => processGeofenceDetectionsForGpsPoint\\(`).test(s.positions))
      p.push(`${F.positions}: each point's fence processing must run inside withSavepoint ("${name}")`);
  // 443.232 catch-up: the lost-window replay uses the same per-fix savepoint and is wired as an outbox handler.
  if (!/export async function catchUpSamsaraGpsWindow\(/.test(s.positions) || !/"catchup_fence_point",/.test(s.positions))
    p.push(`${F.positions}: catchUpSamsaraGpsWindow must replay each fix through the fence detector in its own savepoint`);
  if (!/new TelematicsGpsCatchupHandler\(\)/.test(s.registry)) p.push(`${F.registry}: the GPS catch-up handler (telematics.gps_catchup) is not registered`);
  const bare = (s.positions.match(/await processGeofenceDetectionsForGpsPoint\(/g) ?? []).length;
  if (bare) p.push(`${F.positions}: ${bare} fence call(s) outside a savepoint`);
  // LEAD 443.236 (owner: "no you do not add automatically … there is not bonus") — the contract-terms engine never computes or
  // adds a bonus: no MPG / referral bonus function, no bonus ledger kind, no bonus-config read.
  for (const t of ["computeSettlementMpgBonus", "computeReferralBonuses", 'lineKind: "mpg_bonus"', 'lineKind: "referral_bonus"', "settlement_contract_terms_config"])
    if (s.terms.includes(t)) p.push(`${F.terms}: automatic bonus is back (${t}) — a bonus exists only as a manual pay line`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["ping back in a bare try/catch", { transition: base.transition.replace(/await withSavepoint\(\s*client as never,\s*"dispatch_transition_settlement_ping",\s*\(\) => pingSettlementOnLoadEvent\(/, "try { await pingSettlementOnLoadEvent(") }],
    ["fence walk without savepoint", { fence: base.fence.replace('"fence_status_walk",', '"x",') }],
    ["fence walk failure not audited", { fence: base.fence.replace('"telematics.fence_status_walk_failed"', '"x"') }],
    ["positions point outside savepoint", { positions: base.positions + "\nawait processGeofenceDetectionsForGpsPoint(client, {});\n" }],
    ["stats point savepoint removed", { positions: base.positions.replace('"stats_fence_point",', '"x",') }],
    ["catch-up without its savepoint", { positions: base.positions.replace('"catchup_fence_point",', '"x",') }],
    ["catch-up handler unregistered", { registry: base.registry.replace("new TelematicsGpsCatchupHandler(),", "") }],
    ["automatic MPG bonus back", { terms: base.terms + "\nexport async function computeSettlementMpgBonus() {}\n" }],
    ["bonus config read back", { terms: base.terms + "\nconst q = `FROM driver_finance.settlement_contract_terms_config`;\n" }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-gps-positions-survive-one-load: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-gps-positions-survive-one-load: OK — one load's fence walk / settlement ping / bonus can never abort the positions tick.");
}
