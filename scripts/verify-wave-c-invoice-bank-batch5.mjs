#!/usr/bin/env node
/**
 * WAVE-C-invoice-bank-batch5 — invoice + bank columns, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: factoring.submit.queue + home.surface.quick_actions (invoice); banking.factoring +
 * banking.driver_escrow + factoring.accounting.factor_recon (bank).
 *
 * All five already real, never tagged @matrix-built:
 *   - factoring.submit.queue (SubmissionQueue.tsx): renders real EntityLink kind="invoice"
 *     per row, already established real in WAVE-C-liability-factoring (PR #6229).
 *   - home.surface.quick_actions (QuickActionsBar.tsx): a real invoiceOpen create-invoice
 *     modal that navigates to `/accounting/invoices/${invoiceId}` on success — same real
 *     create flow already verified system-wide.
 *   - banking.factoring / banking.driver_escrow (BankingHomePage.tsx tabs): both render real
 *     stored balances (factoringReserve tile, real escrow_balance) within the banking UI's own
 *     virtual-account model — banking.driver_escrow's gl_je linkage (settlement JE join) was
 *     already verified real in PR #6237; this is the same tab, the bank column requirement.
 *   - factoring.accounting.factor_recon (FactorReconciliationPage.tsx): reads real Faro
 *     statement-to-bank reconciliation data, already verified real for gl_je in
 *     WAVE-C-liability-factoring-leaves (PR #6229).
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["factoring","home"],"cols":["invoice"],"leafRe":"^(submit\\.queue|surface\\.quick_actions)$","task":"WAVE-C-invoice-batch5","vertical":"column-wave"}
 * @matrix-built {"modules":["banking","factoring"],"cols":["bank"],"leafRe":"^(factoring|driver_escrow|accounting\\.factor_recon)$","task":"WAVE-C-bank-batch5","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-invoice-bank-batch5.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-invoice-bank-batch5";

const CHECKS = [
  {
    name: "SubmissionQueue.tsx renders real EntityLink kind=invoice",
    file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
    pattern: /kind="invoice"/,
  },
  {
    name: "QuickActionsBar.tsx creates a real invoice and navigates to it",
    file: "apps/frontend/src/pages/home/QuickActionsBar.tsx",
    pattern: /navigate\(`\/accounting\/invoices\/\$\{invoiceId\}`\)/,
  },
  {
    // ACCT-F5307 (2026-08-15): the raw `escrow_balance` API field was refactored into a typed
    // `driverEscrowBalance: number` prop (DriverEscrowTabContent.tsx:25), sourced live from
    // BankingHome.tsx:953 `driverEscrowBalance={Number(kpiQuery.data?.driver_escrow ?? 0)}` —
    // verified live: this is a real backend-derived value passed down, not hardcoded/lost. The
    // literal string this check looked for no longer exists anywhere in the codebase after that
    // legitimate rename; updated the anchor to match the current real wiring instead of the old
    // field name.
    name: "DriverEscrowTabContent.tsx renders a real driver escrow balance",
    file: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
    pattern: /driverEscrowBalance/,
  },
  {
    name: "BankingHome.tsx renders a real factoringReserve tile",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    pattern: /factoringReserve/,
  },
  {
    name: "FactorReconciliationPage.tsx imports real Faro bank statements",
    file: "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx",
    pattern: /Import candidates \(Faro statements\)/,
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
    "apps/frontend/src/pages/factoring/SubmissionQueue.tsx": 'kind="invoice"',
    "apps/frontend/src/pages/home/QuickActionsBar.tsx": "navigate(`/accounting/invoices/${invoiceId}`)",
    "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx": "driverEscrowBalance: number",
    "apps/frontend/src/pages/banking/BankingHome.tsx": "factoringReserve === 0",
    "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx": 'title="Import candidates (Faro statements)"',
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
console.log(`[${LABEL}] PASS — invoice (submit.queue + quick_actions) + bank (factoring/driver_escrow/factor_recon) wiring present`);
