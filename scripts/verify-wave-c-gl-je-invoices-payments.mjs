#!/usr/bin/env node
/**
 * WAVE-C-gl_je-invoices-payments — accounting module "GL / JE" column,
 * VERTICAL-WIRING-LAW-2026-08-12, leaves invoices.create + payments.receive.
 *
 * invoices.create: every create-flow modal (ManualInvoiceModal, DriverDamageInvoiceModal,
 * DriverMiscInvoiceModal, VendorChargebackModal, CustomerAdjustmentModal) already navigates to
 * /accounting/invoices/:id on success, and InvoiceDetailPage already renders a real
 * "GL / Journal entries" panel sourced from accounting.journal_entry_postings /
 * accounting.journal_entries (source_transaction_type='invoice', plus 'customer_payment' rows
 * applied to this invoice) — F-18b already fixed the memo label. This was real and live before
 * this guard; it was simply never tagged @matrix-built.
 *
 * payments.receive: RecordPaymentModal already navigates to /accounting/payments/:id on success,
 * but PaymentDetailPage had NO GL/JE panel at all — accounting.payments carries no
 * journal_entry_id column and fetchPaymentDetail never queried journal_entry_postings. Fixed here
 * by mirroring invoices.routes.ts:fetchInvoiceDetail's exact read-only query shape
 * (source_transaction_type='customer_payment', source_transaction_id=payment id) — reads the
 * SAME customer_payment JE the existing poster (posting-engine.service.ts) already writes. No
 * new GL math, no new table, no posting triggered by this read.
 *
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(invoices\\.create|payments\\.receive)$","task":"WAVE-C-gl_je-invoices-payments","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-invoices-payments.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-invoices-payments";

const CHECKS = [
  {
    name: "invoices.create: every create modal navigates to the invoice detail page on success",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /navigate\(`\/accounting\/invoices\/\$\{invoiceId\}`\)/,
  },
  {
    name: "invoices.create: InvoiceDetailPage renders real GL / Journal entries",
    file: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    pattern: /GL \/ Journal entries/,
  },
  {
    name: "payments.receive: RecordPaymentModal create navigates to the payment detail page on success",
    file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    pattern: /navigate\(`\/accounting\/payments\/\$\{paymentId\}`\)/,
  },
  {
    name: "payments.receive: payments.routes.ts fetchPaymentDetail joins journal_entry_postings for customer_payment",
    file: "apps/backend/src/accounting/payments.routes.ts",
    pattern: /source_transaction_type\s*=\s*'customer_payment'/,
  },
  {
    name: "payments.receive: PaymentDetailPage renders GL / Journal entries",
    file: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
    pattern: /GL \/ Journal entries/,
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
    "apps/frontend/src/pages/accounting/InvoicesListPage.tsx": "navigate(`/accounting/invoices/${invoiceId}`)",
    "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx": "GL / Journal entries",
    "apps/frontend/src/pages/accounting/PaymentsListPage.tsx": "navigate(`/accounting/payments/${paymentId}`)",
    "apps/backend/src/accounting/payments.routes.ts": "jep.source_transaction_type = 'customer_payment'",
    "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx": "GL / Journal entries",
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
console.log(`[${LABEL}] PASS — invoices.create + payments.receive gl_je wiring present`);
