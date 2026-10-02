#!/usr/bin/env node
// ROUND 300 (CC-1, proven on a Neon fork) — a void that reverses a document posted across several journal entries
// links the one reversing JE from EVERY original (reversed_by_je_id), so no schema rule may make reversed_by_je_id
// unique again. uq_je_reversed_by_je_id did exactly that and every multi-JE void failed with 23505 (fork: a prepaid
// asset with 3 posted periods -> HTTP 500). Fails if (1) migration 202615260100 stops dropping it, (2) any later
// migration recreates a UNIQUE index on journal_entries(reversed_by_je_id), or (3) postVoidReversal stops stamping
// every original.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-multi-je-void-links-every-original";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = "db/migrations";
const FIX = "202615260100_je_reversed_by_one_to_many.sql";
const VOID = "apps/backend/src/accounting/void.service.ts";

export function problems(migrations, voidSrc) {
  const p = [];
  const fix = migrations.find((m) => m.name === FIX);
  if (!fix || !/DROP INDEX IF EXISTS accounting\.uq_je_reversed_by_je_id/.test(fix.sql)) p.push(`${MIG_DIR}/${FIX} must drop accounting.uq_je_reversed_by_je_id`);
  for (const m of migrations) {
    if (m.name <= FIX) continue;
    if (/CREATE\s+UNIQUE\s+INDEX[\s\S]{0,200}journal_entries\s*\(\s*reversed_by_je_id\s*\)/i.test(m.sql)) p.push(`${MIG_DIR}/${m.name} makes journal_entries.reversed_by_je_id unique again (multi-JE voids would fail)`);
  }
  if (!/for \(const row of src\.rows\)[\s\S]{0,300}SET reversed_by_je_id = \$2::uuid/.test(voidSrc)) p.push(`${VOID}: postVoidReversal must stamp reversed_by_je_id on every original it reverses`);
  return p;
}

function load() {
  const migrations = readdirSync(path.join(ROOT, MIG_DIR)).filter((f) => f.endsWith(".sql")).sort().map((name) => ({ name, sql: readFileSync(path.join(ROOT, MIG_DIR, name), "utf8") }));
  return { migrations, voidSrc: readFileSync(path.join(ROOT, VOID), "utf8") };
}

export function run() { const { migrations, voidSrc } = load(); return problems(migrations, voidSrc); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { migrations, voidSrc } = load();
  const own = problems(migrations, voidSrc);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plant = [...migrations, { name: "209999990000_x.sql", sql: "CREATE UNIQUE INDEX uq_x ON accounting.journal_entries (reversed_by_je_id) WHERE reversed_by_je_id IS NOT NULL;" }];
    if (!problems(plant, voidSrc).length) { console.error(`${LABEL} --selftest FAIL — unique index re-creation not caught`); process.exit(1); }
    if (!problems(migrations, voidSrc.replace("for (const row of src.rows)", "for (const row of [])")).length) { console.error(`${LABEL} --selftest FAIL — single-original stamping not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a multi-JE void links its reversing JE from every original; no unique rule forbids it.`);
}
