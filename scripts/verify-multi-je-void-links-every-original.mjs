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


/**
 * The body of the loop that starts with `marker`, read by balancing braces rather than by counting
 * characters, so work added inside the loop never looks like the stamp being removed. Returns null
 * when the loop is gone entirely — which is itself the regression this guard exists to catch.
 */
function loopBodyAfter(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

export function problems(migrations, voidSrc) {
  const p = [];
  const fix = migrations.find((m) => m.name === FIX);
  if (!fix || !/DROP INDEX IF EXISTS accounting\.uq_je_reversed_by_je_id/.test(fix.sql)) p.push(`${MIG_DIR}/${FIX} must drop accounting.uq_je_reversed_by_je_id`);
  for (const m of migrations) {
    if (m.name <= FIX) continue;
    if (/CREATE\s+UNIQUE\s+INDEX[\s\S]{0,200}journal_entries\s*\(\s*reversed_by_je_id\s*\)/i.test(m.sql)) p.push(`${MIG_DIR}/${m.name} makes journal_entries.reversed_by_je_id unique again (multi-JE voids would fail)`);
  }
  // ROUND 393 (Lead, 2026-10-04) — this used to require `SET reversed_by_je_id = $2::uuid` within 300
  // CHARACTERS of `for (const row of src.rows)`. That is a proximity test, not a behaviour test, and a
  // later legitimate change broke it: ROUND 368.2(b) inserted releaseBankLinesNamingDocument() at the
  // top of the same loop, pushing the UPDATE past the window. The guard then reported
  // "postVoidReversal must stamp reversed_by_je_id on every original it reverses" while the code was
  // doing exactly that — measured live the same day: 1,469 originals reversed, 1,469 carrying
  // reversed_by_je_id, 0 originals reversed more than once. A guard that cries wolf teaches the team
  // to ignore it, which is worse than no guard. It now reads the LOOP BODY by balancing braces and
  // asserts the UPDATE is inside it, so any amount of legitimate work may be added to the loop and
  // only REMOVING the stamp fails.
  const stampLoop = loopBodyAfter(voidSrc, "for (const row of src.rows)");
  if (stampLoop === null) {
    p.push(`${VOID}: postVoidReversal no longer loops over every original (for (const row of src.rows))`);
  } else if (!/UPDATE accounting\.journal_entries SET reversed_by_je_id = \$2::uuid/.test(stampLoop)) {
    p.push(`${VOID}: postVoidReversal must stamp reversed_by_je_id on every original it reverses`);
  }
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
