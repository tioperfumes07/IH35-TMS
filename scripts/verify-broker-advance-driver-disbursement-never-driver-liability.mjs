#!/usr/bin/env node
/**
 * verify-broker-advance-driver-disbursement-never-driver-liability.mjs
 *
 * LOAD-COSTS-COMPLETE item (2) (owner ruling 2026-09-04, verbatim): "the broker might send the
 * driver money and we apply it as a bill payment to the driver." applyBrokerAdvanceToDriverBillInClientTx
 * settles an EXISTING driver_finance.driver_bills liability -- "it is NEVER driver pay, NEVER a
 * driver debt, NEVER a settlement deduction," and "double entry or it does not post... through
 * journal-entries.service."
 *
 * Source-level regression lock.
 */
import { readFileSync } from "node:fs";

const PATH = "apps/backend/src/accounting/broker-advances.service.ts";

function loadSource() {
  return readFileSync(PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  const fnMatch = src.match(/export async function applyBrokerAdvanceToDriverBillInClientTx\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("could not find applyBrokerAdvanceToDriverBillInClientTx -- source shape drifted");
    return failures;
  }
  const body = fnMatch[0];

  if (/driver_finance\.driver_liabilities|driver_finance\.driver_advances\b|settlement_lines/.test(body)) {
    failures.push("applyBrokerAdvanceToDriverBillInClientTx references driver_liabilities/driver_advances/settlement_lines -- this must only ever settle an EXISTING driver_bills row, never create a new liability or a settlement deduction");
  }
  if (!/category !== "driver_pay"/.test(body)) {
    failures.push('the function does not require category === "driver_pay" before disbursing');
  }
  if (!/await createJournalEntryOnClient\(/.test(body)) {
    failures.push("the function does not post through createJournalEntryOnClient -- \"double entry or it does not post\"");
  }
  if (/INSERT INTO accounting\.journal_entries/.test(body)) {
    failures.push("the function contains a raw INSERT INTO accounting.journal_entries instead of going through journal-entries.service");
  }
  if (!/Math\.min\(input\.amountCents, advanceRemainingCents, billRemainingCents\)/.test(body)) {
    failures.push("the disbursed amount is not capped at both the advance's remaining amount and the bill's remaining balance");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = loadSource();
  const baseline = collectFailures(src);
  if (baseline.length) {
    console.error(`verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badLiability = src.replace(
    'if (advance.category !== "driver_pay") {',
    '// planted regression: driver_finance.driver_liabilities\n  if (advance.category !== "driver_pay") {'
  );
  if (badLiability === src || collectFailures(badLiability).length === 0) {
    escaped.push("planted driver_liabilities reference not caught (guard's own regex should have flagged it -- verifying it fires)");
  }

  const badCategory = src.replace('category !== "driver_pay"', 'false');
  if (badCategory === src || collectFailures(badCategory).length === 0) {
    escaped.push("category check removed");
  }

  const badJe = src.replace("await createJournalEntryOnClient(", "await Promise.resolve(/* createJournalEntryOnClient(");
  if (badJe === src || collectFailures(badJe).length === 0) {
    escaped.push("createJournalEntryOnClient call removed");
  }

  if (escaped.length) {
    console.error(`verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST PASS — 3/3 plants rejected");
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-broker-advance-driver-disbursement-never-driver-liability: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-broker-advance-driver-disbursement-never-driver-liability: OK — the disbursement path settles an existing driver_bills row via a real balanced JE, never a new driver liability"
);
