#!/usr/bin/env node
/**
 * ACCT-F59 tie-out basis fix (GO-2228 blocker, 2026-08-28)
 *
 * scripts/verify-gl-invariants.sql's INV-3 subledger tie-out used to compare GL to subledger with
 * is_sample_data included on BOTH sides -- internally consistent, but not comparable to what the
 * balance sheet / trial balance / P&L / cash-flow / register actually report, since PR #16832
 * excluded is_sample_data from all of those reports. A "$0.00" ar_difference on the old (sample-
 * included) basis proved nothing about what the balance sheet shows -- two different A/R numbers
 * existed under the same invariant name, and nothing stopped someone from citing the wrong one as
 * "the balance sheet ties out."
 *
 * This guard locks: INV-3's ar_gl/ap_gl CTEs join accounting.journal_entries and exclude
 * is_sample_data with the EXACT same predicate the report services use
 * (COALESCE(je.is_sample_data,false)=false, from balance-sheet.service.ts / trial-balance.service.ts
 * / etc, PR #16832), and ar_sub/ap_sub filter the subledger row's own is_sample_data column.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "scripts/verify-gl-invariants.sql";

export function check(src) {
  const failures = [];

  // Isolate INV-3's block so a real-only filter elsewhere in the file (e.g. a different invariant)
  // cannot false-pass this guard.
  const startMarker = "INV-3  SUBLEDGER TIE-OUT";
  const start = src.indexOf(startMarker);
  if (start === -1) {
    failures.push(`${FILE}: INV-3 block not found — guard out of sync`);
    return failures;
  }
  const nextEcho = src.indexOf("\\echo", start + startMarker.length);
  const block = nextEcho === -1 ? src.slice(start) : src.slice(start, nextEcho);

  if (!/JOIN accounting\.journal_entries je ON je\.id=p\.journal_entry_uuid[\s\S]*?WHERE a\.system_purpose='accounts_receivable'[\s\S]*?COALESCE\(je\.is_sample_data,false\)=false/.test(block)) {
    failures.push(`${FILE}: INV-3's ar_gl CTE no longer excludes je.is_sample_data — real-only basis lost`);
  }
  if (!/FROM accounting\.invoices[\s\S]*?status NOT IN \('draft','proforma'\)[\s\S]*?COALESCE\(is_sample_data,false\)=false/.test(block)) {
    failures.push(`${FILE}: INV-3's ar_sub CTE no longer excludes invoices.is_sample_data — real-only basis lost`);
  }
  if (!/JOIN accounting\.journal_entries je ON je\.id=p\.journal_entry_uuid[\s\S]*?WHERE a\.system_purpose='accounts_payable'[\s\S]*?COALESCE\(je\.is_sample_data,false\)=false/.test(block)) {
    failures.push(`${FILE}: INV-3's ap_gl CTE no longer excludes je.is_sample_data — real-only basis lost`);
  }
  if (!/FROM accounting\.bills[\s\S]*?status<>'draft'[\s\S]*?COALESCE\(is_sample_data,false\)=false/.test(block)) {
    failures.push(`${FILE}: INV-3's ap_sub CTE no longer excludes bills.is_sample_data — real-only basis lost`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: gl-invariants-inv3-real-only-basis");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: verify-gl-invariants.sql's INV-3 subledger tie-out computes on the REAL-ONLY basis " +
      "(is_sample_data excluded on both GL and subledger sides), matching the balance-sheet/TB/P&L reports"
  );
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: revert to the exact pre-fix ar_gl/ar_sub shape (no journal_entries join, no
  // is_sample_data filter at all) — the real pre-fix content.
  const offenderA = src.replace(
    /WITH ar_gl AS \(SELECT coalesce\(sum\(CASE WHEN p\.debit_or_credit='debit' THEN p\.amount_cents ELSE -p\.amount_cents END\),0\)\/100\.0 g\n {15}FROM accounting\.journal_entry_postings p\n {15}JOIN catalogs\.accounts a ON a\.id=p\.account_id\n {15}JOIN accounting\.journal_entries je ON je\.id=p\.journal_entry_uuid\n {15}WHERE a\.system_purpose='accounts_receivable' AND a\.operating_company_id=:'USMCA'\n {17}AND je\.status<>'voided' AND COALESCE\(je\.is_sample_data,false\)=false\),\n {5}ar_sub AS \(SELECT coalesce\(sum\(amount_open_cents\),0\)\/100\.0 s FROM accounting\.invoices\n {15}WHERE operating_company_id=:'USMCA' AND voided_at IS NULL AND status NOT IN \('draft','proforma'\)\n {17}AND COALESCE\(is_sample_data,false\)=false\),/,
    `WITH ar_gl AS (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)/100.0 g
               FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
               WHERE a.system_purpose='accounts_receivable' AND a.operating_company_id=:'USMCA'),
     ar_sub AS (SELECT coalesce(sum(amount_open_cents),0)/100.0 s FROM accounting.invoices
               WHERE operating_company_id=:'USMCA' AND voided_at IS NULL AND status NOT IN ('draft','proforma')),`
  );
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (ar_gl/ar_sub reverted to sample-included basis) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: drop only the ap-side filters, leave ar-side intact.
  const offenderB = src.replace(
    "WHERE a.system_purpose='accounts_payable' AND a.operating_company_id=:'USMCA'\n                 AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false),",
    "WHERE a.system_purpose='accounts_payable' AND a.operating_company_id=:'USMCA'),"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (ap_gl real-only filter dropped) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
