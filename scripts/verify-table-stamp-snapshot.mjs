#!/usr/bin/env node
// ROUND 326 queue item 23 (CC-1) — the table-and-stamp snapshot stays a READ-ONLY, self-discovering report. Fails if
// scripts/ops/table-stamp-snapshot.mjs stops running inside a READ ONLY transaction that it rolls back, gains any
// write statement, stops discovering tables from information_schema, or drops a linkage stamp the owner named.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-table-stamp-snapshot";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/ops/table-stamp-snapshot.mjs";
const NAMED = ["Operating company", "Load", "Driver", "Unit", "Trailer", "Customer", "Vendor", "Settlement", "Invoice", "Journal entry", "Item", "Account", "Class", "Voided", "Sample flag"];

export function problems(src) {
  const p = [];
  if (!/client\.query\("BEGIN READ ONLY"\)/.test(src) || !/client\.query\("ROLLBACK"\)/.test(src)) p.push("the snapshot must run in a READ ONLY transaction and roll it back");
  if (/\b(INSERT\s+INTO|UPDATE\s+\w+\.\w+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(src)) p.push("the snapshot must contain no write statement");
  if (!/FROM information_schema\.columns/.test(src)) p.push("the snapshot must discover its tables from information_schema");
  for (const n of NAMED) if (!src.includes(`["${n}",`)) p.push(`the snapshot must report the "${n}" stamp`);
  if (!/"Null across the board"/.test(src)) p.push("the snapshot must list stamp columns null across a non-empty table");
  return p;
}

export function run() {
  return problems(readFileSync(path.join(ROOT, FILE), "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["writes", src + "\nawait client.query('DELETE FROM accounting.bills');"],
      ["not read-only", src.replace('client.query("BEGIN READ ONLY")', 'client.query("BEGIN")')],
      ["stamp dropped", src.replace('["Trailer",', '["Trailr",')],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the snapshot is read-only, self-discovering, and reports every named stamp.`);
}
