#!/usr/bin/env node
/**
 * verify-cancellation-voids-expenses-and-advances.mjs
 *
 * SET-09 (owner 2026-09-03): cancelling a load did NOT void the load's expenses, did NOT release
 * bank matches, and did NOT reverse advances/liabilities. cancelLoadInClientTx already cascaded to
 * driver bills, settlements, and invoices (VOID-CANCEL-NOT-VOID) but stopped there.
 *
 * Bank-match release is not a separate step here: postVoidReversal (called by
 * executeVoidCancel("expense", ...)) already unconditionally releases any bank match on the entity
 * it voids (BANK-ORPHAN-01) -- voiding the expense closes that hole for free.
 */
import { readFileSync } from "node:fs";

const SERVICE_PATH = "apps/backend/src/dispatch/cancellation.service.ts";

function loadSource() {
  return readFileSync(SERVICE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!/await reverseDriverAdvanceInClientTx\(client, userId, input\.operating_company_id, \{/.test(src)) {
    failures.push("cancellation.service.ts does not call reverseDriverAdvanceInClientTx");
  }
  if (!/const expResult = await executeVoidCancel\("expense", \{/.test(src)) {
    failures.push("cancellation.service.ts does not void expenses via executeVoidCancel(\"expense\", ...)");
  }
  if (!/FROM accounting\.expenses[\s\S]{0,80}WHERE load_id = \$1::uuid AND operating_company_id = \$2::uuid AND status <> 'void'/.test(src)) {
    failures.push("open-expenses query for this load is missing or malformed");
  }
  if (!/FROM driver_finance\.driver_advances a[\s\S]{0,300}WHERE a\.load_id = \$1::uuid/.test(src)) {
    failures.push("load-linked driver_advances query is missing or malformed");
  }
  if (!/unreversableAdvances = loadAdvancesRes\.rows\.filter\(\(r\) => Number\(r\.paid_to_date \?\? 0\) > 0\)/.test(src)) {
    failures.push("advance-reversal cascade does not gate on paid_to_date > 0 (would silently un-recover a real settlement deduction)");
  }
  if (!/load_cancel_blocked_unreversable_advance/.test(src)) {
    failures.push("advance-reversal cascade does not fail loud on an unreversable advance");
  }
  if (!/expenses_voided: voidedExpenseIds/.test(src) || !/advances_reversed: reversedAdvanceIds/.test(src)) {
    failures.push("cancellation_money_artifacts audit does not record voided expenses / reversed advances");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-cancellation-voids-expenses-and-advances SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    ["expense-void loop removed", 'const expResult = await executeVoidCancel("expense", {', "const expResult = REMOVED({"],
    [
      "advance-reversal call removed",
      "await reverseDriverAdvanceInClientTx(client, userId, input.operating_company_id, {",
      "REMOVED({",
    ],
    [
      "paid_to_date gate removed",
      "const unreversableAdvances = loadAdvancesRes.rows.filter((r) => Number(r.paid_to_date ?? 0) > 0);",
      "const unreversableAdvances = [];",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-cancellation-voids-expenses-and-advances SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-cancellation-voids-expenses-and-advances SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-cancellation-voids-expenses-and-advances: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cancellation-voids-expenses-and-advances: OK — load cancellation voids open expenses (releasing their bank matches for free) and reverses load-linked advances/liabilities, gated on paid_to_date");
