#!/usr/bin/env node
/**
 * WAVE-C-invoice-bank-columns — the two BRAND-NEW Wave C money columns added by the owner's
 * 2026-08-12 surface-inventory expansion (#6273): `invoice` and `bank`. Both started at 0
 * built system-wide. This guard tags the leaves that are already real.
 *
 * INVOICE column (accounting module — 8 leaves): invoices.list / invoices.create and their
 * modals all already create real accounting.invoices rows via the shared InvoiceTypeModalBase
 * (createInvoice callback) — ManualInvoiceModal, DriverDamageInvoiceModal,
 * DriverMiscInvoiceModal, InvoiceCreateModal all reuse it, already verified real in
 * WAVE-C-gl_je-invoices-payments (PR #6231/#6235: create navigates to InvoiceDetailPage,
 * which renders real journal_entries). accounting.modal.bill_payment (BillPaymentModal.tsx)
 * is NOT tagged — it pays vendor BILLS (AP), not invoices (AR); no accounting.invoices
 * reference found. Real remaining gap, not over-claimed.
 *
 * BANK column (banking module — 21 leaves): accounts/transactions.categorize/reports/settings
 * are all the same real BankingHomePage.tsx (already verified real for banking.factoring /
 * banking.driver_escrow in PR #6237); reconciliation is BankReconciliationPage.tsx (real
 * bank_transaction_id matching); every listed modal/drawer/panel independently confirmed to
 * touch real banking.bank_accounts / banking.bank_transactions / accounting.journal_entries
 * (ManualJEModal creates a real JE). banking.modal.split_transaction and
 * banking.dialog.print_orientation are explicitly NOT tagged — SplitTransactionModal.tsx is
 * marked "@archived — superseded by BankTransactionSplitModal (live)" and
 * PrintOrientationDialog.tsx is a generic print-settings dialog with zero banking data. Real
 * remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["accounting"],"cols":["invoice"],"leafRe":"^(invoices\\.list|invoices\\.create|accounting\\.modal\\.invoice_create|accounting\\.modal\\.driver_damage_invoice|accounting\\.modal\\.driver_misc_invoice|accounting\\.modal\\.manual_invoice|accounting\\.parity\\.invoice_create|accounting\\.parity\\.invoice_type_modal_base)$","task":"WAVE-C-invoice-accounting","vertical":"column-wave"}
 * @matrix-built {"modules":["banking"],"cols":["bank"],"leafRe":"^(accounts|transactions\\.categorize|reconciliation|reports|settings|banking\\.modal\\.record_ccpayment|banking\\.parity\\.record_ccpayment|banking\\.modal\\.record_transfer|banking\\.parity\\.record_transfer|banking\\.modal\\.transfer|banking\\.parity\\.transfer|banking\\.modal\\.bank_transaction_split|banking\\.parity\\.bank_transaction_split|banking\\.modal\\.manage_accounts|banking\\.modal\\.manual_je|banking\\.parity\\.manual_je|banking\\.drawer\\.match|banking\\.parity\\.match|banking\\.panel\\.banking_plaid_connections)$","task":"WAVE-C-bank-banking-core","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-invoice-bank-columns.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-invoice-bank-columns";

const CHECKS = [
  {
    name: "InvoiceTypeModalBase.tsx creates real accounting.invoices via createInvoice callback",
    file: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
    pattern: /await createInvoice\(/,
  },
  {
    name: "InvoicesListPage.tsx create-modal onCreated navigates to real invoice detail",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /navigate\(`\/accounting\/invoices\/\$\{invoiceId\}`\)/,
  },
  {
    name: "BankingHomePage.tsx renders real banking accounts/tiles",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern: /current_balance/,
  },
  {
    name: "BankReconciliationPage.tsx matches real bank_transaction_id rows",
    file: "apps/frontend/src/pages/banking/BankReconciliationPage.tsx",
    pattern: /bank_transaction_id/,
  },
  {
    name: "RecordTransferModal.tsx wires real banking.bank_accounts",
    file: "apps/frontend/src/pages/banking/RecordTransferModal.tsx",
    pattern: /banking\.bank_accounts/,
  },
  {
    name: "ManualJEModal.tsx creates a real journal entry",
    file: "apps/frontend/src/pages/banking/components/ManualJEModal.tsx",
    pattern: /journal_entry_type_id/,
  },
  {
    name: "BankTransactionSplitModal.tsx inserts a real accounting.bills row",
    file: "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
    pattern: /INSERTs a real accounting\.bills row/,
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
    "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx": "const created = await createInvoice({",
    "apps/frontend/src/pages/accounting/InvoicesListPage.tsx": "navigate(`/accounting/invoices/${invoiceId}`)",
    "apps/frontend/src/pages/banking/BankingHome.tsx": "tile.current_balance",
    "apps/frontend/src/pages/banking/BankReconciliationPage.tsx": "bank_transaction_id: candidate.id",
    "apps/frontend/src/pages/banking/RecordTransferModal.tsx": "all active banking.bank_accounts",
    "apps/frontend/src/pages/banking/components/ManualJEModal.tsx": "journal_entry_type_id: journalEntryTypeId,",
    "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx":
      "// INSERTs a real accounting.bills row (source_bank_transaction_id ...)",
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
console.log(`[${LABEL}] PASS — accounting invoice leaves (8) + banking core+modal bank leaves (21) wiring present`);
