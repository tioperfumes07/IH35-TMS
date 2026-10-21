#!/usr/bin/env node
/**
 * LEAD 443.214 (CC-2) — FUEL FOLLOWS THE TRUCK AT THE PUMP: one resolver. Owner 10-21: "all wex transactions should be
 * linked to a load, use samsara locations, geofences, etc. ... check dates, and time should be in the reports."
 * Measured 10-21: 784 of 856 USMCA fuel rows carried a 07:00 CT placeholder time; the truck was the card's unit label.
 * Pinned:
 *  1. apps/backend/src/fuel/fill-truck-and-load.service.ts is the one resolver: provider moment (never the placeholder) →
 *     GPS truck within 483 m / ±20 min → THE one load rule (resolveFuelLoadAtTime); no moment → held_time_unknown; several
 *     trucks → the card only when it is among them, else held_ambiguous.
 *  2. The statement engine stamps the provider moment + station on import, on adoption, and on a re-run of a line already
 *     on the books (stampStatementFillMoment ×3); stamp_only backfills without importing / posting anything.
 *  3. The move goes through carryFuelReceiptToLoad / the reclassify engine — never a bare load_id UPDATE of a posted fill.
 *  4. No other fuel module runs the raw load-at-time SQL (loadAtTimeSql / loadAtTimeForDriverSql) except the one rule
 *     (fuel-load-at-time.ts) and the reefer trailer lookup (ALLOW, below).
 * Static, <1s. --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-follows-truck-one-resolver";
const SVC = "apps/backend/src/fuel/fill-truck-and-load.service.ts";
const STMT = "apps/backend/src/fuel/dreamline-statement-import.service.ts";
const ROUTES = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const FUEL_DIR = "apps/backend/src/fuel";
const ALLOW = new Map([
  ["apps/backend/src/fuel/fuel-load-at-time.ts", "THE one fuel-to-load rule"],
  ["apps/backend/src/fuel/reefer-fuel.service.ts", "reefer TRAILER at the fill (COALESCE(ft.load_id, …)) — reads the link, never sets it"],
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel, out); } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}

export function check(f) {
  const p = [];
  const svc = f[SVC] ?? "", stmt = f[STMT] ?? "", routes = f[ROUTES] ?? "";
  if (!/export async function resolveFillTruckAndLoad\(/.test(svc)) p.push(`${SVC}: the one resolver is missing`);
  if (!/export const FILL_GPS_RADIUS_M = 483;/.test(svc) || !/export const FILL_GPS_WINDOW_MIN = 20;/.test(svc)) p.push(`${SVC}: the GPS rule is no longer 0.3 mi / ±20 min`);
  if (!/if \(!f\.moment\) return \{ \.\.\.base, truck_resolution: "held_time_unknown"/.test(svc)) p.push(`${SVC}: a fill with no provider moment is no longer HELD (would match a 07:00 placeholder)`);
  if (!/return card \? \{ unit: card, resolution: "gps_card_among" \} : \{ unit: null, resolution: "held_ambiguous" \};/.test(svc)) p.push(`${SVC}: several trucks at the pump no longer HOLD unless the card is among them`);
  if (!/await resolveFuelLoadAtTime\(client as never, \{ operatingCompanyId: companyId, unitId: pick\.unit\.unit_id, driverId: null, at: f\.moment \}\)/.test(svc)) p.push(`${SVC}: the load is not THE one rule for the GPS truck at the provider moment`);
  if (!/await carryFuelReceiptToLoad\(/.test(svc) || !/applyReclassifyOnClient\(/.test(svc)) p.push(`${SVC}: a move does not go through the receipt / reclassify engine`);
  if (/UPDATE fuel\.fuel_transactions SET load_id/.test(svc)) p.push(`${SVC}: a bare load_id UPDATE (the ledger and the document would stay behind)`);
  const stamps = (stmt.match(/await stampStatementFillMoment\(client, \{/g) ?? []).length;
  if (stamps < 3) p.push(`${STMT}: the provider moment is stamped in ${stamps} of 3 places (import, adoption, already on the books)`);
  if (!/const dry = input\.dry_run === true \|\| stampOnly;/.test(stmt)) p.push(`${STMT}: stamp_only can import / adopt / post`);
  if (!/app\.post\("\/api\/v1\/fuel\/fill-truck-and-load\/rerun"/.test(routes)) p.push(`${ROUTES}: the re-run route is missing`);
  for (const [file, src] of Object.entries(f)) {
    if (!file.startsWith(FUEL_DIR + "/") || ALLOW.has(file)) continue;
    if (/\bloadAtTime(?:ForDriver)?Sql\s*\(/.test(src)) p.push(`${file}: a second fuel-to-load resolver (raw loadAtTimeSql) — use resolveFillTruckAndLoad / resolveFuelLoadAtTime`);
  }
  return p;
}
const readAll = () => Object.fromEntries([...new Set([SVC, STMT, ROUTES, ...walk(FUEL_DIR)])].map((x) => [x, fs.existsSync(path.join(ROOT, x)) ? fs.readFileSync(path.join(ROOT, x), "utf8") : ""]));

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest: real tree not clean:\n  ${base.join("\n  ")}`); process.exit(1); }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const plants = [
    ["placeholder time used", plant(SVC, 'if (!f.moment) return { ...base, truck_resolution: "held_time_unknown"', 'if (false) return { ...base, truck_resolution: "held_time_unknown"')],
    ["card guesses among several", plant(SVC, 'return card ? { unit: card, resolution: "gps_card_among" } : { unit: null, resolution: "held_ambiguous" };', 'return { unit: candidates[0]!, resolution: "gps" };')],
    ["radius widened", plant(SVC, "export const FILL_GPS_RADIUS_M = 483;", "export const FILL_GPS_RADIUS_M = 5000;")],
    ["bare load_id update", plant(SVC, "SET card_unit_id = COALESCE(card_unit_id, unit_id),", "SET card_unit_id = COALESCE(card_unit_id, unit_id), load_id = load_id,") ],
    ["adoption not stamped", plant(STMT, "await stampStatementFillMoment(client, { companyId, railKey: rail.key, at: line.transaction_at, city: line.city, state: line.state, stationName: line.location_name, fuelTransactionId: hit.fuel_transaction_id });", "")],
    ["stamp_only posts", plant(STMT, "const dry = input.dry_run === true || stampOnly;", "const dry = input.dry_run === true;")],
    ["second resolver in fuel/", { ...real, "apps/backend/src/fuel/x.ts": "const q = `${loadAtTimeSql(\"f.unit_id\", \"f.at\")}`;" }],
  ];
  plants[3][1][SVC] = real[SVC] + "\n// UPDATE fuel.fuel_transactions SET load_id = $3";
  let ok = 0;
  for (const [name, files] of plants) {
    const changed = Object.keys(files).some((k) => files[k] !== real[k]);
    const pass = changed && check(files).length > 0;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${changed ? "" : " (plant did not apply)"}`);
    if (pass) ok++;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}
const problems = check(readAll());
if (problems.length) { console.error(`${LABEL} FAIL — ${problems.length}:`); for (const x of problems) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL} PASS — one resolver: provider moment → GPS truck at the pump → the one load rule; moves through the engine`);
