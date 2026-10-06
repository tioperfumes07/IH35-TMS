#!/usr/bin/env node
// U9 (owner, 2026-10-03) — "Print checks: only created-and-not-printed checks; the number is proposed at print and
// EDITABLE; the sequence continues from what he types; a duplicate warns; gaps are recorded with a reason". Static.
//   1. the queue lists only expense checks queued to print and not voided
//   2. ONE planner (planCheckNumbers) decides the numbers for both the preview and the assignment
//   3. the assignment refuses a duplicate, refuses unexplained skipped numbers, and records every skipped number
//      as a voided registry row carrying the reason
//   4. the page shows an editable number per check, the duplicate warning and the skipped-number reason, and no
//      longer overwrites the stock's next number before printing
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_print_checks_numbers_editable_gaps_recorded(); }
async function selftest_verify_print_checks_numbers_editable_gaps_recorded() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_print_checks_numbers_editable_gaps_recorded", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}

const LABEL = "verify-print-checks-numbers-editable-gaps-recorded";
const fails = [];
const routes = readFileSync("apps/backend/src/accounting/checks/checks.routes.ts", "utf8");
const queue = routes.slice(routes.indexOf('"/api/v1/checks/print-queue"'), routes.indexOf('"/api/v1/checks/print-queue"') + 1500);
for (const [re, msg] of [
  [/e\.payment_type = 'check'/, "expense checks only"],
  [/e\.print_status = 'need_to_print'/, "queued to print only"],
  [/e\.voided_at IS NULL/, "not voided"],
]) if (!re.test(queue)) fails.push(`print queue no longer filters ${msg}`);
if (!routes.includes('"/api/v1/checks/print-batch/preview"')) fails.push("the print preview route is gone");
if (!/numbers:\s*body\.numbers/.test(routes) || !/gap_reason:\s*body\.gap_reason/.test(routes)) fails.push("the print-batch route drops the typed numbers or the gap reason");

const svc = readFileSync("apps/backend/src/accounting/checks/check-print-batch.service.ts", "utf8");
if ((svc.match(/planCheckNumbers\(/g) ?? []).length < 1 || !/async function buildPreview/.test(svc)) fails.push("preview and assignment no longer share one planner");
if (!/assignPrintBatch[\s\S]{0,600}buildPreview\(/.test(svc)) fails.push("assignPrintBatch does not plan through buildPreview");
if (!/"DUPLICATE_CHECK_NUMBER"/.test(svc)) fails.push("a duplicate check number is no longer refused");
if (!/"GAP_REASON_REQUIRED"/.test(svc)) fails.push("skipped numbers no longer require a reason");
if (!/'voided', 0, NULL, \$4::uuid, now\(\), \$5/.test(svc) || !/Skipped at print/.test(svc)) fails.push("skipped numbers are no longer recorded as voided registry rows with the reason");
for (const src of ["banking.check_number_registry r", "accounting.expenses e", "accounting.bill_payments bp"]) {
  if (!svc.includes(src)) fails.push(`the duplicate search no longer reads ${src}`);
}

const plan = readFileSync("apps/backend/src/accounting/checks/check-number-plan.ts", "utf8");
if (!/numbers\[i - 1\] \+ 1n/.test(plan)) fails.push("the sequence no longer continues from the number above");

const page = readFileSync("apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx", "utf8");
for (const id of ["print-check-number", "print-check-duplicate", "print-gap-panel", "print-gap-reason"]) {
  if (!page.includes(`data-testid="${id}"`)) fails.push(`the Print checks page lost ${id}`);
}
const assign = page.slice(page.indexOf("async function handleAssign"), page.indexOf("async function handleConfirm"));
if (/putCheckStockSettings\(/.test(assign)) fails.push("Assign overwrites the stock's next number before printing again (an unrecorded jump)");
if (!/numbers:\s*typedNumbers/.test(assign)) fails.push("Assign no longer sends the numbers shown");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — print queue = checks to print; numbers proposed + editable, continue from the typed one; duplicates refused; skipped numbers recorded with a reason`);
