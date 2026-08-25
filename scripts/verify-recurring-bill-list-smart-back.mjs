#!/usr/bin/env node
/**
 * UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY — GO-1540 continuation of the systemwide
 * back-button audit (waves 1-4, PRs #15860/#15866/#15871/#15882). A fresh full re-run of the
 * route-manifest sweep against the CURRENT main (post-wave-4) found exactly one new genuine item:
 * RecurringBillList.tsx's "Back to Bills" arrow was hardcoded to /accounting/bills, missed by the
 * earlier waves' detection because its aria-label is "Back to Bills", not the exact string "Back"
 * those waves matched on. Same smart-back fix as the rest of the app.
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped)) {
    failures.push(`${FILE}: must import hasInAppHistory from the shared smart-back helper`);
  }
  const historyIdx = stripped.indexOf("hasInAppHistory(window.history.state)");
  const fallbackIdx = stripped.indexOf('navigate("/accounting/bills")');
  if (historyIdx < 0 || fallbackIdx < 0 || historyIdx > fallbackIdx) {
    failures.push(`${FILE}: the hasInAppHistory check must run BEFORE the /accounting/bills fallback`);
  }
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = audit(source);

if (failures.length) {
  console.error(`verify-recurring-bill-list-smart-back FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "remove hasInAppHistory import",
      mutate: (t) => t.replace('import { hasInAppHistory } from "../../../lib/smart-back";\n', ""),
    },
    {
      name: "reorder so the /accounting/bills fallback runs first (dead-codes the fix)",
      mutate: (t) =>
        t.replace(
          `if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate("/accounting/bills");`,
          `navigate("/accounting/bills");
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }`
        ),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change source -- inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-recurring-bill-list-smart-back SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-recurring-bill-list-smart-back PASS — RecurringBillList's back arrow prefers real navigation history");
