#!/usr/bin/env node
/**
 * P0#3 (owner sequence 2026-08-11) — the driver recover/payable control on bank categorize must be
 * VISIBLE, not conditionally mounted.
 *
 * THE DEFECT: the box rendered only inside `{draft.driverId ? … : null}`, so a categorizer who did not
 * already know the feature existed had no way to discover that a company-paid driver expense CAN be
 * recovered on settlement. The control was invisible at exactly the moment the decision is made, which
 * is how a recoverable advance silently becomes a company expense — real money, lost quietly.
 *
 * WHAT IS ASSERTED: the box is always mounted (identified by its data-testid, not by a class name that
 * restyling would break), it is DISABLED rather than hidden when no driver is tagged, and the reason is
 * stated to the operator. Deliberately NOT asserted: exact colours — a design tweak must not redden a
 * behavioural guard (the CLS-GUARD-LITERAL-DETECTION lesson).
 */
import fs from "node:fs";
import path from "node:path";

const FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const LABEL = "verify-bank-categorize-recover-box-visible";

export function audit(src) {
  const problems = [];
  if (!/data-testid="bank-categorize-recover-box"/.test(src)) {
    problems.push(`${FILE}: the recover/payable box has no stable data-testid — it cannot be asserted or found in a test.`);
  }
  // The box must NOT be gated behind a driverId ternary that returns null.
  if (/\{draft\.driverId \? \(\s*<div className="mt-2 rounded-sm border/.test(src)) {
    problems.push(
      `${FILE}: the recover/payable box is conditionally MOUNTED on draft.driverId again — it must always ` +
        `render and be DISABLED when no driver is tagged, or the control is invisible at the moment the ` +
        `recovery decision is made (P0#3).`
    );
  }
  if (!/disabled=\{!draft\.driverId\}/.test(src)) {
    problems.push(`${FILE}: the recover checkbox must be disabled={!draft.driverId} rather than hidden.`);
  }
  if (!/Tag a driver above to enable recovery/.test(src)) {
    problems.push(`${FILE}: the disabled state must tell the operator WHY (tag a driver) — a dead checkbox with no reason is worse than a hidden one.`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.resolve(FILE), "utf8");
  const failures = [];
  if (audit(live).length) failures.push(`live source FAILS: ${audit(live).join(" | ")}`);
  const remounted = live.replace(
    /data-testid="bank-categorize-recover-box"/,
    'data-testid="something-else"'
  );
  if (remounted === live) failures.push("testid mutation INERT");
  else if (!audit(remounted).some((p) => p.includes("data-testid"))) failures.push("removing the testid was NOT caught");
  const reEnabled = live.replace(/disabled=\{!draft\.driverId\}/, "");
  if (reEnabled === live) failures.push("disabled mutation INERT");
  else if (!audit(reEnabled).some((p) => p.includes("disabled="))) failures.push("removing disabled= was NOT caught");
  const noReason = live.replace(/Tag a driver above to enable recovery/, "x");
  if (noReason === live) failures.push("reason mutation INERT");
  else if (!audit(noReason).some((p) => p.includes("WHY"))) failures.push("removing the reason was NOT caught");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 mutations caught, live source clean`);
  process.exit(0);
}

const abs = path.resolve(FILE);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${FILE} missing; scope wrong, refusing to pass vacuously.`);
  process.exit(1);
}
const problems = audit(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — recover/payable box always mounted, disabled with a stated reason when no driver is tagged.`);
process.exit(0);
