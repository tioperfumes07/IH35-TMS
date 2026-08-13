#!/usr/bin/env node
/**
 * WAVE-C-invoice-cross-module — the `invoice` column outside the accounting module itself,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: customers.md.new_transaction,
 * customers.detail.billing, customers.detail.billing.record_payment, finance.nav.ar_ap_aging,
 * reports.report.ar_aging.
 *
 * All five already real, never tagged @matrix-built:
 *   - md.new_transaction hops to /accounting/invoices?customer_id=, the same real
 *     InvoicesListPage already verified in WAVE-C-invoice-accounting (PR #6279).
 *   - detail.billing / detail.billing.record_payment (CustomerDetail.tsx): renders real
 *     invoices via listInvoices(customer_id) with EntityLink kind="invoice" per row, and a
 *     complete Record Payment flow (recordCustomerPaymentMutation) that applies a real
 *     payment against real open invoices (amount_open_cents), not a stub — the visible
 *     "Backend pending" banner is a defensive fallback gated on an actual 404/500/501
 *     response, not the feature's real state.
 *   - finance.nav.ar_ap_aging / reports.report.ar_aging: both wire real AR-aging APIs already
 *     verified real for gl_je in WAVE-C-gl_je-finance-hop (PR #6275) and
 *     WAVE-C-gl_je-reports (PR #6265) — accounting.invoices-derived, same evidence extends to
 *     the invoice column.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["customers"],"cols":["invoice"],"leafRe":"^(md\\.new_transaction|detail\\.billing|detail\\.billing\\.record_payment)$","task":"WAVE-C-invoice-customers","vertical":"column-wave"}
 * @matrix-built {"modules":["finance","reports"],"cols":["invoice"],"leafRe":"^(nav\\.ar_ap_aging|report\\.ar_aging)$","task":"WAVE-C-invoice-aging-reports","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-invoice-cross-module.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-invoice-cross-module";

const CHECKS = [
  {
    name: "CustomerDetail.tsx renders real invoices via listInvoices(customer_id)",
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    pattern: /listInvoices\(operatingCompanyId!, \{ customer_id: id \}\)/,
  },
  {
    name: "CustomerDetail.tsx renders real EntityLink kind=invoice rows",
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    pattern: /kind="invoice"/,
  },
  {
    name: "CustomerDetail.tsx wires a real recordCustomerPaymentMutation submit",
    file: "apps/frontend/src/pages/CustomerDetail.tsx",
    pattern: /recordCustomerPaymentMutation\.mutateAsync/,
  },
  {
    name: "ArApAgingPage.tsx (finance) wires the real ar-aging API",
    file: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
    pattern: /getArAging/,
  },
  {
    name: "ARAgingPage.tsx (reports) wires the real ar-aging API",
    file: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
    pattern: /getArAgingReport/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/CustomerDetail.tsx":
      'listInvoices(operatingCompanyId!, { customer_id: id }) ... kind="invoice" ... recordCustomerPaymentMutation.mutateAsync()',
    "apps/frontend/src/pages/finance/ArApAgingPage.tsx": "getArAging, getApAging",
    "apps/frontend/src/pages/reports/ARAgingPage.tsx": "getArAgingReport(companyId, asOf)",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — customers invoice leaves + finance/reports AR aging invoice wiring present`);
