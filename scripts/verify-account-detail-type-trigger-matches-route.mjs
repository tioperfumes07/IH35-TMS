#!/usr/bin/env node
/**
 * GUARD (LST-F430): the database rule and the route agree on which detail types an account type may carry.
 *
 * catalogs.accounts.account_type is one of the app's 8 values; catalogs.account_types holds 15 catalog codes. Two
 * places translate one into the other:
 *   - apps/backend/src/catalogs/accounts.routes.ts — CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM (resolveDetailType)
 *   - the newest migration defining catalogs.accounts_detail_type_scope_check — a CASE on the code
 * Until 202615440300 the trigger had no map at all and refused every Liability/Asset/Expense detail type, while the
 * route accepted them: the New Account screen offered a detail type the database then rejected (400
 * invalid_account_check_constraint). This guard fails if the two maps differ in any code, or if the newest trigger
 * definition loses its map.
 *
 * Run: node scripts/verify-account-detail-type-trigger-matches-route.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-detail-type-trigger-matches-route";
const ROUTE = "apps/backend/src/catalogs/accounts.routes.ts";
const MIGRATIONS = "db/migrations";

export function routeMap(src) {
  const m = src.match(/CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM[^=]*=\s*\{([\s\S]*?)\};/);
  if (!m) return null;
  const map = {};
  for (const [, code, type] of m[1].matchAll(/([A-Z]+)\s*:\s*"([A-Za-z]+)"/g)) map[code] = type;
  return map;
}

export function triggerMap(sql) {
  const fn = sql.match(/CREATE OR REPLACE FUNCTION catalogs\.accounts_detail_type_scope_check\(\)([\s\S]*?)\$function\$;/);
  if (!fn) return null;
  const map = {};
  for (const [, code, type] of fn[1].matchAll(/WHEN\s+'([A-Z]+)'\s+THEN\s+'([A-Za-z]+)'/g)) map[code] = type;
  return map;
}

export function compare(route, trigger) {
  const problems = [];
  if (!route) return [`${ROUTE} no longer declares CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM`];
  if (!trigger || Object.keys(trigger).length === 0) {
    return ["the newest catalogs.accounts_detail_type_scope_check has no code -> account_type map; every non-Equity/Income detail type would be refused again"];
  }
  for (const code of new Set([...Object.keys(route), ...Object.keys(trigger)])) {
    if (route[code] !== trigger[code]) {
      problems.push(`code ${code}: route maps it to ${route[code] ?? "(missing)"}, the trigger to ${trigger[code] ?? "(missing)"}`);
    }
  }
  return problems;
}

function newestTriggerSql() {
  const files = fs
    .readdirSync(path.join(ROOT, MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let newest = null;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(ROOT, MIGRATIONS, f), "utf8");
    if (/CREATE OR REPLACE FUNCTION catalogs\.accounts_detail_type_scope_check\(\)/.test(sql)) newest = { file: f, sql };
  }
  return newest;
}

const route = routeMap(fs.readFileSync(path.join(ROOT, ROUTE), "utf8"));
const newest = newestTriggerSql();

if (process.argv.includes("--selftest")) {
  const real = compare(route, newest ? triggerMap(newest.sql) : null);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["the pre-LST-F430 trigger (no map)", compare(route, triggerMap(newest.sql.replace(/WHEN\s+'[A-Z]+'\s+THEN\s+'[A-Za-z]+'/g, "")))],
    ["the trigger maps CC to Asset", compare(route, triggerMap(newest.sql.replace("WHEN 'CC'   THEN 'Liability'", "WHEN 'CC'   THEN 'Asset'")))],
    ["the route gains a code the trigger lacks", compare({ ...route, XYZ: "Asset" }, triggerMap(newest.sql))],
    ["the route loses its map", compare(null, triggerMap(newest.sql))],
  ];
  const missed = plants.filter(([, p]) => p.length === 0).map(([n]) => n);
  if (missed.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${plants.length}/${plants.length} plants caught`);
  process.exit(0);
}

const problems = compare(route, newest ? triggerMap(newest.sql) : null);
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s) (newest definition: ${newest?.file ?? "none"}):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — ${Object.keys(route).length} codes map identically in ${ROUTE} and ${newest.file}`);
