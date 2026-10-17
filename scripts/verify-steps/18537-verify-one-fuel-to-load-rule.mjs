#!/usr/bin/env node
/**
 * LEAD 443.185 G7 — ONE fuel-to-load rule, trailer included.
 *
 * Measured on main before this step: the Relay ingest bridge and the Relay load rematch asked a load-only wrapper
 * (resolveLoadId in fuel-transaction-import.ts) and wrote NO trailer, while the import, Dreamline, the Relay bank-match
 * post and receipt repoint took the trailer from the one rule's hit; the reefer trailer lookup asked the unit only (no
 * driver fallback).
 *   1. No load-only wrapper: fuel-transaction-import.ts exports no resolveLoadId.
 *   2. The Relay bridge and the Relay rematch resolve through resolveFuelLoadAtTime and write trailer_id from that hit.
 *   3. The reefer trailer lookup uses the unit rule then the driver rule (loadAtTimeSql + loadAtTimeForDriverSql).
 *   4. The Settlement Creator's fuel row carries its load's company trailer (the one trailer rule) on every non-reefer
 *      fill — it wrote NULL (prod USMCA: 669 manual rows with a load and no trailer); a reefer fill keeps U25.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  importer: "apps/backend/src/fuel/fuel-transaction-import.ts",
  bridge: "apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts",
  rematch: "apps/backend/src/integrations/relay-payments/relay-fuel-load-rematch.service.ts",
  reefer: "apps/backend/src/fuel/reefer-fuel.service.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  if (/export async function resolveLoadId\(/.test(s.importer)) p.push(`${F.importer}: the load-only resolveLoadId wrapper is back (it dropped the trailer) (1)`);
  for (const k of ["bridge", "rematch"]) {
    if (!/resolveFuelLoadAtTime\(client, \{/.test(s[k])) p.push(`${F[k]}: must resolve the fill's load through resolveFuelLoadAtTime (2)`);
    if (/resolveLoadId\(/.test(s[k])) p.push(`${F[k]}: calls the load-only resolveLoadId (2)`);
  }
  if (!/trailer_id\s*\)/.test(s.bridge) || !/const trailerId = loadHit\?\.trailer_id/.test(s.bridge) || !/trailer_id = COALESCE\(fuel\.fuel_transactions\.trailer_id, EXCLUDED\.trailer_id\)/.test(s.bridge))
    p.push(`${F.bridge}: must write fuel_transactions.trailer_id from the one rule's hit (2)`);
  if (!/trailer_id = COALESCE\(trailer_id, \$3::uuid\)/.test(s.rematch) || !/trailerId: loadHit\?\.trailer_id/.test(s.rematch))
    p.push(`${F.rematch}: must write the trailer beside the load (row + receipt attach) (2)`);
  if (!/loadAtTimeForDriverSql\("f\.driver_id"/.test(s.reefer) || !/COALESCE\(f\.load_id, lat\.load_id, lad\.load_id\)/.test(s.reefer))
    p.push(`${F.reefer}: the reefer trailer lookup must use the unit rule then the driver rule (3)`);
  if (!/ELSE \$\{sameEntityLoadCompanyTrailerSql\("\$3::uuid", "\$1::uuid"\)\} END,/.test(s.creator) || !/fuelType === "reefer_diesel",\n\s*\],/.test(s.creator))
    p.push(`${F.creator}: a Creator fuel fill must carry its load's company trailer (one trailer rule); reefer keeps U25 (4)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["wrapper back", { importer: base.importer + "\nexport async function resolveLoadId(c, a, b, d, e) {\n  return null;\n}\n" }],
    ["bridge off the rule", { bridge: base.bridge.replace("resolveFuelLoadAtTime(client, {", "otherRule(client, {") }],
    ["bridge drops trailer", { bridge: base.bridge.replace("const trailerId = loadHit?.trailer_id", "const trailerId = null && loadHit") }],
    ["rematch drops trailer", { rematch: base.rematch.replace("trailerId: loadHit?.trailer_id", "trailerId: null") }],
    ["creator drops trailer", { creator: base.creator.replace('ELSE ${sameEntityLoadCompanyTrailerSql("$3::uuid", "$1::uuid")} END,', "ELSE NULL END,") }],
    ["reefer unit only", { reefer: base.reefer.replace("COALESCE(f.load_id, lat.load_id, lad.load_id)", "COALESCE(f.load_id, lat.load_id)") }],
  ];
  for (const [n, src] of plants) {
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
    console.error(`verify-one-fuel-to-load-rule FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-one-fuel-to-load-rule PASS: every fuel writer resolves load + trailer through resolveFuelLoadAtTime (G7)");
}
