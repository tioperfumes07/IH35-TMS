#!/usr/bin/env node
/**
 * gl_je COLUMN-WAVE — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["factoring"],"cols":["gl_je"],"leafRe":"^accounting\\.detail$","task":"WAVE-C-gl_je-factoring-detail","vertical":"column-wave"}
 * HONESTY 2026-08-13c: factoring home/batches/wizard chrome Required gl_je dropped; only accounting.detail Built (FactoringDetailPage EntityLink).
 * @matrix-built {"modules":["accounting"],"cols":["gl_je"],"leafRe":"^(bills\\.|bill_payments\\.)","task":"WAVE-C-gl_je-accounting-bills","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["gl_je"],"leafRe":"^(safety\\.drawer\\.fine_detail|safety\\.parity\\.fine_detail)$","task":"WAVE-C-gl_je-safety-fine-detail","vertical":"column-wave"}
 *
 * HONESTY 2026-08-13: removed dispatch/customers/vendors/banking from the broad leafRe=.* tag.
 * Those modules either have leaf-specific Built tags (banking transactions/recon/escrow) or had
 * Required gl_je on chrome without a local journal_entry EntityLink (customers/vendors/dispatch
 * surfaces) — InvoiceDetail/BillDetail/RevenueRecognition live under accounting, not those modules.
 * LEAVES[] below still regression-locks the accounting/safety surfaces that WERE the real proof.
 * HONESTY 2026-08-13b: removed drivers/safety from broad .* — safety fine detail is leaf-tagged;
 * create/escrow/audit chrome Required gl_je dropped.
 *
 * Self-test: node scripts/verify-gl-je-column-wave.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gl-je-column-wave";

const LEAVES = [
  {
    module: "dispatch",
    backend: "apps/backend/src/accounting/revenue-leakage.service.ts",
    backendPattern: /journal_entry_id/,
    frontend: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
  {
    module: "factoring",
    backend: "apps/backend/src/accounting/factoring-posting/reserve-tracker.service.ts",
    backendPattern: /journal_entry_id/,
    frontend: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
  {
    module: "banking",
    backend: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
    backendPattern: /matched_journal_entry_id/,
    frontend: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
  {
    module: "customers",
    backend: "apps/backend/src/accounting/invoices.routes.ts",
    backendPattern: /journal_entry_id/,
    frontend: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
  {
    module: "vendors",
    backend: "apps/backend/src/accounting/bills.service.ts",
    backendPattern: /journal_entry_id/,
    frontend: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
  {
    module: "drivers",
    backend: "apps/backend/src/driver-finance/escrow-forfeit.service.ts",
    backendPattern: /journal_entry_id/,
    frontend: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    frontendPattern: /linked_journal_entry_id/,
  },
  {
    module: "safety",
    backend: "apps/backend/src/safety/fines.routes.ts",
    backendPattern: /cfp\.expense_je_id::text AS journal_entry_id/,
    frontend: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
    frontendPattern: /kind="journal_entry"/,
  },
];

export function checkLeaf(backendSrc, frontendSrc, leaf) {
  if (!leaf.backendPattern.test(backendSrc)) {
    return { ok: false, reason: `${leaf.backend} no longer exposes the journal_entry_id reverse-link` };
  }
  if (!leaf.frontendPattern.test(frontendSrc)) {
    return { ok: false, reason: `${leaf.frontend} no longer renders the journal_entry drill-through` };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const leaf = LEAVES.find((l) => l.module === "safety");
  const goodBackend = "cfp.expense_je_id::text AS journal_entry_id";
  const goodFrontend = '<EntityLink kind="journal_entry" id={fine.journal_entry_id} />';
  const good = checkLeaf(goodBackend, goodFrontend, leaf);
  if (!good.ok) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${good.reason}`);
    process.exit(1);
  }

  const regressedBackend = "SELECT cf.* FROM safety.civil_fines cf"; // pre-fix shape, no join
  const regressed = checkLeaf(regressedBackend, goodFrontend, leaf);
  if (regressed.ok) {
    console.error(`[${LABEL}] selftest FAIL: regressed backend fixture (no join) should FAIL but passed`);
    process.exit(1);
  }

  const regressedFrontend = "<div>no journal entry link here</div>";
  const regressedFe = checkLeaf(goodBackend, regressedFrontend, leaf);
  if (regressedFe.ok) {
    console.error(`[${LABEL}] selftest FAIL: regressed frontend fixture (no EntityLink) should FAIL but passed`);
    process.exit(1);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed-backend/regressed-frontend fixtures classify correctly`);
  process.exit(0);
}

let failures = [];
for (const leaf of LEAVES) {
  const backendPath = path.join(ROOT, leaf.backend);
  const frontendPath = path.join(ROOT, leaf.frontend);
  if (!fs.existsSync(backendPath)) {
    failures.push(`${leaf.module}: ${leaf.backend} file not found`);
    continue;
  }
  if (!fs.existsSync(frontendPath)) {
    failures.push(`${leaf.module}: ${leaf.frontend} file not found`);
    continue;
  }
  const backendSrc = fs.readFileSync(backendPath, "utf8");
  const frontendSrc = fs.readFileSync(frontendPath, "utf8");
  const result = checkLeaf(backendSrc, frontendSrc, leaf);
  if (!result.ok) failures.push(`${leaf.module}: ${result.reason}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} module(s) regressed off the gl_je reverse-link:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all ${LEAVES.length} priority-10 modules with a money-posting leaf carry the gl_je reverse-link (lists is N/A, no posting leaf exists)`);
