#!/usr/bin/env node
/**
 * F425C-EXHIBIT-C-UNVERIFIED-OPENING-FEEDS-TOTAL — Exhibit C (bank reconciliation) computed
 * closing_balance_cents = 0 (opening) + inflows - outflows for any account with no matching
 * reconciliation_sessions row for the period, then summed that fabricated number straight into
 * total_closing_cents with no disclosure at all — a $0 opening presented as if it were a real,
 * statement-backed balance. Live-confirmed reachable for USMCA today: of 3 real bank accounts,
 * only 1 ("USMCA FREIGHT" checking) has a reconciliation session for 2026-08; the other 2
 * ("Relay Fuel Wallet" and a second same-named checking account) have none.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibit-c-unverified-opening";
const BACKEND_FILE = "apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts";
const PRINT_FILE = "apps/frontend/src/pages/reports/form-425c/exhibitsPrintHtml.ts";

export function collectBackendProblems(src) {
  const problems = [];
  if (!/const opening = hasStatementOpening \? Math\.trunc\(Number\(row\.beginning_balance_cents\)\) : null/.test(src)) {
    problems.push(`${BACKEND_FILE}: opening must be null (never a fabricated 0) when no statement-backed balance exists`);
  }
  if (!/const closing = opening === null \? null : opening \+ inflows - outflows/.test(src)) {
    problems.push(`${BACKEND_FILE}: closing must be null when opening is null — never computed against a fabricated $0 baseline`);
  }
  if (!/accounts_excluded_from_total/.test(src)) {
    problems.push(`${BACKEND_FILE}: ExhibitC must expose accounts_excluded_from_total so the total's completeness is auditable`);
  }
  if (!/row\.closing_balance_cents \?\? 0/.test(src)) {
    problems.push(`${BACKEND_FILE}: total_closing_cents must sum via (closing_balance_cents ?? 0), not a bare sum that would break on null`);
  }
  return problems;
}

export function collectPrintProblems(src) {
  const problems = [];
  if (!/if \(cents === null \|\| cents === undefined\) return "—";/.test(src)) {
    problems.push(`${PRINT_FILE}: moneyCents must return "—" for null/undefined BEFORE Number() coercion (Number(null)===0 would print a fake "$0.00")`);
  }
  if (!/accounts_excluded_from_total/.test(src)) {
    problems.push(`${PRINT_FILE}: the Total closing line must surface accounts_excluded_from_total as a caveat`);
  }
  return problems;
}

const goodBackend = `
    const opening = hasStatementOpening ? Math.trunc(Number(row.beginning_balance_cents)) : null;
    const closing = opening === null ? null : opening + inflows - outflows;
  const total_closing_cents = accounts.reduce(
    (sum, row) => sum + (row.closing_balance_cents ?? 0),
    0,
  );
  const accounts_excluded_from_total = accounts.filter((row) => row.closing_balance_cents === null).length;
`;
const badBackend = `
    const opening = hasStatementOpening ? Math.trunc(Number(row.beginning_balance_cents)) : 0;
    const closing = opening + inflows - outflows;
  const total_closing_cents = accounts.reduce((sum, row) => sum + row.closing_balance_cents, 0);
`;

const goodPrint = `
function moneyCents(cents) {
  if (cents === null || cents === undefined) return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return n;
}
  if (payload.total_closing_cents != null) {
    const excluded = Number(payload.accounts_excluded_from_total ?? 0);
  }
`;
const badPrint = `
function moneyCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return n;
}
  if (payload.total_closing_cents != null) {
    parts.push(moneyCents(payload.total_closing_cents));
  }
`;

if (process.argv.includes("--selftest")) {
  if (collectBackendProblems(goodBackend).length) {
    console.error(`${LABEL} --selftest FAIL good backend`);
    process.exit(1);
  }
  if (collectBackendProblems(badBackend).length < 3) {
    console.error(`${LABEL} --selftest FAIL bad backend too weak`);
    process.exit(1);
  }
  if (collectPrintProblems(goodPrint).length) {
    console.error(`${LABEL} --selftest FAIL good print`);
    process.exit(1);
  }
  if (collectPrintProblems(badPrint).length < 2) {
    console.error(`${LABEL} --selftest FAIL bad print too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const backendSrc = fs.readFileSync(path.join(ROOT, BACKEND_FILE), "utf8");
const printSrc = fs.readFileSync(path.join(ROOT, PRINT_FILE), "utf8");
const problems = [...collectBackendProblems(backendSrc), ...collectPrintProblems(printSrc)];
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Exhibit C never fabricates a $0 opening/closing balance, and the total discloses any excluded unverified account`);
process.exit(0);
