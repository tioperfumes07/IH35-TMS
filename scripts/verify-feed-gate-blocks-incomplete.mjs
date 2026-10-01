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
];

export function check({ approval, migration, checks, routes }) {
  const problems = [];
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
