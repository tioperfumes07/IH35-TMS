#!/usr/bin/env node
/**
 * verify-bill-status-filter-uses-shared-vocabulary (BILLS-STATUS-VOCAB-01)
 *
 * WHY THIS GUARD EXISTS — measured live on 2026-10-03 (USMCA, Neon br-fancy-credit-akjnd07a):
 *   accounting.bills = 93 rows ($64,457.23), driver_finance.driver_bills = 136 rows ($94,640.08),
 *   and /accounting/bills rendered "No bills found." / "No driver bills found." — 0 of 0 — while
 *   printing those exact totals on the same screen. Four of the seven selectable status values,
 *   INCLUDING THE DEFAULT, blanked the whole register.
 *
 *   The mechanism: the page compared a SERVER PSEUDO-STATUS ("active", "all", "unpaid", "posted" —
 *   see applyBillListStatusFilter, apps/backend/src/accounting/bills.service.ts) against a row's
 *   CANONICAL status ("open" | "partial" | "paid" | "voided") with a literal membership test,
 *   `statusFilter.includes(bill.status)`. Those two vocabularies never intersect on a pseudo-status,
 *   so every row was dropped — client-side, silently, under correct-looking KPI tiles.
 *
 * WHAT THIS GUARD ENFORCES — one rule, which is the only thing that keeps it from coming back:
 *   the Bills register must decide status membership through the shared predicates in
 *   billStatusFilter.ts, which carry the server's vocabulary, and must never re-derive that
 *   decision inline from the raw selection array.
 *
 * Self-check: node scripts/verify-bill-status-filter-uses-shared-vocabulary.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-bill-status-filter-uses-shared-vocabulary";
const ROOT = process.cwd();
const PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const MODULE = "apps/frontend/src/pages/accounting/billStatusFilter.ts";
const TEST = "apps/frontend/src/pages/accounting/billStatusFilter.test.ts";

/**
 * The banned shape: any direct membership test of the status SELECTION against a row's status
 * field. Written against the selection identifier rather than a single literal so renaming the
 * default from "active" to another pseudo-status cannot slip past.
 */
const INLINE_MEMBERSHIP_RE =
  /statusFilter\s*\.\s*includes\s*\(\s*[A-Za-z_$][\w$]*\s*\.\s*status\s*\)/;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * A guard that reads prose reads the wrong thing. This guard's own first run failed on the comment
 * that QUOTES the removed code ("was `statusFilter.includes(bill.status)`") — a finding against a
 * sentence, not a behaviour. Strip comments before matching so the guard only ever judges code.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function findings(pageSource, moduleExists, testExists) {
  const out = [];
  const code = stripComments(pageSource);
  if (INLINE_MEMBERSHIP_RE.test(code)) {
    out.push(
      `${PAGE}: compares the status SELECTION to a row's status field inline ` +
        `(statusFilter.includes(<row>.status)). The selection speaks the server's vocabulary ` +
        `("active" / "all" / "unpaid" / "posted"); a row carries a canonical status. Decide ` +
        `membership through vendorBillMatchesStatusFilter / driverBillMatchesStatusFilter.`
    );
  }
  for (const fn of ["vendorBillMatchesStatusFilter", "driverBillMatchesStatusFilter"]) {
    if (!pageSource.includes(fn)) {
      out.push(`${PAGE}: does not use ${fn} — both bill tables must filter through the shared predicate.`);
    }
  }
  if (!pageSource.includes("BILL_STATUS_FILTER_VALUES")) {
    out.push(
      `${PAGE}: the status option list must be seeded from BILL_STATUS_FILTER_VALUES, so the option ` +
        `list and the predicates can never drift apart.`
    );
  }
  if (!moduleExists) out.push(`${MODULE}: missing — the shared vocabulary module is the fix; it may not be deleted.`);
  if (!testExists) out.push(`${TEST}: missing — the "no selectable value blanks the register" test may not be deleted.`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = `
    import { BILL_STATUS_FILTER_VALUES, vendorBillMatchesStatusFilter, driverBillMatchesStatusFilter } from "./billStatusFilter";
    const keep = vendorBillMatchesStatusFilter(bill, statusFilter, serverNarrowedStatus);
    const keep2 = driverBillMatchesStatusFilter(b, statusFilter, serverNarrowedStatus);
  `;
  const bad = good + `\n if (statusFilter.length > 0 && !statusFilter.includes(bill.status)) return false;`;
  const quotedInComment = good + `\n // BILLS-STATUS-VOCAB-01 — was \`statusFilter.includes(bill.status)\`, which compared vocabularies.`;
  const planted = findings(bad, true, true);
  const clean = findings(good, true, true);
  if (clean.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean source reported ${clean.length} finding(s): ${clean.join(" | ")}`);
    process.exit(1);
  }
  if (planted.length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — planted regression produced ${planted.length} finding(s), expected 1.`);
    process.exit(1);
  }
  if (findings(quotedInComment, true, true).length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — the banned shape quoted inside a comment must not be a finding.`);
    process.exit(1);
  }
  if (findings(good, false, true).length !== 1 || findings(good, true, false).length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — deleting the module or its test must be caught.`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS — 5/5 (clean, planted inline membership, banned shape quoted in a comment, module deleted, test deleted).`);
  process.exit(0);
}

const moduleExists = fs.existsSync(path.join(ROOT, MODULE));
const testExists = fs.existsSync(path.join(ROOT, TEST));
const results = findings(read(PAGE), moduleExists, testExists);

if (results.length > 0) {
  console.error(`${LABEL}: FAIL — ${results.length} violation(s):`);
  for (const r of results) console.error(`  - ${r}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — the Bills register decides status membership through the shared server vocabulary.`);
