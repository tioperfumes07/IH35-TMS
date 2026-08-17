#!/usr/bin/env node
/**
 * FINDING: LV-ACCTHUB-OPEN-INVOICES-INCLUDES-VOIDED — found live 2026-08-16 while performing the
 * assigned accounting Wave A1 live-verify of the `home` leaf. USMCA's Accounting Home "Open Invoices"
 * KPI card showed $34,873.57 · 24 open, while the Invoices list page (same company, same underlying
 * data) showed only $3,200.00 open across 3 proforma rows — a ~$32.9k live overstatement.
 *
 * ROOT CAUSE: accounting.invoices.amount_open_cents is a STORED GENERATED column (total_cents −
 * amount_paid_cents) that legitimately stays nonzero after a void — see ACCT-F200 /
 * verify-void-zeroes-open-balance.mjs. Voiding changes an invoice's validity, not its face value, so
 * every open-A/R read path MUST exclude voided rows explicitly. InvoicesListPage.tsx already carries
 * the fix for this exact class (LV-AR-OPEN-INCLUDES-VOIDED / ACCT-F5027) as exported
 * `isVoidInvoice`/`invoiceOpenCentsForDisplay` helpers — AccountingHubPage.tsx's separate ad-hoc KPI
 * computation was the one surface that never adopted them, summing the raw column unfiltered.
 *
 * FIX: AccountingHubPage.tsx's `openInvoices` now filters through the SAME isVoidInvoice /
 * invoiceOpenCentsForDisplay helpers imported from InvoicesListPage.tsx, instead of a bare
 * `amount_open_cents > 0` check.
 *
 * Static check (always runs): AccountingHubPage.tsx imports isVoidInvoice + invoiceOpenCentsForDisplay
 * from InvoicesListPage and openInvoices' filter predicate uses both — and does NOT regress to a bare
 * amount_open_cents comparison.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-hub-open-invoices-excludes-void";
const TARGET_REL = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertOpenInvoicesExcludesVoid(source) {
  const errors = [];
  const importsHelpers =
    /import\s*\{[^}]*invoiceOpenCentsForDisplay[^}]*\}\s*from\s*["']\.\/InvoicesListPage["']/.test(source) &&
    /import\s*\{[^}]*isVoidInvoice[^}]*\}\s*from\s*["']\.\/InvoicesListPage["']/.test(source);
  if (!importsHelpers) {
    errors.push("does not import isVoidInvoice + invoiceOpenCentsForDisplay from ./InvoicesListPage");
  }

  const openInvoicesMatch = source.match(/const openInvoices = invoices\.filter\(([^;]*?)\);/);
  if (!openInvoicesMatch) {
    errors.push("openInvoices filter assignment not found (renamed/removed?)");
  } else {
    const body = openInvoicesMatch[1];
    if (!body.includes("isVoidInvoice") || !body.includes("invoiceOpenCentsForDisplay")) {
      errors.push("openInvoices filter regressed to not use isVoidInvoice/invoiceOpenCentsForDisplay");
    }
    // The regressed shape this guard exists to catch.
    if (/Number\(invoice\.amount_open_cents\s*\?\?\s*0\)\s*>\s*0/.test(body)) {
      errors.push("openInvoices filter regressed to a bare amount_open_cents > 0 comparison (includes voided rows)");
    }
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertOpenInvoicesExcludesVoid(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "import removed",
      live.replace(
        /import \{ invoiceOpenCentsForDisplay, isVoidInvoice \} from "\.\/InvoicesListPage";\n/,
        ""
      ),
      "does not import isVoidInvoice",
    ],
    [
      "filter reverted to bare amount_open_cents check",
      live.replace(
        /const openInvoices = invoices\.filter\([^;]*?\);/,
        'const openInvoices = invoices.filter((invoice) => Number(invoice.amount_open_cents ?? 0) > 0);'
      ),
      "bare amount_open_cents > 0 comparison",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertOpenInvoicesExcludesVoid(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertOpenInvoicesExcludesVoid(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
