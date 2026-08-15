#!/usr/bin/env node
/**
 * verify-matrix-ledger-leaf-match-honest — SCOREBOARD-LEDGER-LEAF-MATCH-OVERBROAD.
 *
 * ROOT CAUSE: apps/backend/src/program/module-matrix.service.ts's leafTouchesText() used to fall
 * back to `leaf.id.split(".")[0]` (the leaf's stem) when none of its specific signals (leaf id,
 * route hint, route tail, sub) matched a ledger row's text. For the overwhelming majority of leaves
 * that stem IS the module id (e.g. "accounting.panel.detail" -> "accounting"), so the fallback
 * degenerated into "does this row mention the module name anywhere" — true for nearly every row in
 * that module. Any PROD-VERIFIED row anywhere in a module could grant Live-tier credit to EVERY leaf
 * needing a loosely-matched column, regardless of whether the row said anything about that leaf.
 * Separately, leafColumnLiveReason() had no SUPERSEDED-row exclusion (isAuditSignalVerdict already
 * had one) — a SUPERSEDED/FAIL row whose narrative cites a DIFFERENT sub-row's "PROD-VERIFIED" text
 * (e.g. ledger #598 = FAIL/SUPERSEDED, but its evidence cites "rows 619/633 PROD-VERIFIED") could
 * still grant Live-tier credit for row #598's own leaf/column match.
 *
 * Measured live 2026-08-15 (this worktree, current tree): removing the stem fallback + adding the
 * SUPERSEDED exclusion drops the module-matrix's own computed liveCells from 906 to 147 system-wide
 * (Accounting: 158 to 6) — i.e. ~84% of the previously-claimed "Live: PROD-VERIFIED" cells were false
 * credit from this pair of bugs, not real leaf-specific proof. This is the identical "leafRe:.*" /
 * word-blanket match class HONEST-BUILT-LAUNCH-LAW (2026-08-14) already banned for the Built tier's
 * @matrix-built tags (see isLeafSpecific() in matrix-built-auto.ts / verify-matrix-built-leaf-specific.mjs)
 * — this guard closes the equivalent hole on the ledger-based Audited/Live path.
 *
 * Usage:
 *   node scripts/verify-matrix-ledger-leaf-match-honest.mjs            # scan
 *   node scripts/verify-matrix-ledger-leaf-match-honest.mjs --selftest # inject regressions -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-ledger-leaf-match-honest";
const FILE = "apps/backend/src/program/module-matrix.service.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const src = readRel(root, FILE, overrides);

  // 1. leafTouchesText must never fall back to a bare leaf-stem (== module id in practice) match —
  //    that is a module-wide match, not a leaf-specific one.
  const fnMatch = src.match(/function leafTouchesText\([\s\S]*?\n}/);
  if (!fnMatch) {
    problems.push(`${FILE}: could not locate leafTouchesText() to audit`);
  } else if (/leaf\.id\.split\(["']\.["']\)\[0\]/.test(fnMatch[0])) {
    problems.push(
      `${FILE}: leafTouchesText() must not fall back to leaf.id's stem (== the module id for almost every leaf) — that credits an entire module's ledger rows to every leaf in it`,
    );
  }

  // 2. leafColumnLiveReason must exclude SUPERSEDED rows before trusting a PROD-VERIFIED substring —
  //    a SUPERSEDED/FAIL row citing a DIFFERENT sub-row's proof must never grant Live credit itself.
  const liveFnMatch = src.match(/function leafColumnLiveReason\([\s\S]*?\n}/);
  if (!liveFnMatch) {
    problems.push(`${FILE}: could not locate leafColumnLiveReason() to audit`);
  } else if (!/isSupersededRow\(row\)/.test(liveFnMatch[0])) {
    problems.push(
      `${FILE}: leafColumnLiveReason() must skip isSupersededRow(row) rows before matching isProdVerifiedBlob — otherwise a SUPERSEDED row's incidental "PROD-VERIFIED" citation of a different row grants it false Live credit`,
    );
  }

  // 3. isAuditSignalVerdict must keep excluding SUPERSEDED rows (regression guard on the existing
  //    control, since both paths now share isSupersededRow()).
  const auditFnMatch = src.match(/function isAuditSignalVerdict\([\s\S]*?\n}/);
  if (!auditFnMatch) {
    problems.push(`${FILE}: could not locate isAuditSignalVerdict() to audit`);
  } else if (!/isSupersededRow\(/.test(auditFnMatch[0])) {
    problems.push(`${FILE}: isAuditSignalVerdict() must exclude SUPERSEDED rows via isSupersededRow()`);
  }

  // 4. isSupersededRow itself must exist and check both status and verdict.
  if (!/function isSupersededRow\([\s\S]{0,200}?SUPERSEDED[\s\S]{0,200}?SUPERSEDED/.test(src)) {
    problems.push(`${FILE}: isSupersededRow() must exist and test both row.status and row.verdict for a leading SUPERSEDED marker`);
  }

  return problems;
}

export function run() {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return { ok: false, offenders: problems };
  }
  console.log(`${LABEL}: PASS — module-matrix ledger leaf-matching stays leaf-specific (no module-name-only fallback, no SUPERSEDED-row false Live credit)`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const real = readRel(ROOT, FILE);

  const plant = (label, overrides, expectFragment) => {
    const problems = collectProblems(ROOT, overrides);
    if (!problems.some((p) => p.includes(expectFragment))) {
      console.error(`${LABEL} SELFTEST FAIL: planted regression "${label}" was NOT caught`);
      process.exit(1);
    }
  };

  plant(
    "stem-fallback-reintroduced",
    {
      [FILE]: real.replace(
        "function leafTouchesText(leaf: RequiredLeaf, text: string): boolean {",
        'function leafTouchesText(leaf: RequiredLeaf, text: string): boolean {\n  const stem = leaf.id.split(".")[0];\n  if (stem) return new RegExp(stem).test(text);',
      ),
    },
    "must not fall back to leaf.id's stem",
  );

  plant(
    "live-reason-drops-superseded-check",
    {
      [FILE]: real.replace(
        /(function leafColumnLiveReason\([\s\S]*?)\n(\s*)if \(isSupersededRow\(row\)\) continue;\n/,
        "$1\n",
      ),
    },
    "must skip isSupersededRow(row)",
  );

  plant(
    "audited-signal-drops-superseded-check",
    {
      [FILE]: real.replace(
        /(function isAuditSignalVerdict\([\s\S]*?)\n\s*if \(isSupersededRow\(\{[\s\S]*?\}\)\) return false;\n/,
        "$1\n",
      ),
    },
    "must exclude SUPERSEDED rows via isSupersededRow",
  );

  plant(
    "is-superseded-row-removed",
    {
      [FILE]: real.replace(
        /function isSupersededRow\([\s\S]*?\n}\n\n/,
        "",
      ),
    },
    "isSupersededRow() must exist",
  );

  console.log(`${LABEL} SELFTEST PASS — 4 planted regressions all caught`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
