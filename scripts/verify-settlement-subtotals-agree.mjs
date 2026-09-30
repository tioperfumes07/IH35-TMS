#!/usr/bin/env node
/**
 * GUARD: a settlement sheet may never contradict itself.
 *
 * MEASURED on the live PDF of settlement 5800, 2026-09-30, immediately after the PDF was pointed
 * at the shared v10 document:
 *   LOAD 13551 -> a visible row "Addition  $50.00", and directly beneath it
 *                 "Total additions   0.00"
 *   DEDUCTIONS -> "No deductions on this settlement.   0.00", and directly beneath it
 *                 "Total deductions  -285.00"
 * Two contradictions, each inside a single block, on the document a driver is handed to check his
 * pay against. The subtotal was the literal string "0.00" in the template regardless of the line
 * above it, and the deduction block printed "none" over a non-zero header total.
 *
 * A number a driver cannot reconcile is worse than a number he cannot see: the first makes him
 * distrust the pay, the second makes him ask. Correct pay that looks wrong costs the same as wrong
 * pay until someone proves otherwise.
 *
 * THE RULE: every subtotal is computed or explicitly unknown, and a zero is never printed over a
 * non-zero total.
 *
 * Usage:  node scripts/verify-settlement-subtotals-agree.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-subtotals-agree";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TPL = "apps/backend/src/render/settlement.template.ts";

export function assertSubtotalsAgree(src) {
  const problems = [];

  // 1. No hardcoded money subtotal. A subtotal cell whose value is a literal is a lie waiting.
  const hardcoded = src.match(/Total (additions|deductions|load pay)<\/td><td class="r num[^"]*">(\d+\.\d\d)</);
  if (hardcoded) {
    problems.push(
      `${TPL}: "Total ${hardcoded[1]}" renders the LITERAL ${hardcoded[2]} instead of a computed value. ` +
        `That is the defect measured on settlement 5800 — a $50.00 addition with "Total additions 0.00" ` +
        `printed directly beneath it.`
    );
  }

  // 2. The additions subtotal must be derived, and must be honest when the figure is absent.
  if (!/const additionsSubtotal =/.test(src)) {
    problems.push(`${TPL}: additionsSubtotal is gone — the per-load additions total is no longer derived from anything.`);
  } else if (!/hasAddition\s*\n?\s*\?\s*"—"/.test(src) && !/\?\s*"—"/.test(src)) {
    problems.push(
      `${TPL}: additionsSubtotal no longer falls back to an em dash when the cents figure is absent. ` +
        `An unknown subtotal must read as unknown, never as a confident 0.00 the row above contradicts.`
    );
  }

  // 3. "No deductions" must never print over a non-zero total.
  if (!/deductionsUnexplained/.test(src)) {
    problems.push(
      `${TPL}: the deductionsUnexplained check is gone. A settlement whose deduction TOTAL is non-zero while its ` +
        `deduction LINES are empty is a document whose detail did not load — it must say so, not print "No deductions".`
    );
  } else if (!/model\.deductions\.length === 0 && model\.deductionsTotalCents !== 0/.test(src)) {
    problems.push(`${TPL}: deductionsUnexplained is no longer derived from empty lines AND a non-zero total.`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, TPL), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = read();
  const expect = (name, src, needle) => {
    const problems = assertSubtotalsAgree(src);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const live = assertSubtotalsAgree(good);
  if (live.length) failures.push(`live: ${live.join(" | ")}`);

  // 1. THE REAL REGRESSION, verbatim the line that shipped.
  expect(
    "hardcoded-additions-subtotal",
    good.replace('<td class="r num">${escapeHtml(additionsSubtotal)}</td>', '<td class="r num">0.00</td>'),
    "renders the LITERAL 0.00"
  );
  // 2. The derived subtotal is removed.
  expect("subtotal-not-derived", good.replace("const additionsSubtotal =", "const unusedSubtotal ="), "additionsSubtotal is gone");
  // 3. "No deductions" printed over a non-zero total again.
  expect("deductions-contradiction", good.replace(/deductionsUnexplained/g, "zzzUnused"), "deductionsUnexplained check is gone");
  // 4. The unexplained test stops looking at the total.
  expect(
    "unexplained-ignores-total",
    good.replace("model.deductions.length === 0 && model.deductionsTotalCents !== 0", "model.deductions.length === 0"),
    "no longer derived from empty lines AND a non-zero total"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 4/4 OK`);
  }
} else {
  const problems = assertSubtotalsAgree(read());
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
