#!/usr/bin/env node
/**
 * verify-feed-gate-blocks-incomplete — FEED GATE (owner law 2026-10-01) stays wired:
 *  1. approveSettlement calls assertSubjectMayCloseOnClient BEFORE it stamps approval (the gate is not optional);
 *  2. the migration keeps the WORM trigger on feed_intake_checks, the delete refusal on feed_intakes, and the
 *     one-settlement-at-a-time trigger;
 *  3. the check catalog keeps every law-mandated check key (loads, revenue, A/R JE, driver bill, gross=bills, net math,
 *     deductions sourced, stamps, factoring link, costs, fuel);
 *  4. every feed-gate route carries a rateLimit config.
 * --selftest plants each regression in memory and asserts it is caught. Exit 1 on any miss.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const REQUIRED_KEYS = [
  "settlement.header_complete", "settlement.has_loads", "settlement.lines_carry_account_and_source", "settlement.deductions_sourced",
  "settlement.gross_equals_driver_bills", "settlement.net_math", "settlement.posted_to_ledger", "settlement.payment_linked_to_bank", "settlement.dates_stamped",
  "load.customer_present", "load.driver_unit_trailer_assigned", "load.trip_type_present", "load.stops_geocoded", "load.stops_stamped",
  "invoice.exists_with_live_line", "invoice.rate_equals_invoice", "invoice.ar_je_posted", "invoice.sent_stamped", "invoice.factoring_linked",
  "driver_bill.exists_not_void", "costs.expenses_linked_and_posted", "fuel.matched_to_load_unit_driver",
  "invoice.header_complete", "invoice.lines_carry_income_account", "invoice.has_live_line", "invoice.total_equals_lines",
  "expense.header_complete", "expense.lines_carry_category", "expense.posted", "expense.linked_to_operations",
  "bill.header_complete", "bill.lines_carry_account", "bill.ap_je_posted", "bill.linked_to_operations",
  "fuel.linked_unit_driver_vendor_load", "fuel.quantity_and_stamp", "fuel.expense_posted", "fuel.card_assigned",
];

export function check({ approval, migration, checks, routes, send, expenses, creator }) {
  const problems = [];
  if (creator !== undefined) {
    const gateIdx = creator.indexOf('assertSubjectMayCloseOnClient(client as never, draft.operating_company_id, "settlement"');
    const retIdx = creator.lastIndexOf("return {");
    if (gateIdx < 0) problems.push("postSettlementCreatorInClientTx no longer runs the feed gate before committing a settlement");
    else if (retIdx >= 0 && gateIdx > retIdx) problems.push("postSettlementCreatorInClientTx runs the gate after returning");
  }
  if (expenses !== undefined) {
    if (!expenses.includes("postSourceTransactionInClientTx(")) problems.push("POST /api/v1/expenses no longer posts inside the creation transaction (owner law: an expense always posts)");
    if (!expenses.includes("throw new ExpensePostRefused(")) problems.push("POST /api/v1/expenses no longer refuses the create when the poster fails");
    if (!expenses.includes('openAndRunIntake(String(user.uuid), body.operating_company_id, "expense"')) problems.push("POST /api/v1/expenses no longer runs the feed gate on the created expense");
  }
  if (send !== undefined) {
    const gateIdx = send.indexOf('assertSubjectMayCloseOnClient(client as never, input.operatingCompanyId, "invoice"');
    const sentIdx = send.indexOf("SET status = 'sent'");
    if (gateIdx < 0) problems.push("sendDraftInvoice no longer runs the feed gate before marking the invoice sent");
    else if (sentIdx >= 0 && gateIdx > sentIdx) problems.push("sendDraftInvoice marks 'sent' BEFORE the feed gate runs");
    if (!send.includes("invoice_send_refused_gl_post_failed")) problems.push("sendDraftInvoice no longer refuses the send when the A/R post fails (owner law: an invoice always posts)");
  }
  const fnStart = approval.indexOf("export async function approveSettlement(");
  const fnEnd = approval.indexOf("export async function", fnStart + 10);
  const body = fnStart >= 0 ? approval.slice(fnStart, fnEnd < 0 ? undefined : fnEnd) : "";
  const hookIdx = body.indexOf("assertSubjectMayCloseOnClient(");
  const stampIdx = body.indexOf("approval_status = 'approved'");
  if (hookIdx < 0) problems.push("approveSettlement no longer calls assertSubjectMayCloseOnClient — the feed gate is bypassed on approval");
  else if (stampIdx >= 0 && hookIdx > stampIdx) problems.push("approveSettlement stamps approval BEFORE running the feed gate");
  for (const needle of ["trg_feed_intake_checks_worm", "trg_worm_refuse_delete", "trg_feed_intake_one_settlement_at_a_time", "FORCE ROW LEVEL SECURITY"]) {
    if (!migration.includes(needle)) problems.push(`migration lost ${needle}`);
  }
  for (const k of REQUIRED_KEYS) if (!checks.includes(`key: "${k}"`)) problems.push(`check catalog lost ${k}`);
  const routeDefs = routes.match(/app\.(get|post|put|patch|delete)\("[^"]+",\s*([^,]+),/g) ?? [];
  for (const r of routeDefs) if (!/RL|rateLimit/.test(r)) problems.push(`route without rateLimit: ${r.slice(0, 60)}`);
  if (routeDefs.length < 4) problems.push(`expected >= 4 feed-gate routes, found ${routeDefs.length}`);
  return problems;
}

function load() {
  return {
    approval: read("apps/backend/src/settlements/approval.service.ts"),
    migration: read("db/migrations/202615170400_feed_gate_intakes.sql"),
    checks: read("apps/backend/src/driver-finance/feed-gate/feed-gate.checks.ts"),
    routes: read("apps/backend/src/driver-finance/feed-gate/feed-gate.routes.ts"),
    send: read("apps/backend/src/accounting/invoice-send.service.ts"),
    expenses: read("apps/backend/src/accounting/expenses.routes.ts"),
    creator: read("apps/backend/src/driver-finance/settlement-creator.service.ts"),
  };
}

function selftest() {
  const base = load();
  const cases = [
    ["hook removed", { ...base, approval: base.approval.replace("assertSubjectMayCloseOnClient(", "noop(") }],
    ["hook after stamp", { ...base, approval: base.approval.replace("await assertSubjectMayCloseOnClient", "/*moved*/").concat("\nawait assertSubjectMayCloseOnClient(") }],
    ["worm trigger dropped", { ...base, migration: base.migration.replace(/trg_feed_intake_checks_worm/g, "x") }],
    ["check key dropped", { ...base, checks: base.checks.replace('key: "settlement.gross_equals_driver_bills"', 'key: "gone"') }],
    ["route without rate limit", { ...base, routes: base.routes.replace('app.get("/api/v1/feed-gate/intakes", RL,', 'app.get("/api/v1/feed-gate/intakes", {},') }],
    ["send path gate removed", { ...base, send: base.send.replace('assertSubjectMayCloseOnClient(client as never, input.operatingCompanyId, "invoice"', 'noop("invoice"') }],
    ["send path post failure tolerated", { ...base, send: base.send.replace("invoice_send_refused_gl_post_failed", "ignored") }],
    ["expense create tolerates post failure", { ...base, expenses: base.expenses.replace("throw new ExpensePostRefused(", "void (") }],
    ["settlement creator skips the gate", { ...base, creator: base.creator.replace('assertSubjectMayCloseOnClient(client as never, draft.operating_company_id, "settlement"', 'noop("settlement"') }],
    ["expense create skips the gate", { ...base, expenses: base.expenses.replace('openAndRunIntake(String(user.uuid), body.operating_company_id, "expense"', 'noop("expense"') }],
  ];
  let bad = 0;
  for (const [name, input] of cases) { const p = check(input); if (p.length === 0) { console.error(`selftest FAIL: '${name}' not caught`); bad++; } }
  if (check(base).length) { console.error("selftest FAIL: clean source flagged:", check(base)); bad++; }
  console.log(bad ? `selftest FAIL (${bad})` : `selftest PASS: ${cases.length} planted regressions caught, clean source passes`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = check(load());
  if (problems.length) { console.error("verify-feed-gate-blocks-incomplete: FAIL\n  - " + problems.join("\n  - ")); process.exit(1); }
  console.log(`verify-feed-gate-blocks-incomplete: OK — approval runs the gate first, WORM + one-at-a-time triggers present, ${REQUIRED_KEYS.length} law checks in the catalog, every route rate-limited`);
}
