#!/usr/bin/env node
/**
 * WAVE-C-bank-cross-module — the `bank` column outside the banking module itself,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: cash-flow.hop.banking, home.jump.banking,
 * system.hop.banking_recon, form_425.law.virtual_banks_excluded, dispatch.load.banking,
 * fleet.unit.profile.bank_txns, fleet.trailer.profile.bank_txns.
 *
 * All seven already real, never tagged @matrix-built:
 *   - hop.banking / jump.banking / hop.banking_recon all hop to /banking
 *     (BankingHomePage.tsx), already verified real for the banking module's own leaves in
 *     WAVE-C-bank-banking-core (PR #6279).
 *   - form_425.law.virtual_banks_excluded: form-425c.routes.ts computes line_19_opening_cash
 *     by directly querying FROM banking.bank_transactions JOIN banking.bank_accounts filtered
 *     account_type NOT LIKE 'virtual_%' — already verified real in
 *     WAVE-C-gl_je-form425c (PR #6274), same evidence applies to the bank column.
 *   - dispatch.load.banking (LoadBankingLinkagePage.tsx) and fleet.unit.profile.bank_txns /
 *     trailer.profile.bank_txns (VehicleProfilePage.tsx / TrailerProfilePage.tsx) all mount
 *     the same real LinkedBankTransactionsPanel.tsx, which reads real
 *     banking.bank_transactions rows via getBankTransactionsByLinkage (Law §9 reverse drill,
 *     BLOCK-6b).
 *
 * reports.report.fuel_reconciliation / report.geofence_reconciliation and vendors.list.sync
 * are NOT tagged — no banking.bank_transactions/bank_accounts reference found on those
 * surfaces in this pass. Real remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["cash-flow","home","system"],"cols":["bank"],"leafRe":"^(hop\\.banking|jump\\.banking|hop\\.banking_recon)$","task":"WAVE-C-bank-hops-to-banking","vertical":"column-wave"}
 * @matrix-built {"modules":["form_425"],"cols":["bank"],"leafRe":"^law\\.virtual_banks_excluded$","task":"WAVE-C-bank-form425c","vertical":"column-wave"}
 * @matrix-built {"modules":["dispatch","fleet"],"cols":["bank"],"leafRe":"^(load\\.banking|unit\\.profile\\.bank_txns|trailer\\.profile\\.bank_txns)$","task":"WAVE-C-bank-linked-panel","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-bank-cross-module.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-bank-cross-module";

const CHECKS = [
  {
    name: "form-425c.routes.ts sources line 19 from real banking.bank_transactions",
    file: "apps/backend/src/compliance/form-425c.routes.ts",
    pattern: /FROM banking\.bank_transactions bt/,
  },
  {
    name: "LoadBankingLinkagePage.tsx mounts the real LinkedBankTransactionsPanel",
    file: "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
    pattern: /LinkedBankTransactionsPanel/,
  },
  {
    name: "VehicleProfilePage.tsx mounts the real LinkedBankTransactionsPanel",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /LinkedBankTransactionsPanel/,
  },
  {
    name: "TrailerProfilePage.tsx mounts the real LinkedBankTransactionsPanel",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /LinkedBankTransactionsPanel/,
  },
  {
    name: "LinkedBankTransactionsPanel.tsx reads real banking data via getBankTransactionsByLinkage",
    file: "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
    pattern: /getBankTransactionsByLinkage/,
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
    "apps/backend/src/compliance/form-425c.routes.ts": "FROM banking.bank_transactions bt JOIN ...",
    "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx": "<LinkedBankTransactionsPanel ... />",
    "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx": "<LinkedBankTransactionsPanel ... />",
    "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx": "<LinkedBankTransactionsPanel ... />",
    "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx": "getBankTransactionsByLinkage(companyId, { ... })",
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
console.log(`[${LABEL}] PASS — cross-module bank column wiring present (hops + form425c + LinkedBankTransactionsPanel mounts)`);
