#!/usr/bin/env node
/**
 * ap_bill COLUMN-WAVE — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["banking","drivers"],"cols":["ap_bill"],"task":"WAVE-C-ap_bill","vertical":"column-wave","leafRe":".*"}
 *
 * Audited ap_bill (accounts-payable bill linkage) across all 10 priority modules. lists, accounting
 * (sink), factoring, customers, safety: N/A, no bill-causing leaf. vendors already WIRED. Three real
 * gaps fixed:
 *   - banking (reverse, bill payment → causing bank txn): bills.service.ts's
 *     BILL_PAYMENT_BANK_TRANSACTION_ID_SQL only checked the manual-reconciliation reverse hop
 *     (bt.matched_bill_payment_id); a split-created payment's bill_payments.source_bank_transaction_id
 *     column — already read correctly by the sibling vendor-bill-payments.routes.ts — was never
 *     checked here.
 *   - banking (forward, single-txn split → vendor bill): BankTransactionSplitModal.tsx rendered
 *     "· bill created" as plain text when bank-transaction-splits.service.ts genuinely created a real
 *     accounting.bills row.
 *   - drivers (reverse, bill → the cash advance that funded it): driver_finance.driver_advances.
 *     linked_bill_id was already forward-wired (AdvanceDetailDrawer.tsx); bills.service.ts's
 *     getBillDetail never resolved the reverse, and BillDetailPage.tsx had nothing to render.
 *
 * REMAINING (documented, not silently dropped — see the shipping commit): settlements creates a
 * real accounting.bills row per load (settlement-bill-payment-posting.service.ts, flag ON) but has
 * ZERO UI surface anywhere across 4 checked pages — a genuine gap, larger scope (new UI section, not
 * a reverse-JOIN) deferred to a dedicated follow-up. dispatch's load↔bill link is a manual
 * operator-typed tag with a real forward render but no reverse query/page — lower-value, also
 * deferred. banking's bulk "post as bill" route is a deliberate, explicitly-tagged
 * [HOLD-FOR-JORGE — TIER 1] in its own test — correctly NOT wired to any UI, not a gap.
 *
 * Self-test: node scripts/verify-ap-bill-column-wave.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ap-bill-column-wave";

const CHECKS = [
  {
    name: "banking: bills.service.ts reverse SQL checks source_bank_transaction_id first",
    file: "apps/backend/src/accounting/bills.service.ts",
    pattern: /COALESCE\(\s*\n\s*bp\.source_bank_transaction_id::text,/,
  },
  {
    name: "banking: bills.service.ts exposes linked_cash_advance_id",
    file: "apps/backend/src/accounting/bills.service.ts",
    pattern: /linked_cash_advance_id: linkedCashAdvanceId/,
  },
  {
    name: "banking: BankTransactionSplitModal renders the bill EntityLink",
    file: "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
    pattern: /kind="bill" id=\{result\.bill_id\}/,
  },
  {
    name: "drivers: BillDetailPage renders the linked cash advance",
    file: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    pattern: /kind="cash_advance" id=\{bill\.linked_cash_advance_id\}/,
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
    "apps/backend/src/accounting/bills.service.ts":
      "const X = `\n  COALESCE(\n    bp.source_bank_transaction_id::text,\n    (SELECT 1)\n  )\n`;\n" +
      "linked_cash_advance_id: linkedCashAdvanceId,",
    "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx": '<EntityLink kind="bill" id={result.bill_id} />',
    "apps/frontend/src/pages/accounting/BillDetailPage.tsx": '<EntityLink kind="cash_advance" id={bill.linked_cash_advance_id} />',
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
console.log(`[${LABEL}] PASS — banking (2 leaves) + drivers ap_bill reverse-link fixes all present`);
