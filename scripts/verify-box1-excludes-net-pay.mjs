#!/usr/bin/env node
/**
 * Static guard for BLOCK-17/24 (docs/specs/1099-and-tax-doc-BLOCK-17-DESIGN.md §4.3/§8): the
 * annual Box-1 (1099-NEC nonemployee compensation) aggregation must NEVER read
 * driver_settlements.net_pay and must NEVER subtract a `deduction` line. Box 1 = gross comp
 * EARNED, not net pay disbursed — building it off net_pay systematically understates Box 1.
 *
 * Pure source-text checks — no DB required.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = "apps/backend/src/tax-documents/box1-aggregation.service.ts";

let failed = 0;
function fail(msg) {
  console.error(`verify-box1-excludes-net-pay: ${msg}`);
  failed = 1;
}

const filePath = path.join(ROOT, TARGET);
if (!fs.existsSync(filePath)) {
  fail(`expected file is missing: ${TARGET}`);
  process.exit(1);
}
const source = fs.readFileSync(filePath, "utf8");

// Only fail on an actual code reference of the column (`s.net_pay`, `driver_settlements.net_pay`,
// or a bare `net_pay` column in a SQL SELECT list) — not on the file's own header prose, which
// intentionally documents this rule in English on `//` comment lines (excluded below).
const codeLines = source.split("\n").filter((line) => !line.trim().startsWith("//"));
const suspiciousLines = codeLines.filter((line) => /\.\s*net_pay\b/i.test(line) || /\bnet_pay\b\s*[,)]/i.test(line));
if (suspiciousLines.length > 0) {
  fail(`${TARGET} references net_pay directly — Box 1 must be computed from settlement_lines, never net_pay:\n  ${suspiciousLines.join("\n  ")}`);
}

if (!/BOX1_INCLUDED_LINE_TYPES/.test(source)) {
  fail(`${TARGET} must export BOX1_INCLUDED_LINE_TYPES so the exact included-line-type list is testable.`);
}

const requiredIncluded = ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"];
for (const type of requiredIncluded) {
  if (!source.includes(`"${type}"`)) {
    fail(`${TARGET} BOX1_INCLUDED_LINE_TYPES is missing required line_type "${type}".`);
  }
}

const forbiddenInSum = ["deduction", "reimbursement"];
// These must not appear inside the BOX1_INCLUDED_LINE_TYPES array literal itself.
const arrayMatch = source.match(/BOX1_INCLUDED_LINE_TYPES = \[([\s\S]*?)\] as const/);
if (arrayMatch) {
  for (const type of forbiddenInSum) {
    if (arrayMatch[1].includes(`"${type}"`)) {
      fail(`${TARGET} BOX1_INCLUDED_LINE_TYPES must NEVER include "${type}" — see §4.3 (deduction/reimbursement are never part of Box 1 in either direction).`);
    }
  }
} else {
  fail(`${TARGET} could not locate the BOX1_INCLUDED_LINE_TYPES array literal to check.`);
}

if (failed) {
  console.error("verify-box1-excludes-net-pay: FAILED");
  process.exit(1);
}
console.log("verify-box1-excludes-net-pay: OK — Box-1 aggregation never references net_pay and never includes deduction/reimbursement.");
