#!/usr/bin/env node
/**
 * LV-EXPENSE-NUMBER-NEVER-POPULATED — `accounting.expenses.expense_number` was NULL on all 27,092
 * rows, and the reflex reading ("nobody built the number series, design one and backfill") is WRONG
 * in two ways that this guard exists to keep straight:
 *
 *   1. The series EXISTS. `expense_number` is a LOAD-SCOPED sequence (generateExpenseNumber →
 *      expense_attribution.expense_seq_per_load), not a QBO-style document number. A general expense
 *      with no load correctly has none — that is by design, not a gap.
 *   2. The real defect was ASYMMETRY between two branches of ONE create path: the auto-attribution
 *      branch generated the number, wrote expense_load_links and stamped expenses.expense_number; the
 *      explicit-load branch (`else if (body.load_id)`) stamped the load and did none of it — while its
 *      own comment asserted "the expense IS attributed to a load". 9 of 22 USMCA expenses carried a
 *      load_id with 0 numbers, and expense_load_links was 0 rows database-wide.
 *
 * So the invariant is symmetry: EVERY branch of the expense create path that attributes an expense to
 * a load must generate the number AND record the link. Backfilling old rows is deliberately NOT
 * asserted — a number implies an attribution event that never happened for them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3033-verify-explicit-load-expense-is-numbered";
const TARGET = path.join(ROOT, "apps/backend/src/accounting/expenses.routes.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** The explicit-load branch body: from `else if (body.load_id) {` to the next `} else if` / `} else`. */
function explicitLoadBranch(src) {
  const start = src.indexOf("} else if (body.load_id) {");
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const endRel = rest.search(/\n\s*\}\s*else\b/);
  return endRel === -1 ? rest : rest.slice(0, endRel);
}

function audit() {
  const problems = [];
  if (!fs.existsSync(TARGET)) return [`missing ${path.relative(ROOT, TARGET)}`];
  const src = fs.readFileSync(TARGET, "utf8");

  const branch = explicitLoadBranch(src);
  if (!branch) {
    // A refactor that renames/removes the branch must not let this guard pass vacuously.
    return [
      "could not locate the explicit-load branch `} else if (body.load_id) {` — the guard cannot verify symmetry and must not pass silently",
    ];
  }

  if (!/generateExpenseNumber\s*\(/.test(branch)) {
    problems.push(
      "explicit-load branch does not call generateExpenseNumber — a hand-stamped load expense would be attributed in substance and unnumbered in data (the original defect)"
    );
  }
  if (!/INSERT INTO\s+expense_attribution\.expense_load_links/i.test(branch)) {
    problems.push(
      "explicit-load branch does not INSERT expense_attribution.expense_load_links — the attribution would exist on the expense row but nowhere in the attribution ledger"
    );
  }
  if (!/UPDATE accounting\.expenses SET expense_number/i.test(branch)) {
    problems.push("explicit-load branch does not stamp accounting.expenses.expense_number");
  }

  // The number must come from the shared generator, never be composed locally — a second numbering
  // scheme is how two expenses end up sharing a number.
  if (/expense_number\s*=\s*[`'"]/.test(branch) || /\$\{\s*loadNumber/.test(branch)) {
    problems.push("explicit-load branch appears to compose an expense number literally — reuse generateExpenseNumber, never a second series");
  }

  return problems;
}

function selftest() {
  const original = fs.readFileSync(TARGET, "utf8");
  let planted = 0;

  /**
   * Mutate ONLY inside the explicit-load branch. The auto-attribution branch contains the same
   * statements and appears EARLIER in the file, so a naive String.replace edits the wrong branch and
   * the selftest reports a false INERT/pass — which is exactly what happened on the first run here.
   */
  const inBranch = (mutate) => (s) => {
    const start = s.indexOf("} else if (body.load_id) {");
    if (start === -1) return s;
    const rest = s.slice(start);
    const endRel = rest.slice(1).search(/\n\s*\}\s*else\b/);
    const end = endRel === -1 ? s.length : start + 1 + endRel;
    const region = s.slice(start, end);
    return s.slice(0, start) + mutate(region) + s.slice(end);
  };

  const mutations = [
    [
      "generator call removed (the original defect)",
      inBranch((b) => b.replace(/const numbered = await generateExpenseNumber\(client, body\.load_id\);/, "const numbered = { number: 'X', seq: 1, loadNumber: 'L' };")),
    ],
    [
      "link-row insert removed",
      inBranch((b) => b.replace(/INSERT INTO expense_attribution\.expense_load_links/, "INSERT INTO expense_attribution.disabled_links")),
    ],
    [
      "expense_number stamp removed",
      inBranch((b) => b.replace(/UPDATE accounting\.expenses SET expense_number/, "UPDATE accounting.expenses SET updated_at_noop")),
    ],
    ["branch renamed away (inert-guard detection)", (s) => s.replace("} else if (body.load_id) {", "} else if (body.some_other_field) {")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(original);
    if (broken === original) {
      fs.writeFileSync(TARGET, original);
      fail(`selftest INERT: mutation "${name}" did not apply — the guard proves nothing`);
    }
    // Restore BEFORE failing: process.exit() does not run finally blocks.
    fs.writeFileSync(TARGET, broken);
    const stillClean = audit().length === 0;
    fs.writeFileSync(TARGET, original);
    if (stillClean) fail(`selftest: expected FAIL after mutation "${name}"`);
    planted += 1;
  }

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS — explicit-load expense branch numbers and links its attribution, same as the auto-attribution branch`);
}
