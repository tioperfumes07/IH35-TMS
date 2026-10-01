#!/usr/bin/env node
/**
 * verify-step 12057 -- ROUND 313 CC-1 #3: driver_finance.driver_settlements.settlement_model is never NULL.
 * FAILS IF any app writer INSERTs into driver_finance.driver_settlements without the settlement_model column,
 * or migration 202615180000 loses its NOT NULL CHECK.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-settlement-model-never-null";
const MIGRATION = "db/migrations/202615180000_driver_settlements_settlement_model_not_null.sql";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
function files(dir = "apps/backend/src", out = []) {
  for (const n of readdirSync(resolve(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    if (n === "__tests__" || n === "node_modules") continue;
    if (statSync(resolve(ROOT, rel)).isDirectory()) files(rel, out);
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(rel);
  }
  return out;
}
export function checkWriters(list) {
  const p = [];
  for (const [rel, raw] of list) {
    const src = raw.replace(/--[^\n]*/g, "");
    const re = /INSERT INTO driver_finance\.driver_settlements\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src)) !== null) if (!/\bsettlement_model\b/.test(m[1])) p.push(`${rel}: INSERT INTO driver_finance.driver_settlements without settlement_model.`);
  }
  return p;
}
export function checkMigration(sql) {
  return /CHECK \(settlement_model IS NOT NULL\)/.test(sql) && /VALIDATE CONSTRAINT driver_settlements_settlement_model_not_null/.test(sql)
    ? [] : [`${MIGRATION}: the NOT NULL CHECK on settlement_model is gone.`];
}
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, p, f) => { if ((p.length > 0) !== f) { console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(p)}`); ok = false; } };
  const all = files().map((f) => [f, read(f)]);
  ex("real writers", checkWriters(all), false);
  ex("writer missing model", checkWriters([["x.ts", "INSERT INTO driver_finance.driver_settlements (operating_company_id, driver_id) VALUES ($1,$2)"]]), true);
  ex("real migration", checkMigration(read(MIGRATION)), false);
  ex("migration lost check", checkMigration(read(MIGRATION).replace("CHECK (settlement_model IS NOT NULL)", "CHECK (true)")), true);
  console.log(ok ? `${LABEL} --selftest PASS (4/4)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [...checkWriters(files().map((f) => [f, read(f)])), ...checkMigration(read(MIGRATION))];
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- every driver_settlements writer stamps settlement_model; the database refuses NULL.`);
