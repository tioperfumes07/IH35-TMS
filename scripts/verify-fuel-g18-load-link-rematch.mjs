#!/usr/bin/env node
/**
 * Guard 2000 — G18 fuel load_id rematch via resolveLoadId (fill-null only, no fake FKs) + LEAD 443.110 G7: the ONE
 * fuel-to-load rule (checkOneFuelLoadRule below).
 *
 * Rule 17: verify-steps wire this; do not edit package.json / ci.yml / CLAIMED-NUMBERS.json.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

function assertIncludes(hay, needle, label) {
  if (!hay.includes(needle)) {
    throw new Error(`${label}: expected to contain ${JSON.stringify(needle)}`);
  }
}

/**
 * LEAD 443.110 G7 — ONE fuel-to-load rule. Every fuel source resolves its load through resolveFuelLoadAtTime
 * (apps/backend/src/fuel/fuel-load-at-time.ts), which is loadAtTimeSql (unit) then loadAtTimeForDriverSql (driver)
 * from maintenance/driver-attribution.ts — actual stamps first, date-only stamps to the end of their day, active
 * (non-soft-deleted) stops only. The import used its own ±1-day scheduled window (ignored actual times); the Relay post
 * used loadAtTimeSql: one fill could land on two loads by source. Returns the problem list.
 */
