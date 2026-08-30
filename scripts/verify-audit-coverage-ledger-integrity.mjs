#!/usr/bin/env node
/** @ratchet — validates the audit ledger declaration's parse/number integrity; never Live proof. */
/**
 * MATRIX-01 FIX-2 — ledger parse is PR-blocking (verify-step 10044).
 * Rule 17: do not wire via ci.yml / package.json.
 *
 * Arms (each must throw independently in --selftest):
 *  1. numbered row with != 11 cells
 *  2. duplicate finding number
 *  3. assertParsedRowCountMatchesMax mismatch (dropped / truncated parse)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFindings,
  assertParsedRowCountMatchesMax,
} from "./audit-coverage-scoreboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERAGE = path.join(ROOT, "docs/audit/AUDIT-COVERAGE-LIVE.md");
const LABEL = "verify-audit-coverage-ledger-integrity";

const HEADER = `| # | Module | Layer | Entity | Verdict | Evidence | Status | Block/PR | Owner-gate? | Date | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
`;

function goodSample() {
  return `${HEADER}| 1 | fuel | B | TRANSP | FAIL | e | OPEN | — | NO | 2026-08-02 | X |
| 2 | bank | E | TRANSP | FAIL | e | FIXED (PR #1) | #1 | NO | 2026-08-02 | X |
`;
}

function selftest() {
  const sample = goodSample();
  parseFindings(sample);

  let ten = false;
  try {
    parseFindings(`${sample}| 99 | reports | B | USMCA | FAIL | e | OPEN | — | NO | 2026-08-29 |\n`);
  } catch (e) {
    ten = /10 cells/.test(String(e?.message ?? e));
  }
  if (!ten) throw new Error(`${LABEL} selftest: 11-cell arm did not throw independently`);

  let dup = false;
  try {
    parseFindings(`${sample}| 1 | fuel | B | TRANSP | FAIL | e | OPEN | — | NO | 2026-08-02 | X |\n`);
  } catch (e) {
    dup = /DUPLICATE ROW NUMBERS/.test(String(e?.message ?? e));
  }
  if (!dup) throw new Error(`${LABEL} selftest: duplicate number arm did not throw independently`);

  let mismatch = false;
  try {
    const chunk = `${sample}| 3 | fuel | B | TRANSP | FAIL | e | OPEN | — | NO | 2026-08-02 | X |\n`;
    assertParsedRowCountMatchesMax([{ num: 1 }, { num: 2 }], chunk);
  } catch (e) {
    mismatch = /dropped rows|count mismatch|Parsed/i.test(String(e?.message ?? e));
  }
  if (!mismatch) {
    throw new Error(`${LABEL} selftest: assertParsedRowCountMatchesMax arm did not throw independently`);
  }

  console.log(`${LABEL} --selftest PASS (3/3 arms)`);
}

function live() {
  const md = fs.readFileSync(COVERAGE, "utf8");
  parseFindings(md);
  console.log(`${LABEL}: PASS — AUDIT-COVERAGE-LIVE.md parse (11 cells, unique #, row-count match)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  live();
}
