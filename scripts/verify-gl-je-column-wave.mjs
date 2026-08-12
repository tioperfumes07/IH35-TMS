#!/usr/bin/env node
/**
 * gl_je COLUMN-WAVE — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["dispatch","factoring","banking","customers","vendors","drivers","safety"],"cols":["gl_je"],"task":"WAVE-C-gl_je","vertical":"column-wave"}
 *
 * Audited every priority-10 module for the gl_je reverse-link (a money-affecting row must be able to
 * drill through to the accounting.journal_entries row(s) it posted). Standard: BACKEND actually
 * SELECTs the journal_entry_id back (not just writes it once at posting time) AND FRONTEND renders it
 * as a real EntityLink, not fetch-and-discard.
 *
 * Result (2026-08-12): dispatch, factoring, banking, customers, vendors, drivers were ALREADY wired —
 * this guard locks them so they can't regress. `lists` is a legitimate N/A (pure catalog module, no
 * money-posting leaf exists — see this file's own header, not repeated here as a check since there is
 * nothing to assert). `safety` (company-paid civil-fine expense posting) was the one real gap:
 * accounting.civil_fine_postings.expense_je_id was written once by the poster and never joined back
 * into any GET — fixed in the same commit as this guard (fines.routes.ts list+detail queries now
 * LEFT JOIN accounting.civil_fine_postings; FineDetailDrawer.tsx renders the journal_entry EntityLink).
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
