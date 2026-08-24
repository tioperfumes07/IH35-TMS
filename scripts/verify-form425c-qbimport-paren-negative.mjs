#!/usr/bin/env node
/**
 * F425C-QBIMPORT-PAREN-NEGATIVE-DROPPED-SIGN — the /425c Deposit Import (QBImportTab) preview
 * parser stripped "(" and ")" alongside "$,\s" before parseFloat, so a parenthesized negative
 * amount (the standard accounting convention for a reversed/NSF deposit, e.g. "(500.00)") silently
 * became a positive number. XFER_KW (the transfer/journal-entry exclusion keyword list) has no
 * reversal/void/NSF entries, so a reversed deposit line was not otherwise filtered — it would parse
 * as a positive "income" row in the preparer's preview instead of being excluded.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-qbimport-paren-negative";
const FILE = "apps/frontend/src/pages/form425c/lib/parseQBText.ts";

export function collectProblems(src) {
  const problems = [];
  if (!/isParenNegative/.test(src)) {
    problems.push(`${FILE}: must detect a parenthesized amount (e.g. "(500.00)") before parseFloat`);
  }
  if (!/-Math\.abs\(parsedAmt\)/.test(src)) {
    problems.push(`${FILE}: a parenthesized amount must be explicitly negated, not left positive`);
  }
  // The stale form must be gone: parseFloat run directly on a "()"-stripped string with no sign
  // recovery is the exact regression this guard exists to catch.
  if (/const amt = parseFloat\(rawAmt\);/.test(src)) {
    problems.push(`${FILE}: amt must not be assigned directly from parseFloat(rawAmt) — the paren sign would be lost again`);
  }
  return problems;
}

const good = `
    const lastCol = (cols[cols.length - 1] || "").trim();
    const isParenNegative = /^\\(.*\\)$/.test(lastCol);
    const rawAmt = lastCol.replace(/[$,\\s()]/g, "");
    const parsedAmt = parseFloat(rawAmt);
    const amt = isParenNegative && Number.isFinite(parsedAmt) ? -Math.abs(parsedAmt) : parsedAmt;
`;
const bad = `
    const rawAmt = (cols[cols.length - 1] || "").replace(/[$,\\s()]/g, "");
    const amt = parseFloat(rawAmt);
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 2) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — QB import preview never silently flips a parenthesized (reversed/NSF) deposit positive`);
process.exit(0);
