#!/usr/bin/env node
// ACCT-F11120 — an INSERT … SELECT never gives one bind parameter two types.
//
// Measured on prod 11-09 (_system.background_jobs): safety.da_random_pool.quarterly_draw last succeeded 2026-08-16 and
// FAILED its 2026-10-01 run with "inconsistent types deduced for parameter $1" (42P08). scheduleTest wrote
//   INSERT INTO safety.da_test_records (operating_company_id, …) SELECT $1, d.id, … WHERE d.operating_company_id = $1::uuid
// safety.da_test_records.operating_company_id is TEXT, so Postgres deduced the bare $1 as text from the target column
// and as uuid from the cast — the statement never parsed, the quarter's FMCSA §382.305 random draw never happened, and
// bulkEnrollActiveDrivers carried the same defect (safety.da_program_enrollments.operating_company_id is TEXT too).
// Reproduced on prod with PREPARE (42P08, "uuid versus text"); the fixed statements PREPARE clean.
//
// RULE — in an INSERT … SELECT, a parameter that carries a cast anywhere in the statement carries that cast in the
// SELECT list too. The bare-parameter pattern is only safe when the target column already has the cast's type; those
// statements are pinned below by file + table + parameter after a prod type check (11-09), so a NEW bare parameter is
// refused and a pinned one that disappears must leave the list (shrink-only).
import fs from "node:fs";
import path from "node:path";

const ROOT = "apps/backend/src";

// file|table|param — target column type equals the cast type (information_schema read on prod 2026-11-09).
export const SAFE_BASELINE = new Set([
  "driver-finance/settlement-engine.ts|driver_finance.settlement_lines|$1", // settlement_id uuid
  "safety/driver-scheduler.service.ts|catalogs.driver_leave_balances|$1", // operating_company_id uuid
  "dispatch/loads/multi-stop/extra-rate.service.ts|dispatch.stop_extra_rates|$1", // operating_company_id uuid
  "dispatch/loads/multi-stop/extra-rate.service.ts|dispatch.stop_extra_rates|$2", // stop_uuid uuid
  "dispatch/loads/multi-stop/extra-rate.service.ts|dispatch.stop_extra_rates|$3", // load_uuid uuid
  "mdata/equipment.routes.ts|mdata.equipment|$8", // current_unit_id uuid
  "mdata/equipment.routes.ts|mdata.equipment|$9", // current_location_id uuid
  "banking/transaction-ingestion.ts|banking.bank_transactions|$1", // bank_account_id uuid
  "banking/transaction-ingestion.ts|banking.bank_transactions|$5", // amount_cents bigint
]);

// Tables whose id columns are TEXT on prod: a bare parameter cast to uuid elsewhere can never be pinned here.
const TEXT_ID_TABLES = new Set(["safety.da_test_records", "safety.da_program_enrollments"]);

const CAST = "(uuid|int|integer|bigint|date|timestamptz|numeric|boolean|text)";

export function findBareParams(rel, src) {
  const out = [];
  for (const m of src.matchAll(/`([^`]*)`/gs)) {
    const sql = m[1].replace(/--[^\n]*/g, "");
    const ins = sql.match(/\bINSERT\s+INTO\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/i);
    if (!ins) continue;
    const afterInsert = sql.slice(ins.index + ins[0].length);
    const sel = afterInsert.match(/\)\s*SELECT\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b|\bON\s+CONFLICT\b|\bRETURNING\b|$)/i);
    if (!sel) continue;
    const list = sel[1];
    const seen = new Set();
    for (const pm of list.matchAll(/\$(\d+)(?!\d)(?!\s*::)/g)) {
      const n = pm[1];
      if (seen.has(n)) continue;
      if (new RegExp(`\\$${n}(?!\\d)\\s*::\\s*${CAST}`, "i").test(sql)) {
        seen.add(n);
        out.push(`${rel}|${ins[1].toLowerCase()}|$${n}`);
      }
    }
  }
  return out;
}

export function audit(filesByRel) {
  const failures = [];
  const found = new Set();
  for (const [rel, src] of Object.entries(filesByRel)) {
    for (const key of findBareParams(rel, src)) {
      found.add(key);
      const table = key.split("|")[1];
      if (TEXT_ID_TABLES.has(table)) failures.push(`${key}: ${table} keeps ids as TEXT — a bare parameter there conflicts with its ::uuid use (42P08). Cast it in the SELECT list.`);
      else if (!SAFE_BASELINE.has(key)) failures.push(`${key}: bare parameter in an INSERT…SELECT list while the statement casts it elsewhere — cast it in the SELECT list (or prove the target column type and pin it).`);
    }
  }
  for (const key of SAFE_BASELINE) {
    if (!found.has(key)) failures.push(`${key}: pinned in SAFE_BASELINE but no longer present — remove the pin (shrink-only).`);
  }
  return { failures, found };
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function load(root) {
  const files = {};
  const base = path.join(root, ROOT);
  for (const p of walk(base, [])) files[path.relative(base, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.failures.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean.failures));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["scheduleTest regresses to a bare $1", plant("safety/drug-alcohol/program.service.ts", "SELECT $1::uuid, d.id, $3", "SELECT $1, d.id, $3")],
    ["bulk enroll regresses to a bare $1", plant("safety/drug-alcohol/random-pool.service.ts", "SELECT $1::uuid, d.id, $2", "SELECT $1, d.id, $2")],
    ["a new unpinned writer", { ...good, "x/new.ts": "const q = `INSERT INTO x.y (a, b) SELECT $1, $2 FROM z WHERE z.a = $1::uuid`;" }],
    ["a pinned writer fixed but still pinned", plant("mdata/equipment.routes.ts", "SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,", "SELECT $1,$2,$3,$4,$5,$6,$7,$8::uuid,$9::uuid,")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).failures.length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  // The detector itself: the exact prod statement is caught, the fixed one is not.
  const bad = findBareParams("t.ts", "`INSERT INTO safety.da_test_records (operating_company_id, driver_uuid) SELECT $1, d.id FROM mdata.drivers d WHERE d.operating_company_id = $1::uuid`");
  const fixed = findBareParams("t.ts", "`INSERT INTO safety.da_test_records (operating_company_id, driver_uuid) SELECT $1::uuid, d.id FROM mdata.drivers d WHERE d.operating_company_id = $1::uuid`");
  if (bad.length !== 1 || fixed.length !== 0) throw new Error(`SELFTEST FAIL: detector bad=${bad.length} fixed=${fixed.length}`);
  caught += 1;
  console.log(`verify-insert-select-param-types: SELFTEST PASS (${caught}/${cases.length + 1} planted defects caught)`);
  process.exit(0);
}

const { failures, found } = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-insert-select-param-types FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-insert-select-param-types: PASS — ${found.size} bare INSERT…SELECT parameters, all pinned with a matching target column type; 0 on TEXT-id tables`);
