#!/usr/bin/env node
/**
 * ACCT-F5670 — consolidated-statement intercompany eliminations must reconstruct open balances AT
 * the reconstruction date and eliminate P&L on the PRE-TAX revenue basis.
 *
 * The defect class this pins (same class ACCT-F5658 removed from A/R aging, surviving here): the
 * elimination legs read the LIVE generated open-balance columns (invoices.amount_open_cents,
 * bills.paid_cents — today's payments) while filtering existence by the caller's as-of date. TRK
 * invoices USMCA $250,000 in Nov-2025, paid Jan-2026; a consolidated balance sheet as of 12/31/2025
 * run in Feb-2026 eliminated $0 (live open = 0), overstating consolidated assets AND liabilities by
 * $250,000 each — with balanced:true still reporting because both sides inflated equally. Second
 * arm: the P&L elimination used tax-inclusive total_cents while the documented revenue basis is
 * pre-tax (revenue-gl-linkage.service.ts: GREATEST(0, total_cents - COALESCE(tax_cents,0)); the
 * posting engine posts tax_cents to sales_tax_payable, never revenue).
 *
 * Contract locked here (on apps/backend/src/accounting/consolidated-statements.service.ts):
 *   1. NO live open-balance column read: neither `amount_open_cents` nor `paid_cents` may appear in
 *      the service's SQL (comments stripped).
 *   2. Bills leg reconstructs dated: `bp.payment_date <= $2::date` (bill_payments, revoked-aware) and
 *      a dated vendor_credit_applications netting term.
 *   3. Invoices leg reconstructs dated: `p.payment_date <= $2::date` via payment_applications with
 *      the as-of-aware unapplied_at term, and a dated credit_memo_applications netting term.
 *   4. Revenue leg is PRE-TAX: `- COALESCE(i.tax_cents, 0)` present in the revenue projection.
 *   5. 'factored' is handled per-leg: receivable leg zeroed via `CASE WHEN i.status = 'factored'
 *      THEN 0` (its A/R moved off trade A/R at the GL) while the row is NOT excluded from the
 *      revenue leg (factored revenue is still revenue).
 *
 * Run:  node scripts/verify-consolidated-eliminations-as-of-reconstruction.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-consolidated-eliminations-as-of-reconstruction";
const FILE = "apps/backend/src/accounting/consolidated-statements.service.ts";

export function analyze(src) {
  const failures = [];
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");

  if (/amount_open_cents/.test(code)) {
    failures.push(`${FILE}: reads the LIVE generated invoices.amount_open_cents — an as-of elimination must reconstruct the dated open balance (ACCT-F5670).`);
  }
  if (/\bpaid_cents\b/.test(code)) {
    failures.push(`${FILE}: reads the LIVE generated bills.paid_cents — an as-of elimination must reconstruct the dated outstanding balance (ACCT-F5670).`);
  }
  if (!/accounting\.bill_payments\s+bp[\s\S]{0,400}?bp\.payment_date <= \$2::date/.test(code)) {
    failures.push(`${FILE}: bills leg is missing the dated bill_payments reconstruction term (bp.payment_date <= $2::date).`);
  }
  if (!/accounting\.vendor_credit_applications\s+vca[\s\S]{0,400}?\(vca\.applied_at AT TIME ZONE 'UTC'\)::date <= \$2::date/.test(code)) {
    failures.push(`${FILE}: bills leg is missing the dated vendor_credit_applications netting term.`);
  }
  if (!/accounting\.payment_applications\s+pa[\s\S]{0,600}?p\.payment_date <= \$2::date/.test(code)) {
    failures.push(`${FILE}: invoices leg is missing the dated payment_applications reconstruction term (p.payment_date <= $2::date).`);
  }
  if (!/pa\.unapplied_at IS NULL OR \(pa\.unapplied_at AT TIME ZONE 'UTC'\)::date > \$2::date/.test(code)) {
    failures.push(`${FILE}: invoices leg is missing the as-of-aware unapplied_at term — an application unapplied AFTER the as-of still counted on that date.`);
  }
  if (!/accounting\.credit_memo_applications\s+cma[\s\S]{0,400}?\(cma\.applied_at AT TIME ZONE 'UTC'\)::date <= \$2::date/.test(code)) {
    failures.push(`${FILE}: invoices leg is missing the dated credit_memo_applications netting term.`);
  }
  if (!/-\s*COALESCE\(i\.tax_cents,\s*0\)[\s\S]{0,80}?AS revenue_cents/.test(code)) {
    failures.push(`${FILE}: revenue leg is not pre-tax — must subtract COALESCE(i.tax_cents, 0) per the documented revenue basis (revenue-gl-linkage.service.ts).`);
  }
  if (!/CASE WHEN i\.status = 'factored' THEN 0/.test(code)) {
    failures.push(`${FILE}: 'factored' must zero the RECEIVABLE leg per-leg (its A/R moved off trade A/R) without excluding the row's revenue leg.`);
  }
  if (/i\.status NOT IN \([^)]*'factored'[^)]*\)/.test(code)) {
    failures.push(`${FILE}: 'factored' must NOT be excluded at the invoice WHERE clause — that would drop factored intercompany REVENUE from the P&L elimination; handle it per-leg instead.`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL file should PASS but failed: ${good.join("; ")}`);

  // Mutation 1 — regress the invoices leg back to the live generated column.
  const m1 = real.replace(/CASE WHEN i\.status = 'factored' THEN 0 ELSE GREATEST\([\s\S]*?, 0\) END::bigint AS open_cents/,
    "GREATEST(COALESCE(i.amount_open_cents, 0), 0)::bigint AS open_cents");
  const f1 = analyze(m1);
  if (!f1.some((f) => f.includes("amount_open_cents"))) {
    throw new Error(`[${LABEL}] selftest: live amount_open_cents mutation should FAIL but got: ${f1.join("; ") || "(clean)"}`);
  }

  // Mutation 2 — regress the bills leg back to live paid_cents.
  const m2 = real.replace(/GREATEST\(\s*COALESCE\(b\.amount_cents, 0\)[\s\S]*?, 0\)::bigint AS outstanding_cents/,
    "GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)::bigint AS outstanding_cents");
  const f2 = analyze(m2);
  if (!f2.some((f) => f.includes("paid_cents"))) {
    throw new Error(`[${LABEL}] selftest: live paid_cents mutation should FAIL but got: ${f2.join("; ") || "(clean)"}`);
  }

  // Mutation 3 — regress the revenue leg to tax-inclusive.
  const m3 = real.replace(/GREATEST\(COALESCE\(i\.total_cents, 0\) - COALESCE\(i\.tax_cents, 0\), 0\)::bigint AS revenue_cents/,
    "COALESCE(i.total_cents, 0)::bigint AS revenue_cents");
  const f3 = analyze(m3);
  if (!f3.some((f) => f.includes("pre-tax"))) {
    throw new Error(`[${LABEL}] selftest: tax-inclusive revenue mutation should FAIL but got: ${f3.join("; ") || "(clean)"}`);
  }

  // Mutation 4 — exclude 'factored' at the WHERE clause (drops factored revenue from the P&L leg).
  const m4 = real.replace("AND i.status NOT IN ('void', 'voided', 'draft', 'proforma')",
    "AND i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')");
  const f4 = analyze(m4);
  if (!f4.some((f) => f.includes("must NOT be excluded"))) {
    throw new Error(`[${LABEL}] selftest: WHERE-clause 'factored' exclusion should FAIL but got: ${f4.join("; ") || "(clean)"}`);
  }

  console.log(`[${LABEL}] selftest: PASS — real file green; live-column (x2), tax-inclusive and factored-WHERE mutations all red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — eliminations reconstruct dated open balances (no live columns) and the P&L leg is pre-tax with per-leg 'factored' handling`);
