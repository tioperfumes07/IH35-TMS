#!/usr/bin/env node
/**
 * 443.161 G6 — accounting.expenses_trailer_from_load() must honour the load's CURRENT trailer choice
 * (mdata.loads.trailer_source): 'none' → no trailer, 'customer' → the load's non-owned trailer, never an old company
 * trailer from assignment history. Asserts the LATEST migration that defines the function carries those branches.
 * --selftest: removes the 'none' branch from the latest definition and asserts the guard fails.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(ROOT, "db/migrations");

function latestDefinition() {
  const files = readdirSync(DIR).filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  let hit = null;
  for (const f of files) {
    const sql = readFileSync(resolve(DIR, f), "utf8");
    if (/CREATE OR REPLACE FUNCTION accounting\.expenses_trailer_from_load\(\)/.test(sql)) hit = { file: f, sql };
  }
  return hit;
}

function check(def) {
  const findings = [];
  if (!def) return ["no migration defines accounting.expenses_trailer_from_load()"];
  const body = def.sql.slice(def.sql.indexOf("CREATE OR REPLACE FUNCTION accounting.expenses_trailer_from_load()"));
  if (!/FROM mdata\.loads l[\s\S]{0,200}l\.operating_company_id = NEW\.operating_company_id/.test(body)) findings.push(`${def.file}: does not read the load's current choice (same company)`);
  if (!/IF v_source = 'none' THEN\s*RETURN NEW;/.test(body)) findings.push(`${def.file}: a 'none' load can still receive a company trailer`);
  if (!/IF v_source = 'customer' THEN[\s\S]{0,160}RETURN NEW;/.test(body)) findings.push(`${def.file}: a 'customer' load can still receive a company trailer`);
  const noneIdx = body.indexOf("v_source = 'none'");
  const histIdx = body.indexOf("dispatch.load_assignment_history");
  if (noneIdx < 0 || histIdx < 0 || histIdx < noneIdx) findings.push(`${def.file}: assignment history is read before the load's current choice`);
  return findings;
}

const def = latestDefinition();
if (process.argv.includes("--selftest")) {
  const mutated = def && { file: def.file, sql: def.sql.replace(/IF v_source = 'none' THEN\s*RETURN NEW;\s*END IF;/, "") };
  if (!mutated || mutated.sql === def.sql) { console.error("SELFTEST FAIL: could not remove the 'none' branch"); process.exit(1); }
  if (!check(mutated).length) { console.error("SELFTEST FAIL: guard missed the removed 'none' branch"); process.exit(1); }
  console.log("SELFTEST PASS: removing the 'none' branch is caught");
  process.exit(0);
}
const findings = check(def);
if (findings.length) {
  console.error(`verify-expense-trailer-reads-current-load-choice FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-expense-trailer-reads-current-load-choice PASS: ${def.file} honours the load's current trailer choice`);
