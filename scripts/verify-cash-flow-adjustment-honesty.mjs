#!/usr/bin/env node
/**
 * verify-cash-flow-adjustment-honesty.mjs
 * LV-CASH-FLOW-ADJUSTMENT-FALSE-BILL-EXPENSE-CREATOR — DailyPredictionTab must
 * not claim bill/expense create; must disclose projection-only; Add disabled
 * until label + nonzero amount readiness.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-cash-flow-adjustment-honesty";
const TARGET = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";

function analyze(src) {
  if (/Add new bill or expense/i.test(src)) {
    return { ok: false, reason: "still contains false '+ Add new bill or expense' wording" };
  }
  if (!/Add cash-flow adjustment/.test(src)) {
    return { ok: false, reason: "missing honest 'Add cash-flow adjustment' label" };
  }
  if (!/does not create an accounting bill or expense/i.test(src)) {
    return { ok: false, reason: "missing projection-only disclosure" };
  }
  if (!/adjustmentReady/.test(src)) {
    return { ok: false, reason: "missing adjustmentReady readiness predicate" };
  }
  if (!/disabled=\{!adjustmentReady\}/.test(src)) {
    return { ok: false, reason: "Add button must be disabled={!adjustmentReady}" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    <p>+ Add new bill or expense</p>
    <button disabled={mutation.isPending}>Add</button>
  `;
  const good = `
    const adjustmentReady = useMemo(() => true, []);
    <p>Add cash-flow adjustment</p>
    <p>Projection only — does not create an accounting bill or expense.</p>
    <button disabled={!adjustmentReady}>Add</button>
  `;
  if (analyze(bad).ok) fail("selftest expected BAD to fail");
  const g = analyze(good);
  if (!g.ok) fail(`selftest expected GOOD: ${g.reason}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = analyze(src);
if (!hit.ok) fail(hit.reason);
console.log(`${LABEL} PASS — cash-flow adjustment wording + readiness`);