export function checkOneFuelLoadRule(src) {
  const p = [];
  const fn = src.importer.match(/export async function resolveLoadId\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!fn) p.push("fuel-transaction-import.ts: resolveLoadId missing (callers: import, Relay rematch)");
  else if (!/resolveFuelLoadAtTime\(/.test(fn) || /mdata\.loads|load_stops/.test(fn)) p.push("resolveLoadId must delegate to resolveFuelLoadAtTime, never query loads itself");
  if (!/resolveFuelLoadAtTime\(client,\s*\{\s*operatingCompanyId: companyId, unitId, driverId, at: row\.transaction_at/.test(src.importer)) p.push("the import must resolve each row's load through resolveFuelLoadAtTime");
  if (!/trailer_id\s*\)\s*VALUES[\s\S]{0,260}\$19::uuid/.test(src.importer) || !/const trailerId = loadHit\?\.trailer_id/.test(src.importer)) p.push("the import must write fuel_transactions.trailer_id from the load (one trailer rule)");
  if (!/resolveFuelLoadAtTime\(client, \{[\s\S]{0,200}driverId: row\.driver_id/.test(src.relay)) p.push("the Relay fill post must resolve its load through resolveFuelLoadAtTime (unit, driver fallback)");
  if (/loadAtTimeSql\(|FROM mdata\.loads l[\s\S]{0,400}assigned_unit_id/.test(src.relay)) p.push("bank-match-fuel-post must not carry its own load-at-time SQL");
  if (!/loadAtTimeSql\("x\.unit_id"/.test(src.helper) || !/loadAtTimeForDriverSql\("x\.driver_id"/.test(src.helper)) p.push("fuel-load-at-time.ts must be unit (loadAtTimeSql) then driver (loadAtTimeForDriverSql)");
  if (!/COALESCE\(by_unit\.load_id, by_driver\.load_id\)/.test(src.helper)) p.push("fuel-load-at-time.ts: the unit's load must win over the driver's");
  if (!/sameEntityLoadCompanyTrailerSql\(/.test(src.helper)) p.push("fuel-load-at-time.ts must take the trailer from the one trailer rule (load-trailer.sql.ts)");
  if (!/dayEndIfDateOnlySql\("COALESCE\(d\.actual_departure_at, d\.actual_arrival_at\)"\)/.test(src.attribution)) p.push("loadAtTimeSql must count a date-only delivery stamp to the end of its day");
  if (!/d\.soft_deleted_at IS NULL/.test(src.attribution) || !/p\.soft_deleted_at IS NULL/.test(src.attribution)) p.push("loadAtTimeSql must read active (non-soft-deleted) stops only");
  if (!/l\.assigned_primary_driver_id = \$\{driverAlias\} OR l\.assigned_secondary_driver_id = \$\{driverAlias\}/.test(src.attribution)) p.push("loadAtTimeForDriverSql must match the primary or secondary driver seat");
  return p;
}

function readRuleSources() {
  return {
    importer: read("apps/backend/src/fuel/fuel-transaction-import.ts"),
    relay: read("apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts"),
    helper: read("apps/backend/src/fuel/fuel-load-at-time.ts"),
    attribution: read("apps/backend/src/maintenance/driver-attribution.ts"),
  };
}

function selftest() {
  const real = readRuleSources();
  const cases = [
    ["real tree passes", checkOneFuelLoadRule(real).length === 0],
    ["import re-deriving its own load window is caught", checkOneFuelLoadRule({ ...real, importer: real.importer.replace(/return \(await resolveFuelLoadAtTime\([^;]*;/, "const r = await client.query(`SELECT l.id FROM mdata.loads l JOIN mdata.load_stops s ON s.load_id = l.id`); return r.rows[0]?.id ?? null;") }).length > 0],
    ["import dropping the trailer is caught", checkOneFuelLoadRule({ ...real, importer: real.importer.replace("const trailerId = loadHit?.trailer_id", "const trailerId = null && loadHit?.trailer_id") }).length > 0],
    ["Relay back on its own SQL is caught", checkOneFuelLoadRule({ ...real, relay: real.relay.replace(/resolveFuelLoadAtTime\(client, \{/, "resolveLoadForUnitAt(client, {") + "\nconst q = `${loadAtTimeSql(\"u.unit_id\", \"$3\", \"lat\")}`;" }).length > 0],
    ["driver fallback removed is caught", checkOneFuelLoadRule({ ...real, helper: real.helper.replace('loadAtTimeForDriverSql("x.driver_id"', 'loadAtTimeSql("x.unit_id"') }).length > 0],
    ["date-only finish treated as midnight is caught", checkOneFuelLoadRule({ ...real, attribution: real.attribution.replace('${dayEndIfDateOnlySql("COALESCE(d.actual_departure_at, d.actual_arrival_at)")}', "d.actual_departure_at, d.actual_arrival_at") }).length > 0],
    ["retired (soft-deleted) stops read is caught", checkOneFuelLoadRule({ ...real, attribution: real.attribution.replace("AND d.soft_deleted_at IS NULL", "") }).length > 0],
  ];
  const failed = cases.filter(([, ok]) => !ok);
  for (const [n] of failed) console.error(`verify-fuel-g18-load-link-rematch: selftest FAIL — ${n}`);
  if (failed.length) process.exit(1);
  console.log(`verify-fuel-g18-load-link-rematch: selftest PASS (${cases.length}/${cases.length})`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const rematch = read("apps/backend/src/integrations/relay-payments/relay-fuel-load-rematch.service.ts");
  assertIncludes(rematch, "export async function rematchRelayFuelLoads", "rematch service export");
  assertIncludes(rematch, 'from "../../fuel/fuel-transaction-import.js"', "imports resolveLoadId module");
  assertIncludes(rematch, "resolveLoadId(", "calls resolveLoadId");
  assertIncludes(rematch, "load_id IS NULL", "scan fill-null only");
  assertIncludes(rematch, "archived_at IS NULL", "exclude archived rows");
  assertIncludes(rematch, "AND load_id IS NULL", "update fill-null guard");
  assertIncludes(rematch, "load_exemption_reason = NULL", "clear exemption on match");
  assertIncludes(rematch, "skipped_no_driver_or_unit", "skip counter when no driver/unit");
  assertIncludes(rematch, "skipped_no_load_in_window", "skip counter when no load in window");

  const ruleProblems = checkOneFuelLoadRule(readRuleSources());
  if (ruleProblems.length) throw new Error(ruleProblems.join("; "));

  const routes = read("apps/backend/src/integrations/relay-payments/relay-fuel-load-rematch.routes.ts");
  assertIncludes(routes, "/api/integrations/relay/fuel/rematch-loads", "rematch-loads route path");
  assertIncludes(routes, '["Owner", "Administrator"]', "owner/admin auth");
  assertIncludes(routes, "withLuciaBypass", "lucia bypass for RLS");

  const index = read("apps/backend/src/index.ts");
  assertIncludes(index, "registerRelayFuelLoadRematchRoute", "route mounted in index");

  const driverRematch = read("apps/backend/src/integrations/relay-payments/relay-fuel-driver-rematch.service.ts");
  assertIncludes(driverRematch, "rematchRelayFuelLoads", "driver rematch chains load rematch");

  const step = read("scripts/verify-steps/2000-verify-fuel-g18-load-link-rematch.mjs");
  assertIncludes(step, "verify-fuel-g18-load-link-rematch", "verify-step wired");

  console.log("verify-fuel-g18-load-link-rematch: PASS");
}

try {
  main();
} catch (err) {
  console.error("verify-fuel-g18-load-link-rematch: FAIL", err?.message ?? err);
  process.exit(1);
}
