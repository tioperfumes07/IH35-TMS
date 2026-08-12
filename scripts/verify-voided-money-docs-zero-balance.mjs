#!/usr/bin/env node
/**
 * ACCT-F376 — a voided BILL must read $0 balance_cents, never the un-netted amount_cents.
 *
 * apps/backend/src/accounting/bills.service.ts computes `balance_cents` for the two list endpoints
 * (listBillsByVendor / listBills -> listAllBillsForCompany) with a naive `amount_cents - paid_cents`.
 * Since voidBillInClientTx refuses to void a bill that still has payments
 * (bill_has_payments_cannot_void), paid_cents is legitimately 0 on every voided bill — which means
 * the naive formula reads the FULL original amount as still owed the moment a bill is voided.
 * Confirmed REACHABLE before shipping the fix (not academic): BillsPage.tsx's "Balance" column
 * renders bill.balance_cents directly for every row regardless of status, and the list endpoint's
 * own `status` query param explicitly supports fetching voided bills — a user on the Voided
 * tab/filter sees the wrong balance today. Live-measured on prod before this fix: 47 voided USMCA
 * bills, nonzero computed balance. Fixed via a shared computeBillBalanceCents() helper checked
 * against canonical (post-normalizeBill) status === "voided".
 *
 * ★ DELIBERATELY NOT TOUCHING accounting.invoices.amount_open_cents (a GENERATED column with the
 * same-shaped formula). That is the sibling class this finding started as investigating, and it was
 * ABANDONED after re-reading this board's own history: ACCT-F197 attempted exactly this (write, then
 * redefine-the-generated-expression) and was WITHDRAWN — every real read path for invoices
 * (ar-aging, fin20-aging, cash-forecast, invoices.routes, month-close, collections,
 * consolidated-statements, customer-financial, relationship-score, views.ar_aging) ALREADY filters
 * voided_at IS NULL, so the raw generated value is categorically unreachable by any application code
 * path — "fixing" it changes historical financial data for zero user-visible benefit and contradicts
 * a locked owner ruling (ACCT-F200) with its own tombstone guard (verify-step 2861,
 * verify-void-zeroes-open-balance.mjs) asserting the opposite. Do not resurrect that half without
 * re-reading ACCT-F197/ACCT-F200 in full first.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): bills.service.ts's
 * balance_cents computation must route through a helper that checks void status, not compute
 * `amount_cents - paid_cents` inline at either list call site.
 *
 * Self-test: node scripts/verify-voided-money-docs-zero-balance.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-voided-money-docs-zero-balance";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BILLS_TARGET = "apps/backend/src/accounting/bills.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Checks: no inline `amount_cents - paid_cents` at a balance_cents call site without routing
 * through a void-aware helper. */
export function checkBillsBalanceVoidAware(src) {
  const code = stripComments(src);

  const hasHelper = /function\s+computeBillBalanceCents\s*\(/.test(code);
  if (!hasHelper) return { ok: false, reason: "computeBillBalanceCents helper not found" };

  const helperMatch = /function\s+computeBillBalanceCents[\s\S]{0,400}/.exec(code);
  const helperBody = helperMatch ? helperMatch[0] : "";
  if (!/status\s*===\s*["']voided["']/.test(helperBody)) {
    return { ok: false, reason: "computeBillBalanceCents does not check status === 'voided'" };
  }

  // Every `balance_cents:` assignment in the file must call the helper, not inline the naive formula.
  // Captured to end-of-line (not first comma) since the naive formula's own Math.max(0, ...) call
  // contains a comma that would otherwise truncate the match before reaching amount_cents/paid_cents.
  const assignments = code.match(/balance_cents:\s*[^\n]+/g) ?? [];
  const inlineNaive = assignments.filter(
    (a) => /amount_cents\s*-\s*.*paid_cents/.test(a) && !/computeBillBalanceCents/.test(a)
  );
  if (inlineNaive.length > 0) {
    return {
      ok: false,
      reason: `${inlineNaive.length} balance_cents assignment(s) still inline the naive amount_cents - paid_cents formula instead of calling computeBillBalanceCents: ${inlineNaive.join(" | ")}`,
    };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    function computeBillBalanceCents(r) {
      if (r.status === "voided") return 0;
      return Math.max(0, r.amount_cents - r.paid_cents);
    }
    function listA() { return rows.map(r => ({ ...r, balance_cents: computeBillBalanceCents(r) })); }
    function listB() { return rows.map(r => ({ ...r, balance_cents: computeBillBalanceCents(r) })); }
  `;
  const goodResult = checkBillsBalanceVoidAware(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    function computeBillBalanceCents(r) {
      if (r.status === "voided") return 0;
      return Math.max(0, r.amount_cents - r.paid_cents);
    }
    function listA() { return rows.map(r => ({ ...r, balance_cents: computeBillBalanceCents(r) })); }
    function listB() { return rows.map(r => ({ ...r, balance_cents: Math.max(0, r.amount_cents - r.paid_cents) })); }
  `;
  const regressedResult = checkBillsBalanceVoidAware(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (one site reverted to inline naive formula) should FAIL but passed");

  const commentTrap = `
    // TODO: check status === "voided" in computeBillBalanceCents
    function listA() { return rows.map(r => ({ ...r, balance_cents: Math.max(0, r.amount_cents - r.paid_cents) })); }
  `;
  const trapResult = checkBillsBalanceVoidAware(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const billsPath = path.join(ROOT, BILLS_TARGET);
  if (!fs.existsSync(billsPath)) fail(`${BILLS_TARGET}: file not found`);
  const billsSrc = fs.readFileSync(billsPath, "utf8");
  const billsResult = checkBillsBalanceVoidAware(billsSrc);
  if (!billsResult.ok) fail(`${BILLS_TARGET}: ${billsResult.reason}`);

  console.log(`[${LABEL}] PASS — bills.service.ts balance_cents is void-aware at both call sites`);
}
