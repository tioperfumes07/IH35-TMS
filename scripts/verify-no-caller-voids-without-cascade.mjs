#!/usr/bin/env node
// ROUND 138 (owner order, via Lead relay, P0) — "No caller gets to void a parent on its own
// anymore." Static scan: any UPDATE to one of the five CASCADE_CHILDREN-registered parent tables
// (apps/backend/src/accounting/cascade-void-engine.service.ts) that writes a void signal
// (`voided_at` or `status = 'void'`/`status='void'`) must call `cascadeVoidChildren(` SOMEWHERE
// in the SAME file — the same same-file-signal shape as verify-no-unauthorized-production-write
// .mjs, built earlier this session for the exact same reason: a real safety property that's cheap
// to check per-file and expensive (and error-prone) to hand-audit across a sprawling call-site
// surface.
//
// Live-measured before this guard existed (br-fancy-credit-akjnd07a, 2026-09-23): 0 live invoices/
// bills/settlements but 119 live invoice_lines / 28 live bill_lines / 706 live settlement_lines
// under voided parents — proof that "voids the parent, never cascades to children" was a real,
// widespread pattern across this codebase's many independent void-write call sites, not a single
// bug in a single function.
//
// This guard does NOT decide whether a write site NEEDS a cascade by reading its business logic —
// it can't. It flags every file that contains a void-write signal against a registered parent
// table and has no `cascadeVoidChildren(` call anywhere in it. A file that is correctly exempt
// (e.g. it only ever reads voided_at, or its write is intentionally not a void event, or it
// delegates the whole write+cascade to another function this guard already cleared) goes in the
// shrink-only baseline below, WITH A REASON — never silently skipped, same shape as every other
// baseline this session built.
//
// SHRINK-ONLY: the baseline may only get smaller over time (a file leaving it, because it was
// wired, is fine; a file it doesn't already know about is a HARD FAIL, not a silent addition).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(REPO_ROOT, "apps/backend/src");
const BASELINE_PATH = path.join(__dirname, "verify-no-caller-voids-without-cascade.baseline.json");

// The exact five parent tables cascade-void-engine.service.ts's CASCADE_CHILDREN registers.
// company_settlement is deliberately EXCLUDED here: it has no live void-write caller anywhere in
// the codebase today (verified via full-repo grep before writing this guard) -- there is nothing
// to flag yet. When a void write path for it is built, it becomes cascade-eligible then, not
// speculatively enforced now against code that doesn't exist.
const PARENT_TABLES = [
  "accounting.invoices",
  "accounting.bills",
  "accounting.expenses",
  "driver_finance.driver_settlements",
  "accounting.factoring_advances",
];

// Negative lookbehind on `status = 'void'` excludes a CASE comparison branch (`WHEN status = 'void'
// THEN ...`, which READS the current value, never assigns it) -- a real false positive found live
// in factoring-posting/poster.service.ts's `status = CASE WHEN status = 'void' THEN 'void' ELSE
// 'factored' END` (preserves an already-void status, assigns nothing new).
const VOID_WRITE_SIGNAL = /voided_at\s*=(?!\s*NULL)|(?<!WHEN\s)status\s*=\s*'void'/;
const CASCADE_CALL_SIGNAL = /cascadeVoidChildren\s*\(/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function findUpdateBlocks(content, table) {
  // Every `UPDATE <table>` occurrence; the candidate statement body is bounded by the ENCLOSING
  // template-literal backticks (the nearest backtick before the match, to the next backtick after
  // it) -- not a comma/bracket heuristic. A comma-bracket search over-ran across statement
  // boundaries when a codebase author wrapped the closing `` `, `` and its `[args]` onto separate
  // lines (found live in settlement-payrun-reverse.service.ts: a driver_settlements UPDATE with no
  // void signal of its own bled into the NEXT statement's unrelated payrun_gl_runs status='void'
  // write, a false positive this fixed before the guard shipped).
  const blocks = [];
  const tableEscaped = table.replace(/\./g, "\\.");
  const updateRe = new RegExp(`UPDATE\\s+${tableEscaped}\\b`, "g");
  let match;
  while ((match = updateRe.exec(content)) !== null) {
    const start = match.index;
    const openTick = content.lastIndexOf("`", start);
    const blockStart = openTick > -1 && start - openTick < 200 ? openTick : start;
    const closeTick = content.indexOf("`", start);
    const blockEnd = closeTick > -1 ? closeTick : Math.min(start + 2000, content.length);
    blocks.push(content.slice(blockStart, blockEnd));
  }
  return blocks;
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    return { _law: "shrink-only; every entry needs a reason; see verify-no-caller-voids-without-cascade.mjs header", entries: [] };
  }
}

function main() {
  const baseline = loadBaseline();
  const baselineFiles = new Set(baseline.entries.map((e) => e.file));
  const files = walk(SRC_ROOT);

  const violations = [];
  const stillNeeded = new Set();

  for (const absFile of files) {
    const relFile = path.relative(REPO_ROOT, absFile);
    const content = readFileSync(absFile, "utf8");

    let flaggedTable = null;
    for (const table of PARENT_TABLES) {
      const blocks = findUpdateBlocks(content, table);
      for (const block of blocks) {
        if (VOID_WRITE_SIGNAL.test(block)) {
          flaggedTable = table;
          break;
        }
      }
      if (flaggedTable) break;
    }
    if (!flaggedTable) continue;

    const hasCascade = CASCADE_CALL_SIGNAL.test(content);
    if (hasCascade) continue; // wired -- fine, whether or not it's also in the baseline (baseline entry now stale, reported below)

    if (baselineFiles.has(relFile)) {
      stillNeeded.add(relFile);
      continue; // pre-existing, named exemption -- not a new violation
    }
    violations.push({ file: relFile, table: flaggedTable });
  }

  const staleBaselineEntries = baseline.entries.filter((e) => !stillNeeded.has(e.file));

  if (violations.length > 0) {
    console.error(`verify-no-caller-voids-without-cascade: ${violations.length} file(s) write a void signal to a registered parent table with NO cascadeVoidChildren( call in the same file, and are not in the baseline:`);
    for (const v of violations) console.error(`  - ${v.file} (${v.table})`);
    console.error(`\nEither wire cascadeVoidChildren(...) into the write, or add a reasoned entry to ${path.relative(REPO_ROOT, BASELINE_PATH)}.`);
    process.exit(1);
  }

  if (staleBaselineEntries.length > 0) {
    console.error(`verify-no-caller-voids-without-cascade: ${staleBaselineEntries.length} baseline entr(y/ies) no longer trigger the signal (file fixed or changed) -- baseline is shrink-only, remove them:`);
    for (const e of staleBaselineEntries) console.error(`  - ${e.file}`);
    process.exit(1);
  }

  console.log(`verify-no-caller-voids-without-cascade: PASS -- 0 unwired void-write call sites (${baseline.entries.length} pre-existing, reasoned baseline entries).`);
  process.exit(0);
}

main();
